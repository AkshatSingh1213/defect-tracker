import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { StatusBadge, SeverityBadge } from '../components/Badges';
import { formatDate, STATUSES } from '../utils/constants';

const CHART_COLORS = ['#0d9488', '#7c3aed', '#d97706', '#dc2626', '#3b82d4', '#16a34a', '#475569'];

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

export default function PMDashboard() {
  const navigate = useNavigate();
  const [defects, setDefects] = useState([]);
  const [stats, setStats] = useState(null);
  const [projects, setProjects] = useState([]);
  const [modules, setModules] = useState([]);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('defects');

  const inputStyle = {
    padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6,
    fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-primary)', minWidth: 130,
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
    try {
      const [defectsRes, statsRes] = await Promise.all([
        api.get('/defects?' + params.toString()),
        api.get('/defects/stats'),
      ]);
      setDefects(defectsRes.data);
      setStats(statsRes.data);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { api.get('/projects').then(r => setProjects(r.data)); }, []);
  useEffect(() => {
    if (filters.project_id) {
      api.get(`/projects/${filters.project_id}/modules`).then(r => setModules(r.data));
    } else {
      setModules([]);
    }
  }, [filters.project_id]);

  const handleExport = async () => {
    const res = await api.get('/defects/export/csv', { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url; a.download = 'defects.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const tabStyle = (active) => ({
    padding: '8px 20px', border: 'none',
    background: active ? '#7c3aed' : 'transparent',
    color: active ? 'white' : 'var(--text-secondary)', borderRadius: 6,
    fontWeight: active ? 600 : 400, cursor: 'pointer', fontSize: 14,
  });

  const totalDefects = defects.length;
  const openCount = defects.filter(d => ['Open', 'Reopen'].includes(d.status)).length;
  const needClarCount = defects.filter(d => d.status === 'Need Clarification').length;
  const closedCount = defects.filter(d => d.status === 'Closed').length;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>PM Dashboard</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 2 }}>Full visibility across all defects and teams</p>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Total Defects" value={totalDefects} color="#7c3aed" />
        <StatCard label="Open / Reopen" value={openCount} color="#94a3b8" />
        <StatCard label="Need Clarification" value={needClarCount} color="#d97706" />
        <StatCard label="Closed" value={closedCount} color="#16a34a" />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, background: 'var(--hover-bg)', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={tabStyle(activeTab === 'defects')} onClick={() => setActiveTab('defects')}>Defect List</button>
            <button style={tabStyle(activeTab === 'charts')} onClick={() => setActiveTab('charts')}>Charts & Analytics</button>
          </div>
          {activeTab === 'defects' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select style={inputStyle} value={filters.project_id || ''} onChange={e => setFilters(f => ({ ...f, project_id: e.target.value, module_id: '' }))}>
                <option value="">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select style={inputStyle} value={filters.module_id || ''} onChange={e => setFilters(f => ({ ...f, module_id: e.target.value }))}>
                <option value="">All Modules</option>
                {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select style={inputStyle} value={filters.status || ''} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
                <option value="">All Statuses</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select style={inputStyle} value={filters.severity || ''} onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}>
                <option value="">All Severities</option>
                {['Sev1', 'Sev2', 'Sev3', 'Observation'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select style={inputStyle} value={filters.assigned_team || ''} onChange={e => setFilters(f => ({ ...f, assigned_team: e.target.value }))}>
                <option value="">All Teams</option>
                <option value="dev">Dev</option>
                <option value="fmw">FMW</option>
                <option value="mobility">Mobility</option>
              </select>
              <button onClick={handleExport} style={{
                padding: '8px 16px', background: '#7c3aed', color: 'white',
                border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>↓ Export CSV</button>
            </div>
          )}
        </div>

        {activeTab === 'defects' ? (
          loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['ID', 'Title', 'Project', 'Module', 'Severity', 'Status', 'Team', 'Raised By', 'Created'].map(h => (
                      <th key={h} style={{
                        padding: '10px 16px', textAlign: 'left', fontSize: 12,
                        fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase',
                        letterSpacing: '0.05em', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {defects.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>No defects found</td></tr>
                  ) : defects.map(d => (
                    <tr key={d.id}
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
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{d.module_name || '—'}</td>
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
          )
        ) : (
          <div style={{ padding: 24 }}>
            {!stats ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Loading charts...</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24 }}>
                <div style={{ background: 'var(--hover-bg)', borderRadius: 10, padding: 20, border: '1px solid var(--border)' }}>
                  <h4 style={{ marginBottom: 16, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Defects by Module</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={stats.byModule} margin={{ top: 4, right: 8, left: -20, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="module" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} angle={-30} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ background: 'var(--hover-bg)', borderRadius: 10, padding: 20, border: '1px solid var(--border)' }}>
                  <h4 style={{ marginBottom: 16, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Defects by Status</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={stats.byStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80}
                        label={({ status, percent }) => `${status} ${(percent * 100).toFixed(0)}%`} labelLine={true}>
                        {stats.byStatus.map((entry, index) => (
                          <Cell key={entry.status} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ background: 'var(--hover-bg)', borderRadius: 10, padding: 20, border: '1px solid var(--border)' }}>
                  <h4 style={{ marginBottom: 16, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Defects by Team</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={stats.byTeam.map(t => ({ ...t, team: t.team?.toUpperCase() }))} margin={{ top: 4, right: 8, left: -20, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="team" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {stats.byTeam.map((entry, index) => (
                          <Cell key={entry.team} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ background: 'var(--hover-bg)', borderRadius: 10, padding: 20, border: '1px solid var(--border)' }}>
                  <h4 style={{ marginBottom: 16, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Defects Raised Over Time</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={stats.overTime.map(d => ({ ...d, date: new Date(d.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) }))} margin={{ top: 4, right: 8, left: -20, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="count" stroke="#7c3aed" strokeWidth={2} dot={{ r: 4, fill: '#7c3aed' }} name="Defects" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
