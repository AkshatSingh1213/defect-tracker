import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { StatusBadge, SeverityBadge } from '../components/Badges';
import { formatDate, STATUSES } from '../utils/constants';

export default function DefectList() {
  const navigate = useNavigate();
  const [defects, setDefects] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    project_id: '', status: '', severity: '', assigned_team: '',
  });

  useEffect(() => {
    api.get('/projects').then(r => setProjects(r.data));
  }, []);

  const fetchDefects = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
    try {
      const res = await api.get('/defects?' + params.toString());
      setDefects(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDefects(); }, [filters]);

  const inputStyle = {
    padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6,
    fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-primary)',
  };

  const handleFilterChange = e => {
    const { name, value } = e.target;
    setFilters(f => ({ ...f, [name]: value }));
  };

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>All Defects</h1>
        <span style={{
          background: 'var(--hover-bg)', border: '1px solid var(--border)',
          borderRadius: 20, padding: '2px 10px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
        }}>{defects.length}</span>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {/* Filters */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select style={inputStyle} name="project_id" value={filters.project_id} onChange={handleFilterChange}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select style={inputStyle} name="status" value={filters.status} onChange={handleFilterChange}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select style={inputStyle} name="severity" value={filters.severity} onChange={handleFilterChange}>
            <option value="">All Severities</option>
            {['Sev1', 'Sev2', 'Sev3', 'Observation'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select style={inputStyle} name="assigned_team" value={filters.assigned_team} onChange={handleFilterChange}>
            <option value="">All Teams</option>
            <option value="dev">Dev</option>
            <option value="fmw">FMW</option>
            <option value="mobility">Mobility</option>
          </select>
          <button onClick={() => setFilters({ project_id: '', status: '', severity: '', assigned_team: '' })} style={{
            padding: '8px 14px', background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 6, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer',
          }}>Clear</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>
        ) : defects.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🔍</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>No defects found</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Try adjusting your filters or raise a new defect</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['ID', 'Title', 'Project', 'Severity', 'Status', 'Team', 'Raised By', 'Created'].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left', fontSize: 12,
                      fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase',
                      letterSpacing: '0.05em', whiteSpace: 'nowrap', background: 'var(--surface)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {defects.map(d => (
                  <tr
                    key={d.id}
                    onClick={() => navigate(`/defects/${d.id}`)}
                    style={{ borderBottom: '1px solid var(--border-light)', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>#{d.id}</td>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500, maxWidth: 200, color: 'var(--text-primary)' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', whiteSpace: 'nowrap' }}>{d.title}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{d.project_name || '—'}</td>
                    <td style={{ padding: '12px 16px' }}><SeverityBadge severity={d.severity} /></td>
                    <td style={{ padding: '12px 16px' }}><StatusBadge status={d.status} /></td>
                    <td style={{ padding: '12px 16px', fontSize: 13, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{d.assigned_team}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{d.raised_by_name || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
