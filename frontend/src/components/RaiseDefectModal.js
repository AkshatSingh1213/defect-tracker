import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function RaiseDefectModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    title: '', project_id: '', module_id: '', environment: 'SIT',
    severity: 'Sev3', steps_to_reproduce: '', assigned_team: 'dev',
  });
  const [files, setFiles] = useState([]);
  const [projects, setProjects] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/projects').then(r => setProjects(r.data));
  }, []);

  useEffect(() => {
    if (form.project_id) {
      api.get(`/projects/${form.project_id}/modules`).then(r => setModules(r.data));
    } else {
      setModules([]);
    }
  }, [form.project_id]);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleFileChange = e => setFiles(Array.from(e.target.files));
  const removeFile = (idx) => setFiles(f => f.filter((_, i) => i !== idx));

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      files.forEach(f => fd.append('attachments', f));
      const res = await api.post('/defects', fd);
      onSuccess(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to raise defect');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid var(--border)',
    borderRadius: 6, fontSize: 14, outline: 'none',
    background: 'var(--input-bg)', color: 'var(--text-primary)', transition: 'border-color 0.15s',
  };
  const labelStyle = { display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13, color: 'var(--text-secondary)' };
  const fieldStyle = { marginBottom: 16 };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      zIndex: 1000, padding: '40px 16px', overflowY: 'auto',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 600,
        border: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Raise New Defect</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>Fill in the defect details below</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}>✕</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          {error && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#dc2626', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={fieldStyle}>
            <label style={labelStyle}>Title <span style={{ color: '#dc2626' }}>*</span></label>
            <input style={inputStyle} name="title" value={form.title} onChange={handleChange} placeholder="Brief description of the defect" required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Project <span style={{ color: '#dc2626' }}>*</span></label>
              <select style={inputStyle} name="project_id" value={form.project_id} onChange={handleChange} required>
                <option value="">Select project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Module</label>
              <select style={inputStyle} name="module_id" value={form.module_id} onChange={handleChange}>
                <option value="">Select module</option>
                {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Environment <span style={{ color: '#dc2626' }}>*</span></label>
              <select style={inputStyle} name="environment" value={form.environment} onChange={handleChange} required>
                {['SIT', 'UAT', 'PROD'].map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Severity <span style={{ color: '#dc2626' }}>*</span></label>
              <select style={inputStyle} name="severity" value={form.severity} onChange={handleChange} required>
                {['Sev1', 'Sev2', 'Sev3', 'Observation'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Assign to Team <span style={{ color: '#dc2626' }}>*</span></label>
              <select style={inputStyle} name="assigned_team" value={form.assigned_team} onChange={handleChange} required>
                <option value="dev">Dev</option>
                <option value="fmw">FMW</option>
                <option value="mobility">Mobility</option>
              </select>
            </div>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Steps to Reproduce</label>
            <textarea
              style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
              name="steps_to_reproduce"
              value={form.steps_to_reproduce}
              onChange={handleChange}
              placeholder="1. Navigate to...&#10;2. Click on...&#10;3. Observe..."
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Attachments</label>
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}
              accept="image/*,application/pdf,.txt,.log,.zip"
            />
            {files.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {files.map((f, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--hover-bg)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '6px 10px',
                  }}>
                    <span style={{ fontSize: 16 }}>📎</span>
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} KB</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 14, flexShrink: 0 }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{
              padding: '10px 20px', background: 'var(--hover-bg)', border: '1px solid var(--border)',
              borderRadius: 6, fontSize: 14, color: 'var(--text-primary)', fontWeight: 500, cursor: 'pointer',
            }}>Cancel</button>
            <button type="submit" disabled={loading} style={{
              padding: '10px 20px', background: '#0d9488', border: 'none',
              borderRadius: 6, fontSize: 14, color: 'white', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}>
              {loading ? 'Raising...' : 'Raise Defect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
