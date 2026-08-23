import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ClipboardCheck, QrCode, ShieldCheck } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import { ErrorNotice } from '../components/UI.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function LoginPage() {
  const demoMode = import.meta.env.DEV || import.meta.env.VITE_MAAPSURE_DEMO_MODE === 'true';
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(demoMode ? 'admin@maapsure.in' : '');
  const [password, setPassword] = useState(demoMode ? 'Demo@123' : '');
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'Sign in | MaapSure'; }, []);
  if (user) return <Navigate to="/dashboard" replace />;

  async function submit(event) {
    event.preventDefault();
    setError('');
    try { await login(email, password); navigate('/dashboard'); } catch (reason) { setError(reason.message); }
  }

  return (
    <div className="login-page">
      <section className="login-story">
        <div className="story-inner">
          <Logo light />
          <div className="story-copy">
            <span className="eyebrow light"><ShieldCheck size={15} /> Measurement you can prove</span>
            <h1>From test reading to verified report in minutes.</h1>
            <p>MaapSure removes calculation mistakes, creates consistent OIML reports and makes every certificate publicly verifiable.</p>
            <div className="story-flow">
              <div><span><ClipboardCheck /></span><strong>Record</strong><small>Guided test observations</small></div>
              <i><ArrowRight /></i>
              <div><span><CheckCircle2 /></span><strong>Evaluate</strong><small>Automatic OIML limits</small></div>
              <i><ArrowRight /></i>
              <div><span><QrCode /></span><strong>Verify</strong><small>QR-backed certificate</small></div>
            </div>
          </div>
          <p className="story-foot">Built for fair trade, reliable laboratories and trusted measurements.</p>
        </div>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="login-mobile-logo"><Logo /></div>
          <span className="eyebrow">Secure laboratory workspace</span>
          <h2>Welcome back</h2>
          <p>Sign in to continue testing.</p>
          <ErrorNotice>{error}</ErrorNotice>
          <label>Email address<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required /></label>
          <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>
          <button className="button primary large" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}<ArrowRight size={18} /></button>
          {demoMode && <div className="demo-role-grid">
            <button type="button" onClick={() => { setEmail('inspector@maapsure.in'); setPassword('Inspect@123'); }}><strong>Tester</strong><span>Record and submit</span></button>
            <button type="button" onClick={() => { setEmail('reviewer@maapsure.in'); setPassword('Review@123'); }}><strong>Reviewer</strong><span>Approve independently</span></button>
            <button type="button" onClick={() => { setEmail('admin@maapsure.in'); setPassword('Demo@123'); }}><strong>Administrator</strong><span>Rules and users</span></button>
          </div>}
          <a className="verify-link" href="/verify"><QrCode size={16} /> Open public report verification</a>
        </form>
      </section>
    </div>
  );
}
