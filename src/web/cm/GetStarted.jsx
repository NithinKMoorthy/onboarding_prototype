import { useState } from 'react';
import { commit, nid, openModal, useStore } from '../../lib/store';
import { go } from '../../lib/router';
import { ANALYSIS_META, CUSTOM_DEFS, PROVIDERS, aDone, aStatus, createAnalysis, estate, nextWeekday, providerHost, typeName } from '../../lib/domain';
import { fmtTime, focusFirstError, plural } from '../../lib/format';
import { Alert, Breadcrumbs, Choice, ErrorText, Field, Icon, Select, Spinner, Status, TextInput } from '../../components/ui';
import { createSource, validateSource } from './ConnectSource';

/* First-run flow: connect a source → quick scan → recommended analyses → schedule. */

const STEPS = ['Connect source', 'Review your estate', 'Choose analysis', 'Schedule and run'];
const RECOMMENDED = ['comprehensive', 'modernization', 'agentic'];
const OTHER = ['security', 'custom'];

export default function GetStarted() {
  const S = useStore();
  const ob = S.onboarding || {};
  const src = S.sources.find(s => s.id === ob.sourceId);
  const scan = S.analyses.find(a => a.id === ob.scanId);
  const [step, setStep] = useState(src && scan ? 2 : 1);
  const [picked, setPicked] = useState(RECOMMENDED);
  const [def, setDef] = useState(CUSTOM_DEFS[0]);
  const goStep = n => { setStep(n); window.scrollTo(0, 0); };
  const reached = Math.max(step, src && scan ? 2 : 1);

  let body;
  if (step === 1 || !src || !scan) body = <ConnectStep src={src} onDone={() => goStep(2)} />;
  else if (step === 2) body = <EstateStep src={src} scan={scan} onPrev={() => goStep(1)} onNext={() => goStep(3)} />;
  else if (step === 3) body = <ChooseStep scan={scan} picked={picked} setPicked={setPicked} def={def} setDef={setDef} onPrev={() => goStep(2)} onNext={() => goStep(4)} />;
  else body = <ScheduleStep src={src} scan={scan} picked={picked} def={def} onPrev={() => goStep(3)} />;

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
  const [c, setC] = useState({ provider: 'github', org: '', token: '', url: '', includePublic: false, name: '' });
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

  function connect() {
    const e = validateSource(c);
    setErrors(e);
    if (Object.keys(e).length) { focusFirstError(); return; }
    setBusy(true);
    setTimeout(() => {
      const s = createSource(c);
      commit(S => {
        const a = createAnalysis(S, nid('an'), { name: `${s.name} quick scan`, type: 'quick', selected: s.repos.map(r => r.name), infra: 'managed' }, s, null);
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
          ['Run a quick scan', 'Tech debt (quick) reads package manifests for outdated dependencies and stale versions. Results in minutes.'],
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
        <Head title="Connect your source code">AWS Transform starts with a quick scan to show what's in your estate, then recommends where to go deeper. Nothing in your repositories is changed.</Head>
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
      <Head title="Connect your source code">AWS Transform starts with a quick scan to show what's in your estate, then recommends where to go deeper. Nothing in your repositories is changed.</Head>
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
      <div className="wiz-actions">
        <span className="note">Next: a quick tech debt scan of your package manifests.</span>
        <button className="btn link" onClick={cancel}>Cancel</button>
        <button className="btn primary" onClick={connect} disabled={busy}>{busy ? <><Spinner /> Connecting…</> : 'Connect and run quick scan'}</button>
      </div>
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
      <button className="btn primary" onClick={onNext} disabled={st !== 'Completed'}>See recommendations</button>
    </div>
  );

  if (st !== 'Completed') {
    const pct = Math.round(done / n * 100);
    return (
      <div className="stack">
        <Head title={`Scanning ${src.org}`}>A quick scan of your package manifests. We'll use this to recommend which analyses to run.</Head>
        <Alert type="info" title={`Reading package manifests in ${n} ${scope}…`}>
          <div className="row" style={{ gap: 16, marginTop: 8 }}><div className="progress grow"><span style={{ width: `${pct}%` }} /></div><span className="small">{done} of {n}</span></div>
          <div className="small muted" style={{ marginTop: 6 }}>This usually takes under a minute. You can leave this page; the scan keeps running.</div>
        </Alert>
        {actions}
      </div>
    );
  }

  const e = estate(scan.repos);
  const maxLang = Math.max(...e.langs.map(l => l.count));
  return (
    <div className="stack">
      <Head title={`Here's what's in ${src.org}`}>From a quick scan of your package manifests. We'll use this to recommend which analyses to run.</Head>
      <Alert type="success">Connected to <b>{providerHost(src)}/{src.org}</b>. Scanned {n} {scope}.</Alert>

      <div className="container">
        <h2 className="c-header">Estate at a glance</h2>
        <div className="stat-row">
          <div className="stat"><div className="k">Repositories</div><div className="v">{e.repos}</div></div>
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
            )) : <tr><td colSpan={5} className="empty">No end-of-support runtimes, frameworks or libraries found.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="container">
        <h2 className="c-header">By language</h2>
        {e.langs.map(l => (
          <div key={l.lang} className="lang-row">
            <span>{l.label}</span>
            <div className="bar"><span style={{ width: `${(l.count / maxLang) * 100}%` }} /></div>
            <span className="muted">{l.count} · {l.eos ? `${l.eos} on ${l.runtime}` : 'all supported'}</span>
          </div>
        ))}
      </div>

      <Alert type="info">This scan only reads manifests. Next, we'll recommend the analyses that go deeper, based on what we found here.</Alert>
      {actions}
    </div>
  );
}

/* ---------- step 3 ---------- */
function fromScan(type, e) {
  if (type === 'comprehensive') return `${e.deps} outdated dependencies and ${e.eos} repositories on end-of-support runtimes${e.sharedEos ? `, including ${plural(e.sharedEos, 'shared library', 'shared libraries')} other repositories depend on` : ''}.`;
  if (type === 'modernization') return e.java8 || e.spring27
    ? `${e.java8} repositories on Java 8${e.spring27 ? ` and ${e.spring27} on Spring Boot 2.7` : ''} need a runtime or framework upgrade anyway.`
    : `${e.eos} repositories need a runtime upgrade anyway.`;
  return `${e.eos} repositories need remediation, and AWS Transform carries out remediations with agents.`;
}

function ChooseStep({ scan, picked, setPicked, def, setDef, onPrev, onNext }) {
  const [error, setError] = useState('');
  const e = estate(scan.repos);
  const toggle = t => { setError(''); setPicked(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]); };
  const next = () => { if (!picked.length) { setError('Choose at least one analysis.'); return; } onNext(); };

  return (
    <div className="stack">
      <Head title="Choose what to analyze next">Your quick scan shows what's outdated. These three analyses show what remediating it involves, what to modernize toward while you're in the code, and how well agents can carry out the work.</Head>
      <div className="container">
        <div className="spread">
          <h2>Recommended analyses</h2>
          <a href="#" onClick={ev => { ev.preventDefault(); openModal('compareTypes'); }}><b>Compare all analysis types</b></a>
        </div>
        <p className="muted" style={{ margin: '4px 0 10px' }}>Each one is based on a specific result from your quick scan. Choose one or more.</p>
        <div style={{ marginBottom: 14 }}><Status s="Completed"><b>Tech debt (quick)</b>&nbsp;completed in step 2</Status></div>
        <ErrorText msg={error} />
        {RECOMMENDED.map(t => (
          <label key={t} className={`rec-card ${picked.includes(t) ? 'selected' : ''}`}>
            <div className="row">
              <input type="checkbox" checked={picked.includes(t)} onChange={() => toggle(t)} />
              <h3>{typeName(t)}</h3><span className="badge green">Recommended</span>
            </div>
            <div className="rec-cols">
              <div><div className="eyebrow">From your quick scan</div>{fromScan(t, e)}</div>
              <div><div className="eyebrow">What you'll learn</div>{ANALYSIS_META[t].learn}</div>
            </div>
          </label>
        ))}
        <div className="expander" style={{ marginTop: 20 }}>
          <b>Other analysis types</b>
          <div style={{ marginTop: 10 }}>
            {OTHER.map(t => (
              <Choice key={t} type="checkbox" checked={picked.includes(t)} onChange={() => toggle(t)} label={typeName(t)}
                desc={t === 'security' ? 'Detects CVEs, exposed secrets and insecure configurations in your code and dependencies, using the AWS Security Agent.' : 'Run a transformation definition your platform team maintains, including your own policies.'}>
                {t === 'custom' && (
                  <Field id="gs-def" label="Transformation definition" style={{ marginTop: 8 }}>
                    <Select id="gs-def" value={def} onChange={setDef} options={CUSTOM_DEFS} />
                  </Field>
                )}
              </Choice>
            ))}
          </div>
        </div>
      </div>
      <div className="wiz-actions">
        <button className="btn link" onClick={cancel}>Cancel</button>
        <button className="btn" onClick={onPrev}>Previous</button>
        <button className="btn primary" onClick={next}>Next: Schedule and run</button>
      </div>
    </div>
  );
}

/* ---------- step 4 ---------- */
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIMES = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
const ORDER = ['quick', 'comprehensive', 'modernization', 'agentic', 'security', 'custom'];

function ScheduleStep({ src, scan, picked, def, onPrev }) {
  const types = ORDER.filter(t => picked.includes(t));
  const [mode, setMode] = useState('watch');
  const [freqs, setFreqs] = useState(() => Object.fromEntries(['quick', ...types].map(t => [t, ANALYSIS_META[t].freq])));
  const [day, setDay] = useState('Monday');
  const [time, setTime] = useState('06:00');
  const [includeNew, setIncludeNew] = useState(true);
  const [email, setEmail] = useState('');
  const [slack, setSlack] = useState('');
  const [name, setName] = useState(`${src.name}-baseline`.slice(0, 64));
  const [editName, setEditName] = useState(false);
  const [errors, setErrors] = useState({});
  const watch = mode === 'watch';
  const n = src.repos.length;
  const firstRun = nextWeekday(day, time);
  const firstRunLabel = new Date(firstRun).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  // Matches the simulation: repos start 2.5s apart and take up to 14s each.
  const etaMin = Math.max(1, Math.ceil(((n - 1) * 2.5 + 14) / 60));

  const groups = {};
  ['quick', ...types].forEach(t => { (groups[freqs[t]] = groups[freqs[t]] || []).push(ANALYSIS_META[t].short); });
  const scheduleText = watch
    ? `Now, then ${Object.entries(groups).map(([f, names]) => `${names.join(', ')} ${f.toLowerCase()}`).join('; ')}, ${day}s ${time} PT`
    : 'Now, once';

  function run() {
    const e = {};
    if (!/^[A-Za-z0-9-]{1,64}$/.test(name)) { e.name = 'Use 1–64 letters, numbers and hyphens.'; setEditName(true); }
    if (watch) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) e.email = 'Enter an email address for the digest.';
      if (slack && !/^#[a-z0-9_-]{1,80}$/.test(slack.trim())) e.slack = 'Use a channel name like #modernization.';
    }
    setErrors(e);
    if (Object.keys(e).length) { focusFirstError(); return; }

    const started = commit(S => {
      const list = types.map(t => {
        const a = createAnalysis(S, nid('an'), { name: `${name} · ${typeName(t)}`, type: t, def: t === 'custom' ? def : null, selected: src.repos.map(r => r.name), infra: 'managed' }, src, null);
        return a;
      });
      if (watch) {
        ['quick', ...types].forEach(t => {
          const sch = { id: nid('sch'), name: `${name}-${t}`, infra: 'AWS managed', frequency: freqs[t], type: t, sourceId: src.id, repos: src.repos.map(r => r.name), role: '', createdAt: Date.now(), startAt: firstRun, tz: 'PT', includeNew, notify: { email: email.trim(), slack: slack.trim() } };
          S.schedules.push(sch);
          const a = list.find(x => x.type === t);
          if (a) a.scheduleId = sch.id;
        });
      }
      S.onboarding = null;
      return list;
    });
    go('#/web/cm/dashboard', { type: 'success', text: `Started ${plural(started.length, 'analysis', 'analyses')} on ${plural(n, 'repository', 'repositories')}.${watch ? ` Recurring runs start ${firstRunLabel}, and the digest goes to ${email.trim()}.` : ''}` });
  }

  return (
    <div className="stack">
      <Head title="Schedule and run">Dependencies go stale and runtimes reach end of support all the time. Recurring analysis catches changes as they appear, so your findings stay current.</Head>

      <div className="container">
        <h2 className="c-header">How often to analyze</h2>
        <div className="prov-tiles two">
          <label className={`prov-tile ${watch ? 'selected' : ''}`}>
            <input type="radio" name="gs-mode" checked={watch} onChange={() => setMode('watch')} />
            <span><b style={{ fontSize: 16 }}>Analyze now, then keep watching</b><div style={{ margin: '4px 0' }}><span className="badge green">Recommended</span></div>
              <div>Get results now, then recurring runs across {src.org}. You're notified only about what's new or changed.</div></span>
          </label>
          <label className={`prov-tile ${!watch ? 'selected' : ''}`}>
            <input type="radio" name="gs-mode" checked={!watch} onChange={() => setMode('once')} />
            <span><b style={{ fontSize: 16 }}>Run once</b><div style={{ marginTop: 4 }}>A one-time snapshot. You can turn on recurring analysis later from the analysis page.</div></span>
          </label>
        </div>

        {watch && (
          <>
            <div style={{ marginTop: 20 }}><b>Recommended schedule</b><div className="small muted">Each analysis runs as often as what it checks tends to change.</div></div>
            <table className="tbl sched-tbl" style={{ marginTop: 10 }}>
              <thead><tr><th>Analysis</th><th>Frequency</th><th>Why</th></tr></thead>
              <tbody>
                {['quick', ...types].map(t => (
                  <tr key={t}>
                    <td><b>{typeName(t)}</b></td>
                    <td><Select className="input" aria-label={`${typeName(t)} frequency`} value={freqs[t]} onChange={v => setFreqs(f => ({ ...f, [t]: v }))} options={['Daily', 'Weekly', 'Monthly']} /></td>
                    <td className="muted">{ANALYSIS_META[t].why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row" style={{ gap: 16, marginTop: 16, alignItems: 'flex-start' }}>
              <Field id="gs-day" label="Run on" style={{ flex: '0 0 230px' }}><Select id="gs-day" value={day} onChange={setDay} options={DAYS} /></Field>
              <Field id="gs-time" label="At" style={{ flex: '0 0 230px', marginTop: 0 }}><Select id="gs-time" value={time} onChange={setTime} options={TIMES.map(t => [t, `${t} PT`])} /></Field>
            </div>
            <div className="field" style={{ marginTop: 16 }}>
              <Choice type="checkbox" checked={includeNew} onChange={setIncludeNew} label={`Include new repositories added to ${src.org}`} desc="New repositories are picked up by the next run." />
            </div>
          </>
        )}
      </div>

      {watch && (
        <div className="container">
          <h2>Where to send updates</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>A digest after each run with only the findings that are new or changed since the last one.</p>
          <div className="split" style={{ maxWidth: 720, marginTop: 16, alignItems: 'start' }}>
            <Field id="gs-email" label="Email" error={errors.email}><TextInput id="gs-email" type="email" invalid={errors.email} placeholder="platform-team@example.com" value={email} onChange={v => { setEmail(v); setErrors(x => ({ ...x, email: undefined })); }} /></Field>
            <Field id="gs-slack" label="Slack channel" optional error={errors.slack} style={{ marginTop: 0 }}><TextInput id="gs-slack" invalid={errors.slack} placeholder="#modernization" value={slack} onChange={v => { setSlack(v); setErrors(x => ({ ...x, slack: undefined })); }} /></Field>
          </div>
        </div>
      )}

      <div className="container">
        <h2 className="c-header">Review</h2>
        <div className="review-grid">
          <div><div className="k">Source</div>{src.org} ({PROVIDERS[src.provider].name})</div>
          <div><div className="k">Analyses</div>{types.map(typeName).join(', ')}</div>
          <div><div className="k">Repositories</div>{n}{watch && includeNew && <span className="muted">, plus new ones as they're added</span>}</div>
          <div><div className="k">Schedule</div>{scheduleText}</div>
          <div>
            <div className="k">Name</div>
            {editName
              ? <><TextInput id="gs-aname" invalid={errors.name} value={name} onChange={v => { setName(v); setErrors(x => ({ ...x, name: undefined })); }} /><ErrorText msg={errors.name} /></>
              : <>{name} <button className="btn link small" onClick={() => setEditName(true)}>Edit</button></>}
          </div>
          <div><div className="k">First results</div>In about {plural(etaMin, 'minute')} (around {fmtTime(Date.now() + etaMin * 60000)})</div>
        </div>
        <hr style={{ border: 0, borderTop: '1px solid var(--border-light)', margin: '16px 0' }} />
        <b>What you'll get</b>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: '24px' }}>
          {types.map(t => <li key={t}>{ANALYSIS_META[t].get}</li>)}
          {watch && <li>A digest of new and changed findings after each run, starting {firstRunLabel}</li>}
        </ul>
        <p className="small muted" style={{ marginTop: 12 }}>Quick scan findings from step 2 ({plural(scan.repos.length, 'repository', 'repositories')}) are already on the Findings tab.</p>
      </div>

      <div className="wiz-actions">
        <button className="btn link" onClick={cancel}>Cancel</button>
        <button className="btn" onClick={onPrev}>Previous</button>
        <button className="btn primary" onClick={run}>{watch ? 'Run and keep watching' : `Run ${plural(types.length, 'analysis', 'analyses')}`}</button>
      </div>
    </div>
  );
}
