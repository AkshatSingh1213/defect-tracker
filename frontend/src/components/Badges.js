import React from 'react';
import { STATUS_COLORS, SEVERITY_COLORS } from '../utils/constants';

const isDark = () => document.documentElement.classList.contains('dark');

export const StatusBadge = ({ status, size = 'sm' }) => {
  const colors = STATUS_COLORS[status] || { bg: '#e2e8f0', text: '#475569', border: '#cbd5e1' };
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: size === 'lg' ? '4px 12px' : '2px 8px',
      borderRadius: 20,
      fontSize: size === 'lg' ? 13 : 11,
      fontWeight: 600,
      background: colors.bg,
      color: colors.text,
      border: `1px solid ${colors.border}`,
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
};

export const SeverityBadge = ({ severity, size = 'sm' }) => {
  const colors = SEVERITY_COLORS[severity] || { bg: '#f0fdf4', text: '#166534' };
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: size === 'lg' ? '4px 12px' : '2px 8px',
      borderRadius: 20,
      fontSize: size === 'lg' ? 13 : 11,
      fontWeight: 600,
      background: colors.bg,
      color: colors.text,
      whiteSpace: 'nowrap',
    }}>
      {severity}
    </span>
  );
};
