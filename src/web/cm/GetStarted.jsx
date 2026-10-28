import { useState } from 'react';
import { commit, nid, useStore } from '../../lib/store';
import { go } from '../../lib/router';
import { ANALYSIS_META, CUSTOM_DEFS, PLAN, PROVIDERS, aDone, stackStatus, aStatus, repoStates, createAnalysis, estate, providerHost, startRun, typeName } from '../../lib/domain';
import { focusFirstError, plural } from '../../lib/format';
import { Alert, Breadcrumbs, Choice, ErrorText, Field, Icon, Select, Spinner, Status, TextInput, Tile } from '../../components/ui';
import { createSource, validateSource } from './ConnectSource';
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
  const [c, setC] = useState({ provider: 'github', org: '', token: '', url: '', includePublic: false, name: '', infra: 'managed', roleMode: 'create', role: '' });
  const [runsOpen, setRunsOpen] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
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
  function connect() {
    const e = validateSource(c);
    if (c.infra === 'managed' && c.roleMode === 'existing' && !c.role) e.role = 'Choose a role, or let AWS Transform create one.';
    if (c.infra === 'customer' && stackSt !== 'Deployed') e.stack = stackSt === 'Not deployed' ? 'Deploy the stack first, or run on AWS managed.' : 'Wait for the stack to finish deploying.';
    setErrors(e);
    if (e.role || e.stack) setRunsOpen(true);
    if (Object.keys(e).length) { setTimeout(focusFirstError); return; }
    setBusy(true);
    setTimeout(() => {
      const s = createSource(c);
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
              <input type="radio" name="gs-provider" checked={c.provider === k} onChange={() => { set('provider')(k); setErrors({}); }} />
              <span><b>{p.name}</b><div className="small muted">{p.short}</div></span>
            </label>
          ))}
        </div>
      </div>
      <div className="container">
        <h2>Access</h2>
        <p className="muted" style={{ margin: '4px 0 0' }}>AWS Transform stores your token encrypted.</p>
        {pv.url && (
          <Field id="gs-url" label={pv.url} error={errors.url} hint={c.provider === 'gitlab' ? 'Leave empty for GitLab.com.' : 'Leave empty for Bitbucket Cloud.'}>
            <TextInput id="gs-url" invalid={errors.url} placeholder={c.provider === 'gitlab' ? 'https://gitlab.com' : 'https://bitbucket.example.com'} value={c.url} onChange={set('url')} />
          </Field>
        )}
        <Field id="gs-org" label={pv.org} error={errors.org} style={{ marginTop: 20 }}>
          <TextInput id="gs-org" invalid={errors.org} placeholder="acme-platform" value={c.org} onChange={set('org')} />
        </Field>
        <Field id="gs-token" label="Personal access token" error={errors.token}>
          <TextInput id="gs-token" type="password" invalid={errors.token} placeholder="Paste your personal access token" value={c.token} onChange={set('token')} />
        </Field>
        <Alert type="info" title="Why these scopes" style={{ maxWidth: 640, marginTop: 12 }}>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {pv.scopeWhy.map(([scope, why]) => <li key={scope}><span className="mono">{scope}</span> {why}</li>)}
          </ul>
        </Alert>
        {c.provider === 'github' && (
          <div className="field" style={{ marginTop: 16 }}>
            <Choice type="checkbox" checked={c.includePublic} onChange={set('includePublic')} label="Include public repositories"
              desc="Off by default, so your first scan covers only the private repositories this token can see." />
          </div>
        )}
        <Field id="gs-name" label="Source name" error={errors.name}
          hint={!errors.name && `${nameTouched || !c.org ? '' : 'Suggested from your organization. '}1–64 characters: letters, numbers and hyphens.`}>
          <TextInput id="gs-name" invalid={errors.name} placeholder="acme-platform-github" value={c.name} onChange={v => { setNameTouched(true); set('name')(v); }} />
        </Field>
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
function EstateStep({ src, scan, onPrev, onNext }) {
  const st = aStatus(scan);
  const done = aDone(scan), n = scan.repos.length;
  const scope = src.includePublic ? 'repositories' : 'private repositories';
  const actions = (
    <div className="wiz-actions">
      <button className="btn link" onClick={cancel}>Cancel</button>
      <button className="btn" onClick={onPrev}>Previous</button>
      <button className="btn primary" onClick={onNext} disabled={st !== 'Completed'}>Set up continuous analysis</button>
    </div>
  );

  const scanning = st !== 'Completed';
  const states = repoStates(scan);
  const e = estate(scan.repos.filter((_, i) => states[i] === 'Completed'));
  const maxLang = Math.max(1, ...e.langs.map(l => l.count));
  return (
    <div className="stack">
      {scanning ? <>
        <Head title={`Scanning ${src.org}`}>A quick scan of your package manifests. Results fill in below as each repository is read. We'll use them to recommend which analyses to run.</Head>
        <Alert type="info" title={`Reading package manifests in ${n} ${scope}…`}>
          <div className="row" style={{ gap: 16, marginTop: 8 }}><div className="progress grow"><span style={{ width: `${Math.round(done / n * 100)}%` }} /></div><span className="small">{done} of {n}</span></div>
          <div className="small muted" style={{ marginTop: 6 }}>This usually takes under a minute. You can leave this page; the scan keeps running.</div>
        </Alert>
      </> : <>
        <Head title={`Here's what's in ${src.org}`}>From a quick scan of your package manifests. We'll use this to recommend which analyses to run.</Head>
        <Alert type="success">Connected to <b>{providerHost(src)}/{src.org}</b>. Scanned {n} {scope}.</Alert>
        <Alert type="info">This scan only reads manifests. Next, we'll set up the analyses that go deeper, based on what we found here, and keep them running on a schedule.</Alert>
      </>}

      <div className="container">
        <h2 className="c-header">Estate at a glance{scanning && <span className="counter"> (so far, {done} of {n} repositories)</span>}</h2>
        <div className="stat-row">
          <div className="stat"><div className="k">Repositories scanned</div><div className="v">{e.repos}</div></div>
          <div className="stat"><div className="k">Outdated dependencies</div><div className="v">{e.deps}</div></div>
          <div className="stat"><div className="k">On end-of-support runtimes</div><div className="v bad">{e.eos}</div><div className="small muted">{e.eosPct}% of repositories</div></div>
          <div className="stat"><div className="k">Shared libraries</div><div className="v">{e.shared}</div><div className="small muted">Used by other repositories here</div></div>
        </div>
      </div>

      <div className="container">
        <h2>Exposures detected <span className="counter">({e.exposures.length})</span></h2>
        <p className="muted" style={{ margin: '4px 0 14px' }}>Runtimes, frameworks and libraries past end of support, and how many of your shared libraries each one touches.</p>
        <table className="tbl">
          <thead><tr><th>Exposure</th><th>Type</th><th>Repositories</th><th>Support status</th><th>Shared libraries affected</th></tr></thead>
          <tbody>
            {e.exposures.length ? e.exposures.map(x => (
              <tr key={x.name}>
                <td><b>{x.name}</b></td><td>{x.type}</td><td>{x.repos}</td>
                <td><Status cls="err" icon="err">End of support</Status></td>
                <td>{x.shared ? `${x.shared} of ${e.shared}` : 'None'}</td>
              </tr>
            )) : <tr><td colSpan={5} className="empty">{scanning ? 'None found yet.' : 'No end-of-support runtimes, frameworks or libraries found.'}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="container">
        <h2 className="c-header">By language</h2>
        {!e.langs.length && <p className="muted">Languages appear here as repositories are read.</p>}
        {e.langs.map(l => (
          <div key={l.lang} className="lang-row">
            <span>{l.label}</span>
            <div className="bar"><span style={{ width: `${(l.count / maxLang) * 100}%` }} /></div>
            <span className="muted">{l.count} · {l.eos ? `${l.eos} on ${l.runtime}` : 'all supported'}</span>
          </div>
        ))}
      </div>

      {actions}
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
    go(`#/web/cm/runs/${groupId}`);
  }

  return (
    <div className="stack">
      <Head title="Schedule and run">Here's how we'll keep {src.org} current, based on your scan. Each analysis starts today and repeats on the schedule below. Change anything you need to.</Head>
      <ScheduleTable org={src.org} types={types} freqs={freqs} setFreq={(t, v) => setFreqs(f => ({ ...f, [t]: v }))}
        intro="Your code, its dependencies and the threats against them change every week. These analyses re-run on their own, so your findings always match your estate today, not the day you first scanned it. You'll only hear about what's new or changed."
        onAdd={t => setPicked(p => [...p, t])} onRemove={t => setPicked(p => p.filter(x => x !== t))} why={(t, f) => whyFromScan(t, e, f)}
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
