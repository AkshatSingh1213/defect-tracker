import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLE_COLORS, STATUS_COLORS } from '../utils/constants';
import api from '../services/api';

const NAV_ITEMS = {
  qa: [
    { path: '/qa', label: 'My Dashboard', icon: '◈' },
    { path: '/defects', label: 'All Defects', icon: '◉' },
  ],
  developer: [
    { path: '/dev', label: 'My Queue', icon: '◈' },
    { path: '/defects', label: 'All Defects', icon: '◉' },
  ],
  pm: [
    { path: '/pm', label: 'PM Dashboard', icon: '◈' },
    { path: '/defects', label: 'All Defects', icon: '◉' },
  ],
  admin: [
    { path: '/admin', label: 'Admin Panel', icon: '◈' },
    { path: '/defects', label: 'All Defects', icon: '◉' },
  ],
};

// ── Global Search ──────────────────────────────────────────────────────────────
function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);

  const search = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await api.get(`/defects/search?q=${encodeURIComponent(q)}`);
      setResults(res.data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const handleSelect = (id) => {
    navigate(`/defects/${id}`);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14 }}>🔍</span>
        <input
          value={query}
          onChange={handleChange}
          onFocus={() => query && setOpen(true)}
          placeholder="Search defects by title or #ID..."
          style={{
            width: '100%', padding: '7px 12px 7px 32px',
            border: '1px solid var(--border)', borderRadius: 8,
            fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
      </div>
      {open && (query.trim()) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, zIndex: 200, maxHeight: 300, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        }}>
          {loading ? (
            <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 13 }}>Searching...</div>
          ) : results.length === 0 ? (
            <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 13 }}>No results found</div>
          ) : results.map(r => {
            const sc = STATUS_COLORS[r.status] || {};
            return (
              <div
                key={r.id}
                onClick={() => handleSelect(r.id)}
                style={{
                  padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border-light)',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>#{r.id}</span>
                <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, flexShrink: 0, fontWeight: 600 }}>{r.status}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Dark Mode Toggle ──────────────────────────────────────────────────────────
function DarkModeToggle() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
  });

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', dark);
  }, [dark]);

  return (
    <button
      onClick={() => setDark(d => !d)}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        background: 'none', border: '1px solid var(--border)',
        borderRadius: 8, padding: '5px 9px', cursor: 'pointer',
        fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1,
      }}
    >
      {dark ? '☀' : '☾'}
    </button>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────
export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Apply saved dark mode on mount
  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved === 'true') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, []);

  const navItems = NAV_ITEMS[user?.role] || [];
  const roleColor = ROLE_COLORS[user?.role] || '#475569';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const Sidebar = ({ mobile }) => (
    <aside
      className={mobile ? `sidebar-mobile${mobileOpen ? '' : ' closed'}` : ''}
      style={{
        width: 230, minHeight: '100vh',
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        flexShrink: 0,
        position: mobile ? 'fixed' : 'sticky',
        top: 0, height: '100vh',
        overflow: 'hidden',
        transition: mobile ? 'transform 0.25s ease' : 'none',
        zIndex: mobile ? 100 : 'auto',
      }}
    >
      {/* Logo */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: roleColor, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          color: 'white', fontWeight: 700, fontSize: 16, flexShrink: 0,
        }}>D</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>DefectTrack</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{user?.role}</div>
        </div>
        {mobile && (
          <button
            onClick={() => setMobileOpen(false)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }}
          >✕</button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
        {navItems.map(item => {
          const active = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path) && item.path !== '/defects') ||
            (item.path === '/defects' && location.pathname === '/defects');
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 20px',
                color: active ? roleColor : 'var(--text-secondary)',
                background: active ? `${roleColor}15` : 'transparent',
                borderRight: active ? `3px solid ${roleColor}` : '3px solid transparent',
                fontWeight: active ? 600 : 400, fontSize: 14,
                transition: 'all 0.15s', textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User + logout */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px' }}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            width: '100%', padding: '8px 12px',
            background: '#fee2e2', color: '#dc2626',
            border: 'none', borderRadius: 6,
            fontSize: 13, fontWeight: 500, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <span>⏻</span> Logout
        </button>
      </div>
    </aside>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Desktop Sidebar */}
      <div className="sidebar-desktop" style={{ display: 'flex' }}>
        <Sidebar mobile={false} />
      </div>

      {/* Mobile overlay + sidebar */}
      {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}
      <Sidebar mobile={true} />

      {/* Main content */}
      <div className="main-content-mobile" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top bar */}
        <header style={{
          height: 56,
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center',
          padding: '0 16px', gap: 12,
          position: 'sticky', top: 0, zIndex: 10,
        }}>
          {/* Hamburger — visible on mobile only */}
          <button
            onClick={() => setMobileOpen(o => !o)}
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 6, padding: '4px 8px',
              cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 16,
              display: 'none', // shown via @media in CSS
            }}
            className="hamburger-btn"
          >
            ☰
          </button>

          {/* Global Search */}
          <GlobalSearch />

          {/* Dark mode toggle */}
          <DarkModeToggle />

          {/* User pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 12px', background: 'var(--bg)',
            borderRadius: 20, border: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: roleColor, color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700,
            }}>
              {user?.name?.split(' ').map(w => w[0]).join('').substring(0, 2)}
            </div>
            <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-primary)' }}>{user?.name}</span>
            <span style={{
              background: `${roleColor}20`, color: roleColor,
              padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
              textTransform: 'uppercase',
            }}>{user?.role}</span>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
          <Outlet />
        </main>
      </div>

      {/* CSS for hamburger visibility */}
      <style>{`
        @media (max-width: 768px) {
          .hamburger-btn { display: flex !important; }
          .sidebar-desktop { display: none !important; }
        }
      `}</style>
    </div>
  );
}
