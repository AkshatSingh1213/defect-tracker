import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function LoginPage() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', form);
      login(res.data.user, res.data.token);
      const role = res.data.user.role;
      const paths = { qa: '/qa', developer: '/dev', pm: '/pm', admin: '/admin' };
      navigate(paths[role] || '/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #134e4a 50%, #0f172a 100%)',
    }}>
      <div style={{
        background: '#ffffff', borderRadius: 16, padding: '48px 44px',
        width: '100%', maxWidth: 420,
        boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: '#0d9488', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <span style={{ color: 'white', fontSize: 26, fontWeight: 700 }}>D</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1f2328' }}>DefectTrack</h1>
          <p style={{ color: '#57606a', fontSize: 14, marginTop: 4 }}>Sign in to your account</p>
        </div>

        {error && (
          <div style={{
            background: '#fee2e2', border: '1px solid #fca5a5',
            color: '#dc2626', padding: '10px 14px', borderRadius: 8,
            marginBottom: 20, fontSize: 13, textAlign: 'center',
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13, color: '#374151' }}>
              Username
            </label>
            <input
              type="text"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              placeholder="Enter your username"
              required
              style={{
                width: '100%', padding: '11px 14px', border: '1px solid #e5e7eb',
                borderRadius: 8, fontSize: 14, outline: 'none', transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = '#0d9488'}
              onBlur={e => e.target.style.borderColor = '#e5e7eb'}
            />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13, color: '#374151' }}>
              Password
            </label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Enter your password"
              required
              style={{
                width: '100%', padding: '11px 14px', border: '1px solid #e5e7eb',
                borderRadius: 8, fontSize: 14, outline: 'none', transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = '#0d9488'}
              onBlur={e => e.target.style.borderColor = '#e5e7eb'}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px', background: loading ? '#94a3b8' : '#0d9488',
              color: 'white', border: 'none', borderRadius: 8,
              fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#94a3b8' }}>
          Contact your administrator to create an account
        </p>
      </div>
    </div>
  );
}
