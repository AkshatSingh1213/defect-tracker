export const STATUSES = ['Open', 'Need Clarification', 'Retest', 'Reopen', 'Closed'];

export const STATUS_COLORS = {
  'Open':              { bg: '#e2e8f0', text: '#475569', border: '#cbd5e1', dot: '#94a3b8' },
  'Need Clarification':{ bg: '#fef3c7', text: '#b45309', border: '#fcd34d', dot: '#d97706' },
  'Retest':            { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd', dot: '#3b82f6' },
  'Reopen':            { bg: '#fee2e2', text: '#dc2626', border: '#fca5a5', dot: '#ef4444' },
  'Closed':            { bg: '#dcfce7', text: '#16a34a', border: '#86efac', dot: '#22c55e' },
};

// Dark mode desaturated versions
export const STATUS_COLORS_DARK = {
  'Open':              { bg: '#2d3748', text: '#a0aec0', border: '#4a5568', dot: '#718096' },
  'Need Clarification':{ bg: '#44391a', text: '#d4a046', border: '#8a6a1e', dot: '#c58a28' },
  'Retest':            { bg: '#1e2d4a', text: '#6b9bd4', border: '#2d4a72', dot: '#4d87c4' },
  'Reopen':            { bg: '#3d1a1a', text: '#c56464', border: '#722d2d', dot: '#b84444' },
  'Closed':            { bg: '#1a3d2a', text: '#4db87a', border: '#2d7248', dot: '#3da860' },
};

export const SEVERITY_COLORS = {
  'Sev1':        { bg: '#fee2e2', text: '#dc2626' },
  'Sev2':        { bg: '#ffedd5', text: '#c2410c' },
  'Sev3':        { bg: '#fef9c3', text: '#854d0e' },
  'Observation': { bg: '#f0fdf4', text: '#166534' },
};

export const ROLE_COLORS = {
  qa:        '#0d9488',
  developer: '#7c3aed',
  pm:        '#d97706',
  admin:     '#dc2626',
};

export const TEAM_LABELS = {
  dev: 'Dev',
  fmw: 'FMW',
  mobility: 'Mobility',
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export const getInitials = (name = '') => {
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
};

// Who can change to which statuses
export const getAvailableTransitions = (role, currentStatus) => {
  if (role === 'pm' || role === 'admin') {
    return STATUSES.filter(s => s !== currentStatus);
  }
  if (role === 'qa') {
    if (currentStatus === 'Need Clarification') return ['Open'];
    if (currentStatus === 'Retest') return ['Closed', 'Reopen'];
    return [];
  }
  if (role === 'developer') {
    if (['Open', 'Reopen', 'Need Clarification'].includes(currentStatus)) return ['Retest', 'Need Clarification'];
    return [];
  }
  return [];
};

// Does the role need to pick a QA when going to Need Clarification?
export const needsClarificationTarget = (newStatus) => newStatus === 'Need Clarification';

// Does the role need to pick a team when going to Open (from clarification) or Reopen?
export const needsTeamReassign = (newStatus, oldStatus) =>
  (newStatus === 'Open' && oldStatus === 'Need Clarification') || newStatus === 'Reopen';
