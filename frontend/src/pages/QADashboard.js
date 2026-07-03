import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { StatusBadge, SeverityBadge } from '../components/Badges';
import RaiseDefectModal from '../components/RaiseDefectModal';
import { formatDate } from '../utils/constants';

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

export default function QADashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [defects, setDefects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRaise, setShowRaise] = useState(false);

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

  const myDefects = defects.filter(d => d.raised_by_user_id === user?.id);
  const stats = {
    total: myDefects.length,
    open: myDefects.filter(d => d.status === 'Open').length,
    needClarification: myDefects.filter(d => d.status === 'Need Clarification').length,
    retest: myDefects.filter(d => d.status === 'Retest').length,
    closed: myDefects.filter(d => d.status === 'Closed').length,
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>QA Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 2 }}>Welcome back, {user?.name}</p>
        </div>
        <button
          onClick={() => setShowRaise(true)}
          style={{
            padding: '10px 20px', background: '#0d9488', color: 'white',
            border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span style={{ fontSize: 18 }}>+</span> Raise Defect
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Total Raised" value={stats.total} color="#0d9488" />
        <StatCard label="Open" value={stats.open} color="#94a3b8" />
        <StatCard label="Need Clarification" value={stats.needClarification} color="#d97706" />
        <StatCard label="In Retest" value={stats.retest} color="#3b82f6" />
        <StatCard label="Closed" value={stats.closed} color="#16a34a" />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>My Defects</h3>
          <span style={{ fontSize: 12, background: 'var(--border)', borderRadius: 10, padding: '1px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>{myDefects.length}</span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading defects...</div>
        ) : myDefects.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🐛</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>No defects raised yet</div>
            <button onClick={() => setShowRaise(true)} style={{
              marginTop: 8, padding: '10px 24px', background: '#0d9488', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
            }}>Raise your first defect</button>
          </div>
        ) : (
          <DefectTable defects={myDefects} onRowClick={id => navigate(`/defects/${id}`)} />
        )}
      </div>

      {showRaise && (
        <RaiseDefectModal
          onClose={() => setShowRaise(false)}
          onSuccess={() => fetchDefects()}
        />
      )}
    </div>
  );
}

function DefectTable({ defects, onRowClick }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['ID', 'Title', 'Project', 'Module', 'Severity', 'Status', 'Team', 'Created'].map(h => (
              <th key={h} style={{
                padding: '10px 16px', textAlign: 'left', fontSize: 12,
                fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase',
                letterSpacing: '0.05em', whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {defects.map(d => (
            <tr
              key={d.id}
              onClick={() => onRowClick(d.id)}
              style={{ borderBottom: '1px solid var(--border-light)', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>#{d.id}</td>
              <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500, maxWidth: 200, color: 'var(--text-primary)' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', whiteSpace: 'nowrap' }}>{d.title}</span>
              </td>
              <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{d.project_name || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{d.module_name || '—'}</td>
              <td style={{ padding: '12px 16px' }}><SeverityBadge severity={d.severity} /></td>
              <td style={{ padding: '12px 16px' }}><StatusBadge status={d.status} /></td>
              <td style={{ padding: '12px 16px', fontSize: 13, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{d.assigned_team}</td>
              <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(d.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
