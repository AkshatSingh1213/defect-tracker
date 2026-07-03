import React, { useState, useEffect } from 'react';
import api from '../services/api';

const ROLES = ['qa', 'developer', 'pm', 'admin'];
const TEAMS = ['dev', 'fmw', 'mobility'];

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [modules, setModules] = useState({});
  const [activeTab, setActiveTab] = useState('users');
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // user object being edited
  const [showModuleForm, setShowModuleForm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [userForm, setUserForm] = useState({
    name: '', username: '', password: '', role: 'qa', team: '', email: '', slack_user_id: '',
  });
  const [editForm, setEditForm] = useState({
    name: '', email: '', role: 'qa', team: '', slack_user_id: '', password: '',
  });
  const [moduleForm, setModuleForm] = useState({ name: '' });

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const fetchUsers = () => api.get('/users').then(r => setUsers(r.data));
  const fetchProjects = async () => {
    const res = await api.get('/projects');
    setProjects(res.data);
    const mods = {};
    for (const p of res.data) {
      const r = await api.get(`/projects/${p.id}/modules`);
      mods[p.id] = r.data;
    }
    setModules(mods);
  };

  useEffect(() => { fetchUsers(); fetchProjects(); }, []);

  const handleCreateUser = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/users', userForm);
      await fetchUsers();
      setShowUserForm(false);
      setUserForm({ name: '', username: '', password: '', role: 'qa', team: '', email: '', slack_user_id: '' });
      showToast('User created successfully');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = (u) => {
    setEditingUser(u);
    setEditForm({ name: u.name, email: u.email || '', role: u.role, team: u.team || '', slack_user_id: u.slack_user_id || '', password: '' });
  };

  const handleSaveEdit = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = { ...editForm };
      if (!payload.password) delete payload.password; // don't send empty password
      await api.patch(`/users/${editingUser.id}`, payload);
      await fetchUsers();
      setEditingUser(null);
      showToast('User updated successfully');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUser = async (userId, isActive) => {
    await api.patch(`/users/${userId}`, { is_active: !isActive });
    fetchUsers();
    showToast(isActive ? 'User deactivated' : 'User activated');
  };

  const handleAddModule = async (projectId, e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/projects/${projectId}/modules`, { name: moduleForm.name });
      await fetchProjects();
      setShowModuleForm(null);
      setModuleForm({ name: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add module');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
    borderRadius: 6, fontSize: 14, background: 'var(--input-bg)', color: 'var(--text-primary)',
  };
  const labelStyle = { display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13, color: 'var(--text-secondary)' };

  const tabStyle = (active) => ({
    padding: '8px 20px', border: 'none',
    background: active ? '#dc2626' : 'transparent',
    color: active ? 'white' : 'var(--text-secondary)',
    borderRadius: 6, fontWeight: active ? 600 : 400, cursor: 'pointer', fontSize: 14,
  });

  const roleBadge = (role) => {
    const colors = { qa: '#0d9488', developer: '#7c3aed', pm: '#d97706', admin: '#dc2626' };
    const c = colors[role] || '#475569';
    return (
      <span style={{
        padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600,
        background: `${c}15`, color: c, textTransform: 'uppercase',
      }}>{role}</span>
    );
  };

  return (
    <div>
      {toast && (
        <div style={{
          position: 'fixed', top: 70, right: 24, zIndex: 999,
          background: '#0d9488', color: 'white', padding: '10px 18px',
          borderRadius: 8, fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>{toast}</div>
      )}

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Admin Panel</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 2 }}>Manage users, projects, and modules</p>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {/* Tabs */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={tabStyle(activeTab === 'users')} onClick={() => setActiveTab('users')}>Users ({users.length})</button>
            <button style={tabStyle(activeTab === 'projects')} onClick={() => setActiveTab('projects')}>Projects & Modules</button>
          </div>
          {activeTab === 'users' && (
            <button onClick={() => { setShowUserForm(true); setEditingUser(null); }} style={{
              padding: '8px 16px', background: '#dc2626', color: 'white',
              border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>+ New User</button>
          )}
        </div>

        {error && (
          <div style={{ margin: 16, background: '#fee2e2', border: '1px solid #fca5a5', color: '#dc2626', padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>
            {error} <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>✕</button>
          </div>
        )}

        {/* Create User Form */}
        {showUserForm && activeTab === 'users' && (
          <div style={{ padding: 20, borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>Create New User</h3>
            <form onSubmit={handleCreateUser}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div><label style={labelStyle}>Full Name *</label><input style={inputStyle} value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} required placeholder="John Doe" /></div>
                <div><label style={labelStyle}>Username *</label><input style={inputStyle} value={userForm.username} onChange={e => setUserForm(f => ({ ...f, username: e.target.value }))} required placeholder="johndoe" /></div>
                <div><label style={labelStyle}>Password *</label><input type="password" style={inputStyle} value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} required placeholder="Strong password" /></div>
                <div>
                  <label style={labelStyle}>Role *</label>
                  <select style={inputStyle} value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value, team: '' }))}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                {userForm.role === 'developer' && (
                  <div>
                    <label style={labelStyle}>Team *</label>
                    <select style={inputStyle} value={userForm.team} onChange={e => setUserForm(f => ({ ...f, team: e.target.value }))}>
                      <option value="">Select team</option>
                      {TEAMS.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                    </select>
                  </div>
                )}
                <div><label style={labelStyle}>Email</label><input style={inputStyle} type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} placeholder="john@company.com" /></div>
                <div><label style={labelStyle}>Slack User ID</label><input style={inputStyle} value={userForm.slack_user_id} onChange={e => setUserForm(f => ({ ...f, slack_user_id: e.target.value }))} placeholder="U0XXXXXXX" /></div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button type="submit" disabled={loading} style={{ padding: '9px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{loading ? 'Creating...' : 'Create User'}</button>
                <button type="button" onClick={() => setShowUserForm(false)} style={{ padding: '9px 20px', background: 'var(--hover-bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)' }}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Edit User Form */}
        {editingUser && activeTab === 'users' && (
          <div style={{ padding: 20, borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>Edit User: {editingUser.username}</h3>
            <form onSubmit={handleSaveEdit}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div><label style={labelStyle}>Full Name *</label><input style={inputStyle} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} required /></div>
                <div><label style={labelStyle}>Email</label><input type="email" style={inputStyle} value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div>
                  <label style={labelStyle}>Role *</label>
                  <select style={inputStyle} value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value, team: '' }))}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Team {editForm.role === 'developer' && '*'}</label>
                  <select style={inputStyle} value={editForm.team} onChange={e => setEditForm(f => ({ ...f, team: e.target.value }))}>
                    <option value="">None</option>
                    {TEAMS.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                  </select>
                </div>
                <div><label style={labelStyle}>Slack User ID</label><input style={inputStyle} value={editForm.slack_user_id} onChange={e => setEditForm(f => ({ ...f, slack_user_id: e.target.value }))} placeholder="U0XXXXXXX" /></div>
                <div><label style={labelStyle}>New Password (leave blank to keep)</label><input type="password" style={inputStyle} value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} placeholder="Only fill to change" /></div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button type="submit" disabled={loading} style={{ padding: '9px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{loading ? 'Saving...' : 'Save Changes'}</button>
                <button type="button" onClick={() => setEditingUser(null)} style={{ padding: '9px 20px', background: 'var(--hover-bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)' }}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Users Table */}
        {activeTab === 'users' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Name', 'Username', 'Role', 'Team', 'Email', 'Slack ID', 'Status', 'Created', 'Actions'].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left', fontSize: 12,
                      fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--border-light)', opacity: u.is_active ? 1 : 0.55 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{ padding: '12px 16px', fontWeight: 500, fontSize: 14, color: 'var(--text-primary)' }}>{u.name}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{u.username}</td>
                    <td style={{ padding: '12px 16px' }}>{roleBadge(u.role)}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{u.team || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{u.email || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{u.slack_user_id || '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                        background: u.is_active ? '#dcfce7' : '#fee2e2',
                        color: u.is_active ? '#16a34a' : '#dc2626',
                      }}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => { handleEditUser(u); setShowUserForm(false); }}
                          style={{
                            padding: '4px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                            background: '#dbeafe', color: '#1d4ed8', border: 'none', fontWeight: 600,
                          }}
                        >Edit</button>
                        <button
                          onClick={() => handleToggleUser(u.id, u.is_active)}
                          style={{
                            padding: '4px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                            background: u.is_active ? '#fee2e2' : '#dcfce7',
                            color: u.is_active ? '#dc2626' : '#16a34a',
                            border: 'none', fontWeight: 600,
                          }}
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Projects & Modules */}
        {activeTab === 'projects' && (
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
              {projects.map(p => (
                <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{
                    padding: '14px 16px', background: 'var(--hover-bg)',
                    borderBottom: '1px solid var(--border)', display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</h4>
                    <button
                      onClick={() => setShowModuleForm(showModuleForm === p.id ? null : p.id)}
                      style={{
                        padding: '5px 12px', background: '#0d9488', color: 'white',
                        border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600,
                      }}
                    >+ Module</button>
                  </div>

                  {showModuleForm === p.id && (
                    <form onSubmit={(e) => handleAddModule(p.id, e)} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          style={{ ...inputStyle, flex: 1 }}
                          value={moduleForm.name}
                          onChange={e => setModuleForm({ name: e.target.value })}
                          placeholder="Module name..."
                          required
                        />
                        <button type="submit" style={{ padding: '9px 16px', background: '#0d9488', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Add</button>
                      </div>
                    </form>
                  )}

                  <div style={{ padding: '8px 0' }}>
                    {(modules[p.id] || []).length === 0 ? (
                      <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>No modules yet</div>
                    ) : (
                      (modules[p.id] || []).map(m => (
                        <div key={m.id} style={{
                          padding: '9px 16px', fontSize: 13, color: 'var(--text-secondary)',
                          borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0d9488', flexShrink: 0 }} />
                          {m.name}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
