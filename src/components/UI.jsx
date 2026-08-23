import { Check, LoaderCircle, TriangleAlert, X } from 'lucide-react';

export function Loading({ label = 'Loading MaapSure...' }) {
  return <div className="loading-state"><LoaderCircle className="spin" size={24} /><span>{label}</span></div>;
}

export function StatusBadge({ status }) {
  const normalized = String(status || '').toLowerCase();
  const type = normalized === 'pass' || normalized === 'finalized' || normalized === 'active' ? 'success' : normalized === 'fail' ? 'danger' : 'warning';
  return <span className={`status-badge ${type}`}><i />{status}</span>;
}

export function TestResultIcon({ passed, size = 'normal' }) {
  return <span className={`result-icon ${passed ? 'passed' : 'failed'} ${size}`}>{passed ? <Check /> : <X />}</span>;
}

export function ErrorNotice({ children }) {
  if (!children) return null;
  return <div className="notice error"><TriangleAlert size={18} /><span>{children}</span></div>;
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return <div className="empty-state"><span><Icon size={28} /></span><h3>{title}</h3><p>{children}</p>{action}</div>;
}
