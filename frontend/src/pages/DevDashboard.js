import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { StatusBadge, SeverityBadge } from '../components/Badges';
import { formatDate, TEAM_LABELS, getAvailableTransitions } from '../utils/constants';

const StatCard = ({ label, value, color }) => (
  <div style={{
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '20px 24px', flex: 1, minWidth: 140,
    borderTop: `3px solid ${color}`,
  }}>
    <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{label}</div>
  </div>
);

export default function DevDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [defects, setDefects] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDefects = async () => {
    setLoading(true);
    try {
      const res = await api.get('/defects');
      setDefects(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDefects(); }, []);

  const stats = {
    total: defects.length,
    open: defects.filter(d => d.status === 'Open').length,
    reopen: defects.filter(d => d.status === 'Reopen').length,
    retest: defects.filter(d => d.status === 'Retest').length,
  };

  const handleStatusChange = async (defectId, status) => {
    try {
      await api.patch(`/defects/${defectId}/status`, { status });
      fetchDefects();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update status');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Developer Dashboard</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 2 }}>
          Team: <strong style={{ textTransform: 'uppercase', color: '#7c3aed' }}>{TEAM_LABELS[user?.team] || user?.team}</strong> — Assigned defects
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Total Assigned" value={stats.total} color="#7c3aed" />
        <StatCard label="Open" value={stats.open} color="#94a3b8" />
        <StatCard label="Reopen" value={stats.reopen} color="#ef4444" />
        <StatCard label="In Retest" value={stats.retest} color="#3b82f6" />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            Defects assigned to my team ({defects.length})
          </h3>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>
        ) : defects.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>No defects assigned to your team</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['ID', 'Title', 'Project', 'Severity', 'Status', 'Quick Action', 'Created'].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left', fontSize: 12,
                      fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase',
                      letterSpacing: '0.05em', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {defects.map(d => {
                  const transitions = getAvailableTransitions('developer', d.status);
                  return (
                    <tr
                      key={d.id}
                      style={{ borderBottom: '1px solid var(--border-light)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>#{d.id}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{ fontSize: 14, fontWeight: 500, cursor: 'pointer', color: '#3b82d4' }}
                          onClick={() => navigate(`/defects/${d.id}`)}
                        >
                          {d.title}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{d.project_name}</td>
                      <td style={{ padding: '12px 16px' }}><SeverityBadge severity={d.severity} /></td>
                      <td style={{ padding: '12px 16px' }}><StatusBadge status={d.status} /></td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {transitions.map(s => {
                            // Need Clarification requires QA picker — open defect detail instead
                            if (s === 'Need Clarification') {
                              return (
                                <button
                                  key={s}
                                  onClick={() => navigate(`/defects/${d.id}`)}
                                  title="Open defect to select QA for clarification"
                                  style={{
                                    padding: '3px 10px', fontSize: 11, borderRadius: 4,
                                    border: '1px solid #fcd34d', background: '#fef3c7',
                                    color: '#b45309', cursor: 'pointer', fontWeight: 500,
                                    whiteSpace: 'nowrap',
                                  }}
                                >→ {s} ↗</button>
                              );
                            }
                            return (
                              <button
                                key={s}
                                onClick={() => handleStatusChange(d.id, s)}
                                style={{
                                  padding: '3px 10px', fontSize: 11, borderRadius: 4,
                                  border: '1px solid var(--border)', background: 'var(--hover-bg)',
                                  color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500,
                                  whiteSpace: 'nowrap',
                                }}
                              >→ {s}</button>
                            );
                          })}
                          {transitions.length === 0 && (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No quick actions</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(d.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
