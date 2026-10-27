import { ACCOUNT } from '../lib/domain';
import { Icon } from '../components/ui';
import { RegionNote } from './shared';
import Landing from './Landing';
import EnableWebApp from './EnableWebApp';
import ServiceManagement from './ServiceManagement';

const NAV_PAGES = { service: 'Service management', partners: 'Partner agents', connectors: 'Connectors' };

export default function ConsoleApp({ parts }) {
  const page = parts[0] || '';
  const nav = page in NAV_PAGES;
  let body, crumbs = null;
  if (page === 'enable') { crumbs = [['AWS Transform', '#/'], ['Enable web application']]; body = <EnableWebApp />; }
  else if (nav) {
    crumbs = [['AWS Transform', '#/'], [NAV_PAGES[page]]];
    body = page === 'service' ? <ServiceManagement /> : <Placeholder label={NAV_PAGES[page]} />;
  } else body = <Landing />;

  return (
    <div className="console">
      <ConsoleTop />
      {crumbs && (
        <div className="c-bread">
          {nav && <span className="muted"><Icon n="panel" s={18} /></span>}
          {crumbs.map(([label, href], i) => (
            <span key={i} className="row" style={{ gap: 8 }}>
              {i > 0 && <span className="muted">/</span>}
              {href ? <a href={href}>{label}</a> : <span>{label}</span>}
            </span>
          ))}
        </div>
      )}
      <div className="c-body">
        {nav && <ConsoleNav page={page} />}
        <main className={`c-main${page === '' ? ' flush' : ''}`}>{body}</main>
      </div>
      <footer className="c-foot">
        <span><Icon n="terminal" /> CloudShell</span><span>Feedback</span>
        <span className="grow">© 2026, Amazon Web Services, Inc. or its affiliates.</span>
        <span>Privacy</span><span>Terms</span><span>Cookie preferences</span>
      </footer>
    </div>
  );
}

function ConsoleTop() {
  return (
    <header className="c-top">
      <a className="aws-logo" href="#/">aws</a>
      <span className="muted"><Icon n="apps" s={20} /></span>
      <div className="c-search"><Icon n="search" />Search<span style={{ marginLeft: 'auto', fontStyle: 'normal' }}>[Option+S]</span></div>
      <div className="right">
        <Icon n="terminal" s={18} /><Icon n="bell" s={18} /><Icon n="help" s={18} /><Icon n="gear" s={18} />
        <span>United States (N. Virginia) ▾</span>
        <div className="acct">nkmoorth1 ({ACCOUNT}) ▾<br /><span style={{ fontWeight: 400 }}>Admin/nkmoorth-Isengard</span></div>
      </div>
    </header>
  );
}

function ConsoleNav({ page }) {
  return (
    <nav className="c-nav">
      <h3>AWS Transform</h3>
      {Object.entries(NAV_PAGES).map(([k, label]) => <a key={k} href={`#/${k}`} className={page === k ? 'active' : ''}>{label}</a>)}
      <hr style={{ border: 0, borderTop: '1px solid var(--border-light)', margin: '16px 0' }} />
      <a href="#" onClick={e => e.preventDefault()}>Documentation <Icon n="ext" s={14} /></a>
    </nav>
  );
}

function Placeholder({ label }) {
  return (
    <div className="stack">
      <RegionNote />
      <h1>{label}</h1>
      <div className="container"><div className="empty"><b>No {label.toLowerCase()}</b>{label === 'Connectors' ? 'Connectors let AWS Transform import data from your accounts and tools.' : 'Partner agents extend AWS Transform with third-party capabilities.'}</div></div>
    </div>
  );
}
