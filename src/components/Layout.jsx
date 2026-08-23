import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, ClipboardCheck, Gauge, LogOut, Menu, Plus, Scale, ShieldCheck, X } from 'lucide-react';
import Logo from './Logo.jsx';
import { useAuth } from '../lib/auth.jsx';

const navigation = [
  { to: '/dashboard', label: 'Overview', icon: BarChart3 },
  { to: '/tests', label: 'Test reports', icon: ClipboardCheck },
  { to: '/instruments', label: 'Instruments', icon: Gauge },
];

const titles = {
  '/dashboard': ['Good morning', 'Your laboratory is ready for testing.'],
  '/tests': ['Test reports', 'Review, download and verify completed tests.'],
  '/instruments': ['Instrument registry', 'Manage every weighing instrument in one place.'],
  '/tests/new': ['New OIML test', 'Record observations and calculate the result.'],
};

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  const detailTitle = location.pathname.startsWith('/tests/') && location.pathname !== '/tests/new' ? ['Test report', 'Full evidence, calculations and digital verification.'] : null;
  const [title, subtitle] = detailTitle || titles[location.pathname] || ['MaapSure', 'Trusted measurement, proven digitally.'];

  return (
    <div className="app-shell">
      {mobileOpen && <button className="mobile-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-top">
          <Logo light />
          <button className="icon-button mobile-only" onClick={() => setMobileOpen(false)}><X size={20} /></button>
        </div>
        <a href="/tests/new" className="new-test-button"><Plus size={18} /> Start a new test</a>
        <nav className="side-nav">
          <span className="nav-label">Workspace</span>
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <item.icon size={19} /> {item.label}
            </NavLink>
          ))}
          <span className="nav-label nav-label-spaced">Public tools</span>
          <a className="nav-link" href="/verify/MS26A418"><ShieldCheck size={19} /> Verify a report</a>
        </nav>
        <div className="standard-card">
          <Scale size={19} />
          <div><strong>OIML R 76-1</strong><span>Rules engine active</span></div>
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
