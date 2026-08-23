import { Scale } from 'lucide-react';

export default function Logo({ light = false, compact = false }) {
  return (
    <div className={`logo ${light ? 'logo-light' : ''}`}>
      <span className="logo-mark"><Scale size={22} strokeWidth={2.4} /></span>
      {!compact && <span><strong>MaapSure</strong><small>Digital Legal Metrology</small></span>}
    </div>
  );
}
