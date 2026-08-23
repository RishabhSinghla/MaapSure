import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, FileCheck2, Gauge, MapPin, Search, ShieldCheck, XCircle } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import { api } from '../lib/api.js';
import { Loading } from '../components/UI.jsx';

export default function VerifyPage() {
  const params = useParams();
  const [code, setCode] = useState(params.code || '');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function verify(value = code) {
    setLoading(true); setError(''); setData(null);
    try { setData(await api(`/api/public/verify/${encodeURIComponent(value)}`)); }
    catch (reason) { setError(reason.message); } finally { setLoading(false); }
  }
  useEffect(() => { verify(params.code); }, [params.code]);

  return (
    <div className="verification-page">
      <header><Logo /><a href="/login">Laboratory sign in</a></header>
      <main>
        <div className="verify-intro"><span className="eyebrow"><ShieldCheck size={15} /> Public certificate verification</span><h1>Check a MaapSure report</h1><p>Enter the code printed below the QR symbol. You do not need an account.</p><form onSubmit={(event) => { event.preventDefault(); verify(); }}><Search size={19} /><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Example: MS26A418" /><button className="button primary">Verify</button></form></div>
        {loading ? <Loading label="Checking the digital record..." /> : error ? <section className="verify-result invalid"><XCircle /><h2>Report not found</h2><p>{error}</p></section> : data?.authentic && <section className={`verify-result ${data.revoked || data.report.status !== 'PASS' ? 'warning' : 'valid'}`}>
          <div className="verify-result-head"><span>{data.revoked ? <XCircle /> : data.report.status === 'PASS' ? <CheckCircle2 /> : <FileCheck2 />}</span><div><small>Tamper check passed</small><h2>{data.revoked ? 'Authentic report — now revoked' : data.report.status === 'PASS' ? 'Authentic, approved and passed' : 'Authentic approved report — failed tests recorded'}</h2><p>The SHA-256 fingerprint matches the independently approved laboratory record.</p></div><ShieldCheck className="watermark-shield" /></div>
          {data.revoked && <div className="revoked-note"><strong>Revocation reason</strong><span>{data.report.revocationReason}</span></div>}
          <div className="verify-certificate"><div><span>Certificate number</span><strong>{data.report.certificateNumber}</strong></div><div><span>Rules version</span><strong>{data.report.ruleVersion}</strong></div><div><span>Standard applied</span><strong>{data.report.standard}</strong></div></div>
          <div className="verify-details"><article><Gauge /><div><span>Instrument</span><strong>{data.report.instrument.manufacturer} {data.report.instrument.model}</strong><small>Serial {data.report.instrument.serialNumber}, Class {data.report.instrument.accuracyClass}, Max {data.report.instrument.maxCapacity} {data.report.instrument.unit}</small></div></article><article><CalendarDays /><div><span>Independently approved</span><strong>{new Date(data.report.approvedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</strong><small>Tested by {data.report.inspectorName}; reviewed by {data.report.approvedBy?.name}</small></div></article><article><MapPin /><div><span>Laboratory</span><strong>{data.report.laboratory}</strong><small>Digital record held in MaapSure</small></div></article></div>
          <div className="public-hash"><span>Record fingerprint</span><code>{data.report.integrityHash}</code></div>
          <footer><ShieldCheck size={17} /> This page confirms digital record authenticity and current status. Legal stamping remains with the authorized authority.</footer>
        </section>}
      </main>
      <div className="verify-page-foot">MaapSure prototype for SIH 2026, problem statement SIH26035.</div>
    </div>
  );
}
