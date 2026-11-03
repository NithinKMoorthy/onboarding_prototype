import { useState } from 'react';
import { commit, db, nid, useStore } from '../../lib/store';
import { go } from '../../lib/router';
import { ANALYSIS_META, CUSTOM_DEFS, PLAN, PROVIDERS, aDone, aEnd, aFindings, genRepos, langOf, stackStatus, aStatus, repoStates, createAnalysis, estate, providerHost, startRun, typeName } from '../../lib/domain';
import { focusFirstError, plural } from '../../lib/format';
import { Alert, Breadcrumbs, Choice, ErrorText, Field, Icon, SearchInput, Select, Spinner, Status, TextInput, Tile, usePager } from '../../components/ui';
import { createSource, validateSource } from './ConnectSource';
import GitHubPopup from './GitHubPopup';
import { ORDER, ReviewBox, ScheduleTable, isRecurring, whyFromScan } from './ScheduleTable';

/* First-run flow: connect a source → quick scan → recommended analyses on a schedule. */

const ROLES = ['AWSTransformExecutionRole', 'ATX-ContinuousModernization-Role', 'platform-eng-transform-role', 'security-scanning-role'];
const RUN_STACK = 'AtxInfrastructureStack';

const STEPS = ['Connect source', 'Review your estate', 'Schedule and run'];

export default function GetStarted() {
  const S = useStore();
  const ob = S.onboarding || {};
  const src = S.sources.find(s => s.id === ob.sourceId);
  const scan = S.analyses.find(a => a.id === ob.scanId);
  const [step, setStep] = useState(src && scan ? 2 : 1);
  const [picked, setPicked] = useState(PLAN);
  const [def, setDef] = useState(CUSTOM_DEFS[0]);
  const goStep = n => { setStep(n); window.scrollTo(0, 0); };
  const reached = Math.max(step, src && scan ? 2 : 1);

  let body;
  if (step === 1 || !src || !scan) body = <ConnectStep src={src} onDone={() => goStep(2)} />;
  else if (step === 2) body = <EstateStep src={src} scan={scan} onPrev={() => goStep(1)} onNext={() => goStep(3)} />;
  else body = <ScheduleStep src={src} scan={scan} picked={picked} setPicked={setPicked} def={def} setDef={setDef} onPrev={() => goStep(2)} />;

  return (
    <>
      <Breadcrumbs items={[['Continuous modernization', '#/web/cm'], ['Get started']]} />
      <div className="gs">
        <ol className="gs-steps">
          {STEPS.map((name, i) => {
            const n = i + 1;
            const cls = n === step ? 'cur' : n <= reached ? 'done' : '';
            return (
              <li key={n} className={cls}>
                <div className="lbl">Step {n}</div>
                {cls === 'done' ? <a href="#" className="nm" onClick={e => { e.preventDefault(); goStep(n); }}>{name}</a> : <div className="nm">{name}</div>}
              </li>
            );
          })}
        </ol>
        <div className="gs-main">{body}</div>
      </div>
    </>
  );
}

const cancel = () => go('#/web/cm');
const Head = ({ title, children }) => <div className="gs-head"><h1>{title}</h1>{children && <p>{children}</p>}</div>;

/* ---------- step 1 ---------- */
function ConnectStep({ src, onDone }) {
  const [c, setC] = useState({ provider: 'github', auth: 'app', org: '', token: '', url: '', includePublic: false, repoMode: 'all', selected: [], name: '', infra: 'managed', roleMode: 'create', role: '' });
  const [runsOpen, setRunsOpen] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  // Repositories the verified token can see (all visibilities), or null until verified.
  const [verified, setVerified] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [repoOpen, setRepoOpen] = useState(false);
  const pv = PROVIDERS[c.provider];
  const suggest = (org, provider) => org.trim() ? `${org.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')}-${provider}`.slice(0, 64) : '';
  const set = k => v => {
    setC(p => {
      const next = { ...p, [k]: v };
      if (!nameTouched && (k === 'org' || k === 'provider')) next.name = suggest(next.org, next.provider);
      return next;
    });
    setErrors(e => (e[k] ? { ...e, [k]: undefined } : e));
  };

  const stackSt = stackStatus(RUN_STACK);
  // Organization is optional: blank means every repository the token can access, shown under the source name.
  // GitHub only: sign in with the AWS Connector app (default) or paste a personal access token.
  const useApp = c.provider === 'github' && c.auth === 'app';
  const resolved = () => ({ ...c, org: c.org.trim() || 'all', token: useApp ? 'aws-connector-app' : c.token });
  const resetAccess = patch => { setVerified(null); setRepoOpen(false); setErrors({}); setC(p => ({ ...p, token: '', repoMode: 'all', selected: [], includePublic: false, ...patch })); };

  // Opens the simulated GitHub window, where the user picks an account and the repositories the app can access.
  function connectApp() {
    setErrors(e => ({ ...e, app: undefined }));
    setVerifying(true);
  }
  function onInstalled({ org, repos, mode }) {
    setVerifying(false);
    setRepoOpen(false);
    setC(p => ({ ...p, org, appMode: mode, includePublic: true, repoMode: 'all', selected: [], name: nameTouched ? p.name : suggest(org, 'github') }));
    setVerified(repos);
  }

  function verify() {
    const tokenErr = validateSource(resolved()).token;
    setErrors(e => ({ ...e, token: tokenErr }));
    if (tokenErr) { setTimeout(focusFirstError); return; }
    setVerifying(true);
    setTimeout(() => { setVerifying(false); setVerified(genRepos(c.provider === 'github')); }, 1000);
  }

  function connect() {
    const e = validateSource(resolved());
    if (useApp && !verified) e.app = 'Connect to GitHub to continue.';
    else if (!e.token && !verified) e.token = 'Verify the token to continue.';
    if (verified && c.repoMode === 'choose' && !c.selected.length) { e.repos = 'Choose at least one repository.'; setRepoOpen(true); }
    if (c.infra === 'managed' && c.roleMode === 'existing' && !c.role) e.role = 'Choose a role, or let AWS Transform create one.';
    if (c.infra === 'customer' && stackSt !== 'Deployed') e.stack = stackSt === 'Not deployed' ? 'Deploy the stack first, or run on AWS managed.' : 'Wait for the stack to finish deploying.';
    setErrors(e);
    if (e.role || e.stack) setRunsOpen(true);
    if (Object.keys(e).length) { setTimeout(focusFirstError); return; }
    setBusy(true);
    setTimeout(() => {
      const s = createSource({ ...c, token: resolved().token, repoList: useApp ? verified : null, org: c.org.trim() || c.name.trim(), selected: c.repoMode === 'choose' ? c.selected : null });
      commit(S => {
        const a = createAnalysis(S, nid('an'), { name: `${s.name} quick scan`, type: 'quick', selected: s.repos.map(r => r.name), infra: c.infra, stack: RUN_STACK }, s, null);
        a.fast = true;
        S.onboarding = { sourceId: s.id, scanId: a.id };
      });
      onDone();
    }, 1400);
  }

  const how = (
    <div className="container">
      <h2 className="c-header">How getting started works</h2>
      <div className="gs-how">
        {[['Connect', 'One organization to start. You can add more sources later.'],
          ['We scan your estate', "A quick read of your package manifests to see what you're running. Takes minutes."],
          ['Get a recommended plan', 'Which analyses to run next, which repositories to start with, and a recurring schedule.']].map(([t, d], i) => (
          <div key={t} className="row" style={{ alignItems: 'flex-start' }}>
            <span className={`n ${i === 0 ? 'cur' : ''}`}>{i + 1}</span>
            <div><b>{t}</b><div className="muted">{d}</div></div>
          </div>
        ))}
      </div>
    </div>
  );

  if (src) {
    return (
      <div className="stack">
        <Head title="Connect your source code">AWS Transform starts with a quick scan of your estate, then recommends which analyses to run. Nothing in your repositories is changed.</Head>
        {how}
        <Alert type="success">Connected to <b>{providerHost(src)}/{src.org}</b> as source <b>{src.name}</b>. {plural(src.repos.length, src.includePublic ? 'repository' : 'private repository', src.includePublic ? 'repositories' : 'private repositories')}.</Alert>
        <div className="wiz-actions">
          <button className="btn link" onClick={() => commit(S => { S.onboarding = null; })}>Connect a different source</button>
          <button className="btn primary" onClick={onDone}>Next: Review your estate</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <Head title="Connect your source code">AWS Transform starts with a quick scan of your estate, then recommends which analyses to run. Nothing in your repositories is changed.</Head>
      {how}
      <div className="container">
        <h2>Provider</h2>
        <p className="muted" style={{ margin: '4px 0 16px' }}>Where your repositories live.</p>
        <div className="prov-tiles" role="radiogroup" aria-label="Provider">
          {Object.entries(PROVIDERS).map(([k, p]) => (
            <label key={k} className={`prov-tile ${c.provider === k ? 'selected' : ''}`}>
              <input type="radio" name="gs-provider" checked={c.provider === k} onChange={() => { set('provider')(k); resetAccess({ auth: 'app' }); }} />
              <span><b>{p.name}</b><div className="small muted">{p.short}</div></span>
            </label>
          ))}
        </div>
      </div>
      <div className="container access">
        <h2>Access</h2>
        <p className="muted" style={{ margin: '4px 0 20px' }}>{useApp ? 'AWS Transform uses the permissions you approve for the AWS Connector app. No token to store or rotate.' : 'AWS Transform stores your token encrypted.'}</p>
        {c.provider === 'github' && (
          <div className="field" role="radiogroup" aria-label="How to connect">
            <span className="field-label">How to connect</span>
            <Choice name="gs-auth" checked={c.auth === 'app'} onChange={() => resetAccess({ auth: 'app' })} label="Sign in with GitHub"
              desc="Approve the AWS Connector app for your organization. No token to create or rotate." />
            <Choice name="gs-auth" checked={c.auth === 'token'} onChange={() => resetAccess({ auth: 'token' })} label="Personal access token"
              desc="For GitHub Enterprise Server, or if your organization doesn't allow app installs." />
          </div>
        )}
        <Field id="gs-name" label="Source name" desc="How this connection appears in AWS Transform." error={errors.name}
          hint={!errors.name && (nameTouched || !c.org ? '1–64 characters: letters, numbers and hyphens.' : 'Suggested from your organization.')}>
          <TextInput id="gs-name" invalid={errors.name} placeholder="e.g. acme-github" value={c.name} onChange={v => { setNameTouched(true); set('name')(v); }} />
        </Field>
        {pv.url && (
          <Field id="gs-url" label={pv.url} error={errors.url} hint={c.provider === 'gitlab' ? 'Leave empty for GitLab.com.' : 'Leave empty for Bitbucket Cloud.'}>
            <TextInput id="gs-url" invalid={errors.url} placeholder={c.provider === 'gitlab' ? 'https://gitlab.com' : 'https://bitbucket.example.com'} value={c.url} onChange={set('url')} />
          </Field>
        )}
        {useApp ? (
          <Field id="gs-app" label="GitHub connection" error={errors.app}
            desc={verified ? null : 'Opens GitHub in a new window. Choose your organization and which repositories AWS Transform can access.'}>
            {verified ? <>
              <div className="row">
                <span><Icon n="ok" s={16} /> Connected to <b>github.com/{c.org}</b> through the AWS Connector app.</span>
                <button className="btn link" onClick={connectApp}>Change</button>
              </div>
              <div className="ok-text">{c.appMode === 'select' ? `You gave the app access to ${plural(verified.length, 'selected repository', 'selected repositories')}.` : `The app can access all ${plural(verified.length, 'repository', 'repositories')}.`}</div>
            </> : <div><button id="gs-app" className="btn" onClick={connectApp} disabled={verifying}>{verifying ? <><Spinner /> Waiting for GitHub…</> : <>Connect to GitHub <Icon n="ext" s={14} /></>}</button></div>}
            {verifying && <GitHubPopup onClose={() => setVerifying(false)} onInstalled={onInstalled} />}
          </Field>
        ) : <>
        <Field id="gs-org" label={pv.org} optional desc="Leave blank to use every repository the token can access." error={errors.org}>
          <TextInput id="gs-org" invalid={errors.org} placeholder="e.g. acme-fintech" value={c.org} onChange={set('org')} />
        </Field>
        <Field id="gs-token" label="Personal access token" desc="Needs read access to code and write access to pull requests." error={errors.token}>
          <div className="row">
            <TextInput id="gs-token" type="password" invalid={errors.token} placeholder="Paste your personal access token" value={c.token} onChange={set('token')} disabled={!!verified} className="grow" />
            {verified
              ? <button className="btn" onClick={() => { setVerified(null); setRepoOpen(false); set('token')(''); setTimeout(() => document.getElementById('gs-token')?.focus()); }}>Change</button>
              : <button className="btn" onClick={verify} disabled={verifying}>{verifying ? <><Spinner /> Verifying…</> : 'Verify'}</button>}
          </div>
          {verified && <div className="ok-text">Verified. This token can access {plural(verified.length, 'repository', 'repositories')}.</div>}
        </Field>
        </>}
        <RepoAccess c={c} set={set} via={useApp ? 'app' : 'token'} all={verified} open={repoOpen} setOpen={setRepoOpen} error={errors.repos} />
      </div>
      <WhereItRuns c={c} set={set} open={runsOpen} setOpen={setRunsOpen} errors={errors} stackSt={stackSt} />
      <div className="wiz-actions">
        <span className="note">Next: a quick scan of your estate, so we can recommend analyses.</span>
        <button className="btn link" onClick={cancel}>Cancel</button>
        <button className="btn primary" onClick={connect} disabled={busy}>{busy ? <><Spinner /> Connecting…</> : 'Connect and scan'}</button>
      </div>
    </div>
  );
}

// Which repositories the source covers. Collapsed to a summary until the user chooses to edit.
function RepoAccess({ c, set, via, all, open, setOpen, error }) {
  const [q, setQ] = useState('');
  const gh = c.provider === 'github';
  const visible = all ? all.filter(r => via === 'app' || c.includePublic || r.vis === 'Private') : [];
  const nPublic = all ? all.filter(r => r.vis === 'Public').length : 0;
  const chosen = visible.filter(r => c.selected.includes(r.name));
  const list = visible.filter(r => r.name.toLowerCase().includes(q.trim().toLowerCase()));
  const pg = usePager(list.length, 10, q + c.includePublic);
  const page = pg.slice(list);
  const kind = gh && via !== 'app' && !c.includePublic ? 'private repositories' : 'repositories';
  const summary = c.repoMode === 'choose' ? `${chosen.length} of ${visible.length} ${kind} selected.` : `All ${visible.length} ${kind} this ${via === 'app' ? 'connection' : 'token'} can see.`;
  const toggle = (names, on) => set('selected')(on ? [...new Set([...c.selected, ...names])] : c.selected.filter(n => !names.includes(n)));
  const allOnPage = page.length > 0 && page.every(r => c.selected.includes(r.name));

  return (
    <div className="field" id="gs-repos">
      <div className="spread">
        <span className="field-label">Repositories</span>
        {all && <button className="btn link" onClick={() => setOpen(!open)}>{open ? 'Done' : 'Edit'}</button>}
      </div>
      {!all ? <div className="muted">{via === 'app' ? 'Available once you connect to GitHub.' : 'Available once the token is verified.'}</div>
        : !open ? <div className="muted">{summary}</div>
        : <div className="repo-edit">
            <div role="radiogroup" aria-label="Repositories">
              <Choice name="gs-repomode" checked={c.repoMode === 'all'} onChange={() => set('repoMode')('all')}
                label={`All ${visible.length} ${kind}`} desc="Covers every repository now, and new ones as they're added." />
              <Choice name="gs-repomode" checked={c.repoMode === 'choose'} onChange={() => { set('repoMode')('choose'); if (!c.selected.length) set('selected')(visible.map(r => r.name)); }}
                label="Choose repositories" desc="Only the ones you pick are scanned and analyzed." />
            </div>
            {gh && via !== 'app' && <>
              <hr />
              <Choice type="checkbox" checked={c.includePublic} label={`Include public repositories (${nPublic})`}
                desc="Off by default, so your first scan covers only the private repositories this token can see."
                onChange={v => { set('includePublic')(v); if (v && c.repoMode === 'choose') toggle(all.filter(r => r.vis === 'Public').map(r => r.name), true); }} />
            </>}
            {c.repoMode === 'choose' && (
              <div className="repo-pick">
                <div className="spread" style={{ padding: 12 }}>
                  <SearchInput value={q} onChange={setQ} placeholder="Find repositories" width="100%" />
                  <span className="muted" style={{ whiteSpace: 'nowrap' }}>{chosen.length} of {visible.length} selected</span>
                </div>
                <table className="tbl">
                  <thead><tr>
                    <th className="cb"><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={e => toggle(page.map(r => r.name), e.target.checked)} /></th>
                    <th>Repository</th><th>Visibility</th><th>Language</th>
                  </tr></thead>
                  <tbody>
                    {page.length ? page.map(r => {
                      const on = c.selected.includes(r.name);
                      return (
                        <tr key={r.name} className={on ? 'sel clickable' : 'clickable'} onClick={() => toggle([r.name], !on)}>
                          <td className="cb"><input type="checkbox" aria-label={r.name} checked={on} onChange={() => {}} /></td>
                          <td><b>{r.name}</b></td><td className="muted">{r.vis}</td><td className="muted">{langOf(r.name)}</td>
                        </tr>
                      );
                    }) : <tr><td colSpan={4} className="empty">No repositories match.</td></tr>}
                  </tbody>
                </table>
                <div className="spread" style={{ padding: '8px 12px' }}>
                  <span className="small muted">{list.length ? `${(page.length && list.indexOf(page[0]) + 1)}–${list.indexOf(page[page.length - 1]) + 1} of ${list.length}` : '0 of 0'}</span>
                  {pg.el}
                </div>
              </div>
            )}
          </div>}
      <ErrorText msg={error} />
    </div>
  );
}

// Collapsed by default to a one-line summary; most people keep AWS managed.
function WhereItRuns({ c, set, open, setOpen, errors, stackSt }) {
  const managed = c.infra === 'managed';
  const summary = !managed ? 'Customer owned, on a stack in your account'
    : c.roleMode === 'existing' ? `AWS managed, with ${c.role || 'your existing role'}`
    : open ? 'AWS managed. Nothing to deploy.' : 'AWS managed. Nothing to deploy; we create the execution role.';
  const head = (
    <div className="spread">
      <span><b>Where it runs</b> <span className="muted">· {summary}</span></span>
      <button className="btn link" onClick={() => setOpen(!open)}>{open ? 'Done' : 'Change'}</button>
    </div>
  );
  if (!open) return <div className="container runs-box">{head}</div>;
  const deployed = stackSt === 'Deployed';
  return (
    <div className="container runs-box">
      {head}
      <div className="prov-tiles two" role="radiogroup" aria-label="Where it runs" style={{ marginTop: 16 }}>
        <Tile name="gs-infra" checked={managed} onChange={() => set('infra')('managed')} title="AWS managed" desc="Runs on infrastructure AWS Transform manages. Nothing to deploy." />
        <Tile name="gs-infra" checked={!managed} onChange={() => set('infra')('customer')} title="Customer owned" desc="Runs on a stack in your own AWS account, so code never leaves it." />
      </div>
      {managed ? (
        <div className="runs-role">
          <b>Execution role</b>
          <div>
            <div className="row" style={{ gap: 20 }} role="radiogroup" aria-label="Execution role">
              <Choice name="gs-role" checked={c.roleMode === 'create'} onChange={() => set('roleMode')('create')} label="Create one for me" />
              <Choice name="gs-role" checked={c.roleMode === 'existing'} onChange={() => set('roleMode')('existing')} label="Use an existing role" />
            </div>
            {c.roleMode === 'create'
              ? <div className="small muted" style={{ marginTop: 6 }}>AWS Transform creates a role that trusts it, with only the permissions these runs need.</div>
              : <Field id="gs-role" error={errors.role} hint="Roles in this account that AWS Transform can assume." style={{ marginTop: 10 }}>
                  <Select id="gs-role" value={c.role} invalid={errors.role} placeholder="Choose a role" options={ROLES} style={{ maxWidth: 420 }} onChange={set('role')} />
                </Field>}
          </div>
        </div>
      ) : (
        <div className="runs-stack" id="gs-stack">
          <div><b>Stack in this account</b> <Status s={stackSt} /></div>
          <p style={{ margin: '6px 0' }}>{deployed
            ? <><span className="mono">{RUN_STACK}</span> is ready. This scan and every scheduled run use it.</>
            : 'Deploy it once with CloudFormation. This scan and every scheduled run use it, and you choose when runs start. Takes about 10 minutes.'}</p>
          {stackSt === 'Not deployed' && <a href="#" style={{ fontWeight: 700 }} onClick={e => { e.preventDefault(); commit(S => { S.infra[RUN_STACK] = { startedAt: Date.now(), version: '1.4.2', op: 'deploy' }; }); }}>Deploy stack in CloudFormation <Icon n="ext" s={14} /></a>}
          <ErrorText msg={errors.stack} />
        </div>
      )}
    </div>
  );
}

/* ---------- step 2 ---------- */
// Laid out like a run page: progress, early findings as each repository finishes, then what happens next.
function EstateStep({ src, scan, onPrev, onNext }) {
  const st = aStatus(scan);
  const scanning = st !== 'Completed';
  const done = aDone(scan), n = scan.repos.length;
  const pct = Math.round(done / n * 100);
  const left = Math.max(0, aEnd(scan) - Date.now());
  const eta = left < 60000 ? 'under a minute' : `about ${plural(Math.ceil(left / 60000), 'minute')}`;
  const states = repoStates(scan);
  const e = estate(scan.repos.filter((_, i) => states[i] === 'Completed'));
  const findings = aFindings(scan).sort((a, b) => b.at - a.at);
  // Newest finding from each repository first, so the preview isn't all one repository.
  const seen = new Set();
  const preview = [...findings.filter(f => !seen.has(f.repo) && seen.add(f.repo)), ...findings].filter((f, i, arr) => arr.indexOf(f) === i).slice(0, 6);

  return (
    <div className="stack">
      {scanning
        ? <Alert type="success"><b>Quick scan has begun for {src.org}.</b> It reads package manifests only; nothing in your repositories is changed. You can leave this page.</Alert>
        : <Alert type="success"><b>Quick scan complete for {src.org}.</b> Next, set up the analyses that go deeper and keep them running on a schedule.</Alert>}

      <div>
        <div className="row" style={{ gap: 12 }}><h1>{scan.name}</h1><span className={`pill ${scanning ? '' : 'ok'}`}>{scanning ? 'In progress' : 'Completed'}</span></div>
        <p className="muted" style={{ marginTop: 6 }}>{typeName('quick')} · {plural(n, 'repository', 'repositories')} in {providerHost(src)}/{src.org} · Package manifests only</p>
      </div>

      <div className="container">
        <div className="spread c-header"><h2>Quick scan</h2><span className="muted">{scanning ? `Finishes in ${eta}` : 'Finished'}</span></div>
        <div className="spread"><b>Overall</b><span>{done} of {plural(n, 'repository', 'repositories')} · {pct}%</span></div>
        <div className="bar" style={{ marginTop: 6 }}><span style={{ width: `${pct}%` }} /></div>
        <hr className="sep" />
        <div className="stat-row">
          <div className="stat"><div className="k">Repositories scanned</div><div className="v">{e.repos}</div></div>
          <div className="stat"><div className="k">Outdated dependencies</div><div className="v">{e.deps}</div></div>
          <div className="stat"><div className="k">On end-of-support runtimes</div><div className="v bad">{e.eos}</div></div>
          <div className="stat"><div className="k">Shared libraries</div><div className="v">{e.shared}</div></div>
        </div>
      </div>

      <div className="container">
        <h2>{scanning ? 'Early findings' : 'Findings'} <span className="counter">({findings.length}{scanning ? ' so far' : ''})</span></h2>
        <p className="muted" style={{ margin: '4px 0 14px' }}>{scanning ? 'Findings appear here as each repository finishes.' : 'The newest findings from the quick scan.'}</p>
        <table className="tbl">
          <thead><tr><th>Finding</th><th>Repository</th><th>Severity</th></tr></thead>
          <tbody>
            {preview.length ? preview.map(f => (
              <tr key={f.key}><td>{f.title}</td><td>{f.repo}</td><td>{f.sev}</td></tr>
            )) : <tr><td colSpan={3} className="empty">No findings yet. The first ones appear in a few seconds.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="wiz-actions">
        <button className="btn link" onClick={cancel}>Cancel</button>
        <button className="btn" onClick={onPrev}>Previous</button>
        <button className="btn primary" onClick={onNext} disabled={scanning}>Set up continuous analysis</button>
      </div>
    </div>
  );
}

/* ---------- step 3 ---------- */
function ScheduleStep({ src, scan, picked, setPicked, def, setDef, onPrev }) {
  const types = ORDER.filter(t => picked.includes(t));
  const [freqs, setFreqs] = useState(() => Object.fromEntries(ORDER.map(t => [t, ANALYSIS_META[t].freq])));
  const [day, setDay] = useState('Monday');
  const [time, setTime] = useState('06:00');
  const e = estate(scan.repos);
  const name = `${src.name}-baseline`.slice(0, 64);

  function run() {
    const groupId = commit(S => {
      const g = startRun(S, { name, src, types, def, repos: src.repos.map(r => r.name), freqs, watch: true, rescan: false, includeNew: true, day, time, infra: 'managed' });
      S.onboarding = null;
      return g.id;
    });
    const S = db();
    const g = S.runs.find(x => x.id === groupId);
    const left = Math.max(0, ...g.analysisIds.map(id => aEnd(S.analyses.find(x => x.id === id))) ) - Date.now();
    go('#/web/cm/analyses', { type: 'success', text: <><b>Continuous analysis started.</b> The quick scan found {plural(aFindings(scan).length, 'finding')}. The rest finish in {left < 60000 ? 'under a minute' : `about ${plural(Math.ceil(left / 60000), 'minute')}`}. <a href="#/web/cm/findings">View findings</a></> });
  }

  return (
    <div className="stack">
      <Head title="Schedule and run">Here's how we'll keep {src.org} current, based on your scan. Each analysis starts today and repeats on the schedule below. Change anything you need to.</Head>
      <ScheduleTable org={src.org} types={types} freqs={freqs} setFreq={(t, v) => setFreqs(f => ({ ...f, [t]: v }))}
        intro="Your code, its dependencies and the threats against them change every week. These analyses re-run on their own, so your findings always match your estate today, not the day you first scanned it. You'll only hear about what's new or changed."
        onAdd={t => setPicked(p => [...p, t])} onRemove={t => setPicked(p => p.filter(x => x !== t))} why={t => whyFromScan(t, e)}
        def={def} setDef={setDef} day={day} setDay={setDay} time={time} setTime={setTime} />
      <ReviewBox src={src} types={types} freqs={freqs} day={day} time={time} repos={src.repos.length} />
      <div className="wiz-actions">
        <button className="btn link" onClick={cancel}>Cancel</button>
        <button className="btn" onClick={onPrev}>Previous</button>
        <button className="btn primary" onClick={run} disabled={!types.length}>{isRecurring(types, freqs) || !types.length ? 'Begin continuous analysis' : `Run ${types.length === 1 ? 'analysis' : 'analyses'} once`}</button>
      </div>
    </div>
  );
}
