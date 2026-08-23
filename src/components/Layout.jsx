import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, ClipboardCheck, FileSearch, Gauge, History, LandPlot, LogOut, Menu, Plus, Scale, ShieldCheck, X } from 'lucide-react';
import Logo from './Logo.jsx';
import { useAuth } from '../lib/auth.jsx';
import { RULE_PROFILE } from '../../shared/r76Catalog.js';

const titles = {
  '/dashboard': ['Good morning', 'Your laboratory is ready for testing.'],
  '/tests': ['Test reports', 'Review, download and verify completed tests.'],
  '/instruments': ['Instrument registry', 'Manage every weighing instrument in one place.'],
  '/tests/new': ['New OIML test', 'Record observations and calculate the result.'],
  '/review': ['Independent review queue', 'Approve or return submitted tests using four-eyes control.'],
  '/governance': ['Standards and access', 'Versioned rules, governed changes and named user roles.'],
  '/audit': ['Chained audit consistency', 'Check every recorded permanent action from the first event onward.'],
};

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  const detailTitle = location.pathname.startsWith('/tests/') && location.pathname !== '/tests/new' ? ['Test report', 'Evidence, calculations and issued-record consistency.'] : null;
  const [title, subtitle] = detailTitle || titles[location.pathname] || ['MaapSure', 'Trusted measurement, proven digitally.'];
  const canTest = ['TESTER', 'ADMIN'].includes(user?.role);
  const navigation = [
    { to: '/dashboard', label: 'Overview', icon: BarChart3, show: true },
    { to: '/tests', label: 'Controlled records', icon: ClipboardCheck, show: true },
    { to: '/instruments', label: 'Instruments', icon: Gauge, show: true },
    { to: '/review', label: 'Review queue', icon: FileSearch, show: ['REVIEWER', 'ADMIN'].includes(user?.role) },
    { to: '/governance', label: 'Standards & access', icon: LandPlot, show: ['REVIEWER', 'ADMIN'].includes(user?.role) },
    { to: '/audit', label: 'Audit trail', icon: History, show: ['REVIEWER', 'AUDITOR', 'ADMIN'].includes(user?.role) },
  ].filter((item) => item.show);

  return (
    <div className="app-shell">
      {mobileOpen && <button className="mobile-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-top">
          <Logo light />
          <button className="icon-button mobile-only" onClick={() => setMobileOpen(false)}><X size={20} /></button>
        </div>
        {canTest && <a href="/tests/new" className="new-test-button"><Plus size={18} /> Start a new test</a>}
        <nav className="side-nav">
          <span className="nav-label">Workspace</span>
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <item.icon size={19} /> {item.label}
            </NavLink>
          ))}
          <span className="nav-label nav-label-spaced">Public tools</span>
          <a className="nav-link" href="/verify"><ShieldCheck size={19} /> Verify a report</a>
        </nav>
        <div className="standard-card">
          <Scale size={19} />
          <div><strong>R 76 rules v{RULE_PROFILE.version}</strong><span>Published and locked</span></div>
          <i />
        </div>
        <div className="sidebar-user">
          <span className="avatar">{user?.initials}</span>
          <div><strong>{user?.name}</strong><span>{user?.role}</span></div>
          <button onClick={logout} aria-label="Sign out"><LogOut size={17} /></button>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={21} /></button>
          <div><h1>{title}{title === 'Good morning' ? `, ${user?.name?.split(' ')[0]}` : ''}</h1><p>{subtitle}</p></div>
          <div className="topbar-standard"><ShieldCheck size={17} /><span>Standards engine</span><strong>Online</strong></div>
        </header>
        <div className="page-container"><Outlet /></div>
      </main>
    </div>
  );
}
