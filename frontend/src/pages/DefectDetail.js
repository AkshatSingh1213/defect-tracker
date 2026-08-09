import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { StatusBadge, SeverityBadge } from '../components/Badges';
import {
  STATUS_COLORS, formatDate, getInitials, ROLE_COLORS,
  getAvailableTransitions, needsClarificationTarget, needsTeamReassign, STATUSES,
} from '../utils/constants';

// ── Status Change Control ──────────────────────────────────────────────────────
const StatusChangeControl = ({ defect, onStatusChange, userRole }) => {
  const [step, setStep] = useState(null);
  const [pendingStatus, setPendingStatus] = useState('');
  const [note, setNote] = useState('');
  const [clarifyUserId, setClarifyUserId] = useState('');
  const [teamValue, setTeamValue] = useState(defect.assigned_team || 'dev');
  const [qaUsers, setQaUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  const transitions = getAvailableTransitions(userRole, defect.status);
  if (transitions.length === 0) return null;

  const handlePickStatus = async (s) => {
    setPendingStatus(s);
    setNote('');
    setClarifyUserId('');
    setTeamValue(defect.assigned_team || 'dev');

    if (needsClarificationTarget(s)) {
      try {
        const res = await api.get('/users?role=qa');
        setQaUsers(res.data);
      } catch { setQaUsers([]); }
      setStep('clarify');
    } else if (needsTeamReassign(s, defect.status)) {
      setStep('team');
    } else {
      setStep('confirm');
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const payload = { status: pendingStatus, note: note || undefined };
      if (pendingStatus === 'Need Clarification') payload.clarification_assigned_to = clarifyUserId;
      if (needsTeamReassign(pendingStatus, defect.status)) payload.assigned_team = teamValue;
      await onStatusChange(payload);
      setStep(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', border: '1px solid var(--border)',
    borderRadius: 6, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-primary)',
  };

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        Change Status
      </div>

      {!step ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {transitions.map(s => {
            const color = STATUS_COLORS[s] || {};
            return (
              <button
                key={s}
                onClick={() => handlePickStatus(s)}
                style={{
                  padding: '5px 12px', borderRadius: 6,
                  border: `1px solid ${color.border || 'var(--border)'}`,
                  background: color.bg || 'var(--hover-bg)',
                  color: color.text || 'var(--text-primary)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >→ {s}</button>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            Changing to: <StatusBadge status={pendingStatus} />
          </div>

          {step === 'clarify' && (
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Assign clarification to QA *</label>
              <select value={clarifyUserId} onChange={e => setClarifyUserId(e.target.value)} style={inputStyle}>
                <option value="">Select QA person...</option>
                {qaUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}

          {step === 'team' && (
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Reassign to team *</label>
              <select value={teamValue} onChange={e => setTeamValue(e.target.value)} style={inputStyle}>
                <option value="dev">Dev</option>
                <option value="fmw">FMW</option>
                <option value="mobility">Mobility</option>
              </select>
            </div>
          )}

          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Add a note (optional)..."
            style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleConfirm}
              disabled={loading || (step === 'clarify' && !clarifyUserId)}
              style={{
                flex: 1, padding: '7px', background: '#0d9488', color: 'white',
                border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                opacity: (loading || (step === 'clarify' && !clarifyUserId)) ? 0.6 : 1,
              }}
            >{loading ? 'Updating...' : 'Confirm'}</button>
            <button
              onClick={() => setStep(null)}
              style={{
                padding: '7px 12px', background: 'var(--hover-bg)', border: '1px solid var(--border)',
                borderRadius: 6, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)',
              }}
            >Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Reassign Team Control (Developer + Admin) ─────────────────────────────────
const ReassignTeamControl = ({ defect, onReassign, userRole }) => {
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState(defect.assigned_team || 'dev');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (userRole !== 'developer' && userRole !== 'admin') return null;

  const TEAMS = [
    { value: 'dev', label: 'Dev' },
    { value: 'fmw', label: 'FMW' },
    { value: 'mobility', label: 'Mobility' },
  ];

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      await onReassign(team);
      setOpen(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Reassignment failed');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', border: '1px solid var(--border)',
    borderRadius: 6, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-primary)',
  };

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        Reassign Team
      </div>
      {!open ? (
        <button
          onClick={() => { setTeam(defect.assigned_team || 'dev'); setError(''); setOpen(true); }}
          style={{
            padding: '5px 12px', borderRadius: 6, border: '1px solid #7c3aed',
            background: '#f5f3ff', color: '#7c3aed',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >🔀 Reassign to another team</button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {error && (
            <div style={{ fontSize: 11, color: '#dc2626', background: '#fee2e2', padding: '6px 8px', borderRadius: 5, border: '1px solid #fca5a5' }}>
              {error}
            </div>
          )}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
              Assign to team <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(currently: {(defect.assigned_team || '—').toUpperCase()})</span>
            </label>
            <select value={team} onChange={e => setTeam(e.target.value)} style={inputStyle}>
              {TEAMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleConfirm}
              disabled={loading || team === defect.assigned_team}
              style={{
                flex: 1, padding: '7px', background: '#7c3aed', color: 'white',
                border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                opacity: (loading || team === defect.assigned_team) ? 0.5 : 1,
              }}
            >{loading ? 'Reassigning...' : 'Confirm Reassign'}</button>
            <button
              onClick={() => setOpen(false)}
              style={{
                padding: '7px 12px', background: 'var(--hover-bg)', border: '1px solid var(--border)',
                borderRadius: 6, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)',
              }}
            >Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Edit Defect Form ───────────────────────────────────────────────────────────
const EditDefectForm = ({ defect, onSave, onCancel }) => {
  const [form, setForm] = useState({
    title: defect.title,
    environment: defect.environment,
    severity: defect.severity,
    steps_to_reproduce: defect.steps_to_reproduce || '',
    assigned_team: defect.assigned_team,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onSave(form);
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', border: '1px solid var(--border)',
    borderRadius: 6, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-primary)',
  };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };

  return (
    <form onSubmit={handleSubmit} style={{ padding: 16, background: 'var(--hover-bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Edit Defect</div>
      {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 10px', borderRadius: 6, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Title *</label>
        <input style={inputStyle} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Environment</label>
          <select style={inputStyle} value={form.environment} onChange={e => setForm(f => ({ ...f, environment: e.target.value }))}>
            {['SIT', 'UAT', 'PROD'].map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Severity</label>
          <select style={inputStyle} value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
            {['Sev1', 'Sev2', 'Sev3', 'Observation'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Assigned Team</label>
        <select style={inputStyle} value={form.assigned_team} onChange={e => setForm(f => ({ ...f, assigned_team: e.target.value }))}>
          <option value="dev">Dev</option>
          <option value="fmw">FMW</option>
          <option value="mobility">Mobility</option>
        </select>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Steps to Reproduce</label>
        <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.steps_to_reproduce} onChange={e => setForm(f => ({ ...f, steps_to_reproduce: e.target.value }))} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={loading} style={{ flex: 1, padding: '8px', background: '#0d9488', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
        <button type="button" onClick={onCancel} style={{ padding: '8px 14px', background: 'var(--hover-bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)' }}>
          Cancel
        </button>
      </div>
    </form>
  );
};

// ── Attachments Panel ──────────────────────────────────────────────────────────
const AttachmentsPanel = ({ defectId, attachments, currentUser, onRefresh }) => {
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState([]);
  const fileRef = useRef(null);

  const apiBase = process.env.REACT_APP_API_URL?.replace('/api', '') || '';
  const isImage = (name) => /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(name);

  const handleUpload = async () => {
    if (!files.length) return;
    setUploading(true);
    const fd = new FormData();
    files.forEach(f => fd.append('attachments', f));
    try {
      await api.post(`/defects/${defectId}/attachments`, fd);
      setFiles([]);
      if (fileRef.current) fileRef.current.value = '';
      onRefresh();
    } catch (err) {
      alert(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (attId) => {
    if (!window.confirm('Delete this attachment?')) return;
    try {
      await api.delete(`/defects/${defectId}/attachments/${attId}`);
      onRefresh();
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  const canDelete = (att) =>
    currentUser?.role === 'pm' || currentUser?.role === 'admin' || att.uploaded_by === currentUser?.id;

  const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' };

  return (
    <div>
      <span style={labelStyle}>Attachments ({attachments.length})</span>

      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {attachments.map(a => {
            const fileUrl = `${apiBase}/uploads/${a.file_path}`;
            return (
              <div key={a.id} style={{
                border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden',
                background: 'var(--hover-bg)',
              }}>
                {isImage(a.file_name) && (
                  <a href={fileUrl} target="_blank" rel="noreferrer">
                    <img src={fileUrl} alt={a.file_name} style={{ width: '100%', maxHeight: 80, objectFit: 'cover', display: 'block' }} />
                  </a>
                )}
                <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>{isImage(a.file_name) ? '🖼' : '📎'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.file_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{a.uploaded_by_name} · {formatDate(a.uploaded_at)}</div>
                  </div>
                  <a href={fileUrl} download={a.file_name} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#3b82d4', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>↓</a>
                  {canDelete(a) && (
                    <button onClick={() => handleDelete(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 12, flexShrink: 0 }}>✕</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload new files */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.txt,.log,.zip"
          onChange={e => setFiles(Array.from(e.target.files))}
          style={{ fontSize: 11, color: 'var(--text-secondary)' }}
        />
        {files.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {files.map((f, i) => (
              <span key={i} style={{ fontSize: 10, background: 'var(--hover-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', color: 'var(--text-secondary)' }}>
                {f.name}
              </span>
            ))}
          </div>
        )}
        {files.length > 0 && (
          <button onClick={handleUpload} disabled={uploading} style={{
            padding: '6px 12px', background: '#0d9488', color: 'white', border: 'none',
            borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            opacity: uploading ? 0.6 : 1, alignSelf: 'flex-start',
          }}>
            {uploading ? 'Uploading...' : `Upload ${files.length} file${files.length > 1 ? 's' : ''}`}
          </button>
        )}
      </div>
    </div>
  );
};

// ── Collapsible section ────────────────────────────────────────────────────────
const CollapsibleSection = ({ title, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: '1px solid var(--border)', marginTop: 10 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', padding: '8px 0',
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        {title}
        <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div style={{ paddingBottom: 8 }}>{children}</div>}
    </div>
  );
};

// ── Info Panel ─────────────────────────────────────────────────────────────────
const InfoPanel = ({ defect, onStatusChange, onEditSave, onReassign, userRole, currentUser }) => {
  const [editing, setEditing] = useState(false);

  const canEdit =
    userRole === 'admin' || userRole === 'pm' ||
    (userRole === 'qa' && defect.raised_by_user_id === currentUser?.id);

  const fieldStyle = { marginBottom: 10 };
  const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3, display: 'block' };
  const valueStyle = { fontSize: 13, color: 'var(--text-primary)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Title bar */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Defect #{defect.id}</div>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>{defect.title}</h2>
        {defect.edited_at && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>Edited {formatDate(defect.edited_at)}</div>
        )}
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} style={{
            marginTop: 8, padding: '4px 10px', background: 'var(--hover-bg)', border: '1px solid var(--border)',
            borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 500, color: 'var(--text-secondary)',
          }}>✏ Edit</button>
        )}
      </div>

      <div style={{ padding: '12px 16px', flex: 1, overflowY: 'auto' }}>
        {editing ? (
          <EditDefectForm
            defect={defect}
            onSave={async (form) => {
              await onEditSave(form);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            {/* ── Always-visible top section ──────────────────────────────── */}
            <div style={fieldStyle}>
              <span style={labelStyle}>Status</span>
              <StatusBadge status={defect.status} size="lg" />
              {defect.status === 'Need Clarification' && defect.clarification_assigned_to_name && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
                  Awaiting: <strong>{defect.clarification_assigned_to_name}</strong>
                </div>
              )}
            </div>
            <div style={fieldStyle}>
              <span style={labelStyle}>Severity</span>
              <SeverityBadge severity={defect.severity} size="lg" />
            </div>
            <div style={fieldStyle}>
              <span style={labelStyle}>Environment</span>
              <span style={{
                ...valueStyle, display: 'inline-block', padding: '2px 10px',
                background: '#dbeafe', color: '#1d4ed8', borderRadius: 4, fontWeight: 600, fontSize: 12,
              }}>{defect.environment}</span>
            </div>
            <div style={fieldStyle}>
              <span style={labelStyle}>Project</span>
              <span style={valueStyle}>{defect.project_name || '—'}</span>
            </div>
            <div style={fieldStyle}>
              <span style={labelStyle}>Assigned Team</span>
              <span style={{ ...valueStyle, textTransform: 'uppercase', fontWeight: 600, color: '#7c3aed', fontSize: 12 }}>
                {defect.assigned_team}
              </span>
            </div>
            <div style={fieldStyle}>
              <span style={labelStyle}>Raised By</span>
              <span style={valueStyle}>{defect.raised_by_name || '—'}</span>
            </div>

            {/* ── Attachments — visible without scrolling ──────────────── */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <AttachmentsPanel
                defectId={defect.id}
                attachments={defect.attachments || []}
                currentUser={currentUser}
                onRefresh={() => window.location.reload()}
              />
            </div>

            {/* ── Status Change Control ────────────────────────────────── */}
            <StatusChangeControl defect={defect} onStatusChange={onStatusChange} userRole={userRole} />

            {/* ── Reassign Team Control (developer + admin only) ───────── */}
            <ReassignTeamControl defect={defect} onReassign={onReassign} userRole={userRole} />

            {/* ── Collapsible: less-frequent details ───────────────────── */}
            <CollapsibleSection title="More Details">
              <div style={{ paddingTop: 4 }}>
                <div style={{ ...fieldStyle, marginBottom: 8 }}>
                  <span style={labelStyle}>Created</span>
                  <span style={{ ...valueStyle, fontSize: 12, color: 'var(--text-secondary)' }}>{formatDate(defect.created_at)}</span>
                </div>
                <div style={{ ...fieldStyle, marginBottom: 8 }}>
                  <span style={labelStyle}>Last Updated</span>
                  <span style={{ ...valueStyle, fontSize: 12, color: 'var(--text-secondary)' }}>{formatDate(defect.updated_at)}</span>
                </div>
                {defect.steps_to_reproduce && (
                  <div style={{ marginBottom: 8 }}>
                    <span style={labelStyle}>Steps to Reproduce</span>
                    <pre style={{
                      fontSize: 11, color: 'var(--text-primary)', background: 'var(--bg)',
                      borderRadius: 6, padding: 10, whiteSpace: 'pre-wrap',
                      border: '1px solid var(--border)', lineHeight: 1.6,
                    }}>{defect.steps_to_reproduce}</pre>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          </>
        )}
      </div>
    </div>
  );
};

// ── Comment Thread ─────────────────────────────────────────────────────────────
const CommentThread = ({ comments, onAddComment, currentUser }) => {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!message.trim()) return;
    setLoading(true);
    try {
      await onAddComment(message.trim());
      setMessage('');
    } finally {
      setLoading(false);
    }
  };

  const roleColors = ROLE_COLORS;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          Comments <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({comments.length})</span>
        </h3>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {comments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 14 }}>
            No comments yet. Be the first to comment.
          </div>
        ) : (
          comments.map(c => {
            const isMine = c.user_id === currentUser?.id;
            const color = roleColors[c.user_role] || '#475569';
            return (
              <div key={c.id} style={{ display: 'flex', gap: 10, flexDirection: isMine ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: color, color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}>
                  {getInitials(c.user_name)}
                </div>
                <div style={{ maxWidth: '75%' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexDirection: isMine ? 'row-reverse' : 'row' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color }}>{c.user_name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(c.created_at)}</span>
                  </div>
                  <div style={{
                    padding: '10px 14px',
                    background: isMine ? '#0d9488' : 'var(--hover-bg)',
                    borderRadius: isMine ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    border: `1px solid ${isMine ? '#0d9488' : 'var(--border)'}`,
                    fontSize: 13,
                    color: isMine ? 'white' : 'var(--text-primary)',
                    lineHeight: 1.5, wordBreak: 'break-word',
                  }}>
                    {c.message}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: roleColors[currentUser?.role] || '#475569',
            color: 'white', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
          }}>
            {getInitials(currentUser?.name || '')}
          </div>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Add a comment..."
            rows={2}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
            style={{
              flex: 1, padding: '10px 12px', border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 13, resize: 'none', outline: 'none',
              lineHeight: 1.5, background: 'var(--input-bg)', color: 'var(--text-primary)',
            }}
          />
          <button
            type="submit"
            disabled={loading || !message.trim()}
            style={{
              padding: '10px 16px', background: '#0d9488', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
              fontSize: 13, opacity: (loading || !message.trim()) ? 0.6 : 1, flexShrink: 0,
            }}
          >Send</button>
        </form>
      </div>
    </div>
  );
};

// ── Audit Trail ────────────────────────────────────────────────────────────────
const AuditTrail = ({ auditLog }) => {
  return (
    <div>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          Audit Trail <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({auditLog.length})</span>
        </h3>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {auditLog.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>No history yet</div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: 28 }}>
            <div style={{
              position: 'absolute', left: 7, top: 4, bottom: 4,
              width: 2, background: 'var(--border)',
            }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {auditLog.map((entry) => {
                const isEdit = entry.note?.startsWith('Defect edited by');
                const isReassign = entry.note?.startsWith('Reassigned from');
                const newColors = STATUS_COLORS[entry.new_status] || { bg: 'var(--hover-bg)', text: 'var(--text-secondary)', border: 'var(--border)', dot: 'var(--text-muted)' };
                const oldColors = STATUS_COLORS[entry.old_status] || { bg: 'var(--hover-bg)', text: 'var(--text-secondary)', border: 'var(--border)' };
                const dotColor = isReassign ? '#7c3aed' : isEdit ? '#94a3b8' : (newColors.dot || newColors.text);

                return (
                  <div key={entry.id} style={{ display: 'flex', gap: 12, paddingBottom: 18, position: 'relative' }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                      background: dotColor,
                      border: `2px solid var(--surface)`,
                      marginLeft: -21, zIndex: 1, marginTop: 3,
                      boxShadow: `0 0 0 2px ${dotColor}40`,
                    }} />
                    <div style={{ flex: 1 }}>
                      {isReassign ? (
                        <div style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>
                          🔀 {entry.note}
                        </div>
                      ) : isEdit ? (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          ✏ {entry.note}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', marginBottom: 2 }}>
                          {entry.old_status && entry.old_status !== entry.new_status ? (
                            <>
                              <span style={{
                                padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                                background: oldColors.bg, color: oldColors.text, border: `1px solid ${oldColors.border}`,
                              }}>{entry.old_status}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→</span>
                            </>
                          ) : null}
                          <span style={{
                            padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                            background: newColors.bg, color: newColors.text, border: `1px solid ${newColors.border}`,
                          }}>{entry.new_status}</span>
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>
                        by {entry.changed_by_name || 'System'}
                      </div>
                      {entry.note && !isEdit && !isReassign && (
                        <div style={{
                          marginTop: 4, fontSize: 11, color: 'var(--text-secondary)',
                          background: 'var(--hover-bg)', padding: '4px 8px',
                          borderRadius: 5, border: '1px solid var(--border)',
                        }}>"{entry.note}"</div>
                      )}
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        {formatDate(entry.changed_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function DefectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [defect, setDefect] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const fetchDefect = async () => {
    try {
      const res = await api.get(`/defects/${id}`);
      setDefect(res.data);
    } catch {
      setError('Defect not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDefect(); }, [id]);

  const handleStatusChange = async (payload) => {
    await api.patch(`/defects/${id}/status`, payload);
    fetchDefect();
    showToast('Status updated successfully');
  };

  const handleEditSave = async (form) => {
    await api.patch(`/defects/${id}`, form);
    fetchDefect();
    showToast('Defect saved successfully');
  };

  const handleTeamReassign = async (assigned_team) => {
    await api.patch(`/defects/${id}/team`, { assigned_team });
    fetchDefect();
    showToast(`Defect reassigned to ${assigned_team.toUpperCase()}`);
  };

  const handleAddComment = async (message) => {
    await api.post(`/defects/${id}/comments`, { message });
    fetchDefect();
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-secondary)' }}>
      Loading defect...
    </div>
  );

  if (error || !defect) return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>{error || 'Defect not found'}</div>
      <button onClick={() => navigate('/defects')} style={{
        padding: '10px 20px', background: '#0d9488', color: 'white',
        border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
      }}>Back to Defects</button>
    </div>
  );

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 70, right: 24, zIndex: 999,
          background: '#0d9488', color: 'white', padding: '10px 18px',
          borderRadius: 8, fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>{toast}</div>
      )}

      {/* Breadcrumb */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
        <span style={{ cursor: 'pointer', color: '#3b82d4' }} onClick={() => navigate('/defects')}>All Defects</span>
        <span>/</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Defect #{id}</span>
      </div>

      {/* 3-panel layout */}
      <div
        className="three-col-layout"
        style={{
          display: 'grid',
          gridTemplateColumns: '280px 1fr 260px',
          gap: 16,
          minHeight: 'calc(100vh - 160px)',
          alignItems: 'start',
        }}
      >
        {/* Left — Info Panel */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          position: 'sticky', top: 16,
          maxHeight: 'calc(100vh - 120px)', overflowY: 'auto',
        }}>
          <InfoPanel
            defect={defect}
            onStatusChange={handleStatusChange}
            onEditSave={handleEditSave}
            onReassign={handleTeamReassign}
            userRole={user?.role}
            currentUser={user}
          />
        </div>

        {/* Center — Comment Thread */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          minHeight: 500, maxHeight: 'calc(100vh - 120px)',
        }}>
          <CommentThread
            comments={defect.comments || []}
            onAddComment={handleAddComment}
            currentUser={user}
          />
        </div>

        {/* Right — Audit Trail */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, overflow: 'hidden',
          overflowY: 'auto',
          position: 'sticky', top: 16,
          maxHeight: 'calc(100vh - 120px)',
        }}>
          <AuditTrail auditLog={defect.audit_log || []} />
        </div>
      </div>
    </div>
  );
}
