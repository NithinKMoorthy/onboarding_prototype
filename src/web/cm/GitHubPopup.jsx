import { useEffect, useMemo, useState } from 'react';
import { genRepos, langOf } from '../../lib/domain';

/* Prototype stand-in for the GitHub window that installs the AWS Connector app.
   Screens: choose an account → choose repositories and approve → redirect back to AWS Transform. */

const ME = 'nkmoorth';
const PERSONAL = [['dotfiles', 'Public'], ['sandbox-api', 'Private'], ['lambda-experiments', 'Private'], ['notes-web', 'Public']]
  .map(([name, vis]) => ({ name, vis, branch: 'main' }));

export const GH_ACCOUNTS = [
  { login: ME, kind: 'user', color: '#6f42c1', repos: () => PERSONAL },
  { login: 'acme-platform', kind: 'org', role: 'Owner', color: '#0969da', repos: () => genRepos(true) },
  { login: 'acme-fintech', kind: 'org', role: 'Owner', color: '#1a7f37', repos: () => genRepos(true).filter((_, i) => i % 3 === 0) },
  { login: 'acme-legacy', kind: 'org', role: 'Member', color: '#bf3989', repos: () => [], approval: true },
];

const Octo = ({ s = 32, fill = '#fff' }) => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill={fill} aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
);
const Avatar = ({ a, s = 32 }) => (
  <span className="gh-av" style={{ width: s, height: s, background: a.color, borderRadius: a.kind === 'org' ? 6 : '50%', fontSize: s * 0.45 }}>{a.login[0].toUpperCase()}</span>
);
const AppLogo = ({ s = 40 }) => <span className="gh-app" style={{ width: s, height: s, fontSize: s * 0.32 }}>AWS</span>;
const Check = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="#1a7f37" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" /></svg>;

export default function GitHubPopup({ onClose, onInstalled }) {
  const [screen, setScreen] = useState('accounts');
  const [acct, setAcct] = useState(null);
  const [mode, setMode] = useState('all');
  const [picked, setPicked] = useState([]);
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const [requested, setRequested] = useState({});
  const repos = useMemo(() => (acct ? acct.repos() : []), [acct]);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const url = screen === 'accounts' ? 'github.com/apps/aws-connector/installations/select_target'
    : screen === 'install' ? `github.com/apps/aws-connector/installations/new/permissions?target_id=${acct.login}`
    : 'us-east-1.transform.aws.amazon.com/github/callback?installation_id=58210394';

  function install() {
    setScreen('redirect');
    const chosen = mode === 'all' ? repos : repos.filter(r => picked.includes(r.name));
    setTimeout(() => onInstalled({ org: acct.login, repos: chosen, mode }), 1300);
  }

  const matches = repos.filter(r => !picked.includes(r.name) && r.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8);

  return (
    <div className="modal-back gh-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gh-win" role="dialog" aria-modal="true" aria-label="GitHub: Install AWS Connector">
        <div className="gh-chrome">
          <span className="dots"><i style={{ background: '#ff5f57' }} onClick={onClose} title="Close" /><i style={{ background: '#febc2e' }} /><i style={{ background: '#28c840' }} /></span>
          <span className="gh-url"><span className="lock">🔒</span>{url}</span>
        </div>
        {screen !== 'redirect' && <div className="gh-top"><Octo /><span className="gh-me"><Avatar a={GH_ACCOUNTS[0]} s={22} /></span></div>}
        <div className="gh-page">
          {screen === 'accounts' && (
            <div className="gh-narrow">
              <div className="gh-hero"><AppLogo s={64} /><h1>Install AWS Connector</h1><p>Where do you want to install AWS Connector?</p></div>
              <div className="gh-box">
                {GH_ACCOUNTS.map(a => (
                  <div key={a.login} className="gh-acct">
                    <Avatar a={a} />
                    <div className="grow">
                      <b>{a.login}</b>
                      <div className="gh-muted">{a.kind === 'user' ? 'Your personal account' : a.approval ? 'An owner must approve this request' : `Organization · ${a.role}`}</div>
                    </div>
                    {a.approval
                      ? <button className="gh-btn" disabled={requested[a.login]} onClick={() => setRequested(r => ({ ...r, [a.login]: true }))}>{requested[a.login] ? 'Requested' : 'Request'}</button>
                      : <button className="gh-btn" onClick={() => { setAcct(a); setMode('all'); setPicked([]); setScreen('install'); }}>Install</button>}
                  </div>
                ))}
              </div>
              <p className="gh-muted gh-center">Don't see your organization? You may need an owner to install the app for you.</p>
            </div>
          )}

          {screen === 'install' && (
            <div className="gh-narrow">
              <div className="gh-hero"><AppLogo s={64} /><h1>Install &amp; Authorize AWS Connector</h1></div>
              <div className="gh-box gh-pad">
                <div className="gh-for">
                  <span className="gh-muted">Install &amp; Authorize on your {acct.kind === 'org' ? 'organization' : 'personal account'}</span>
                  <span className="row" style={{ gap: 8 }}><Avatar a={acct} s={20} /><b>{acct.login}</b></span>
                </div>
                <hr />
                <label className="gh-radio">
                  <input type="radio" name="gh-mode" checked={mode === 'all'} onChange={() => setMode('all')} />
                  <span><b>All repositories</b><div className="gh-muted">This applies to all current and future repositories owned by the resource owner. Also includes public repositories (read-only).</div></span>
                </label>
                <label className="gh-radio">
                  <input type="radio" name="gh-mode" checked={mode === 'select'} onChange={() => setMode('select')} />
                  <span><b>Only select repositories</b><div className="gh-muted">Select at least one repository. Also includes public repositories (read-only).</div></span>
                </label>
                {mode === 'select' && (
                  <div className="gh-select">
                    <div className="gh-dd">
                      <button className="gh-btn" onClick={() => setMenu(m => !m)}>Select repositories ▾</button>
                      {menu && (
                        <div className="gh-menu">
                          <input className="gh-input" autoFocus placeholder="Search for a repository" value={q} onChange={e => setQ(e.target.value)} />
                          {matches.length ? matches.map(r => (
                            <button key={r.name} className="gh-item" onClick={() => setPicked(p => [...p, r.name])}>
                              <span><b>{acct.login}/{r.name}</b></span><span className="gh-muted">{r.vis} · {langOf(r.name)}</span>
                            </button>
                          )) : <div className="gh-muted" style={{ padding: 12 }}>No repositories found.</div>}
                        </div>
                      )}
                    </div>
                    <div className="gh-muted" style={{ margin: '8px 0' }}>Selected {picked.length} {picked.length === 1 ? 'repository' : 'repositories'}.</div>
                    {picked.map(n => (
                      <div key={n} className="gh-picked">
                        <span>{acct.login}/<b>{n}</b></span>
                        <button className="gh-x" aria-label={`Remove ${n}`} onClick={() => setPicked(p => p.filter(x => x !== n))}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                <hr />
                <b>with these permissions:</b>
                <ul className="gh-perms">
                  <li><Check /> <b>Read</b> access to metadata</li>
                  <li><Check /> <b>Read</b> access to code</li>
                  <li><Check /> <b>Read and write</b> access to pull requests</li>
                </ul>
                <hr />
                <b>User permissions</b>
                <p className="gh-muted" style={{ margin: '4px 0 0' }}>AWS Connector can also request your permission to verify your GitHub identity (<b>{ME}</b>).</p>
                <div className="gh-actions">
                  <button className="gh-btn primary" disabled={mode === 'select' && !picked.length} onClick={install}>Install &amp; Authorize</button>
                  <button className="gh-btn" onClick={() => setScreen('accounts')}>Cancel</button>
                </div>
              </div>
              <p className="gh-muted gh-center">Next: you'll be redirected to <b>us-east-1.transform.aws.amazon.com</b></p>
            </div>
          )}

          {screen === 'redirect' && (
            <div className="gh-redirect"><span className="spinner" /> Redirecting to AWS Transform…</div>
          )}
        </div>
      </div>
    </div>
  );
}
