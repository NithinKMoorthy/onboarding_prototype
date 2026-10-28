import { useState } from 'react';
import { commit, toast, useStore } from '../../lib/store';
import { go, useRoute } from '../../lib/router';
import { ACCOUNT, ANALYSIS_META, CUSTOM_DEFS, PLAN, PROVIDERS, aFindings, estate, repoStatus, runStacks, staleness, startRun, timeline, typeName, uniqueRunName } from '../../lib/domain';
import { ago, focusFirstError, plural } from '../../lib/format';
import { Breadcrumbs, Choice, Dropdown, Field, Icon, SearchInput, Select, usePager } from '../../components/ui';
import { ConnectSourceForm } from './ConnectSource';
import { FREQ_OPTIONS, ORDER, ReviewBox, ScheduleTable, isRecurring, whyFromScan } from './ScheduleTable';

/* Run new analysis: the same continuous plan as Get started, pre-filled from the last analysis (or today's scan).
   Entry points can pre-fill it: ?type= (analysis catalog), ?repo= (a repository), ?from= (a stale analysis). */

// Roles in this account that AWS Transform can assume (simulated).
const ROLES = ['AWSTransformExecutionRole', 'ATX-ContinuousModernization-Role', 'platform-eng-transform-role', 'security-scanning-role'];
// Catalog layout: every analysis type, with a one-line pitch grounded in the last analysis when there is one.
const CATALOG = ['comprehensive', 'security', 'modernization', 'agentic', 'quick', 'custom'];
const GENERIC = {
  comprehensive: 'Code-level review across dependencies, code quality, architecture, performance and infrastructure, so you know what upgrading involves.',
  security: 'Checks code and dependencies for known CVEs, exposed secrets and insecure configurations, using the AWS Security Agent.',
  modernization: 'Finds repositories that could move to containers, serverless or a newer platform, so upgrades and bigger modernization happen in one pass.',
  agentic: 'Scores API design, authentication patterns and documentation, so you know where agent-driven remediation will go smoothly.',
  quick: 'A faster, shallower check of outdated dependencies across the same repositories. Useful between comprehensive runs.',
  custom: "Applies your platform team's own policies to these repositories.",
};
const EVERY_WORD = { Daily: 'every day', Weekly: 'every week', Monthly: 'every month', Once: 'once' };
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const short = t => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
// Packages whose outdated versions in the simulated estate carry known CVEs.
const CVE_PKGS = ['lodash', 'jsonwebtoken', 'axios', 'requests', 'pyyaml', 'urllib3', 'jackson-databind', 'commons-text', 'golang.org/x/net', 'google.golang.org/grpc', 'github.com/gin-gonic/gin'];
const listOf = xs => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
const orOf = xs => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`;

// When each repo of a source was last analyzed (any analysis type).
function lastAnalyzed(S, sourceId) {
  const m = {};
  S.analyses.filter(a => a.sourceId === sourceId).forEach(a => a.repos.forEach((r, i) => {
    if (repoStatus(a, i) === 'Completed') { const t = timeline(a, i).end; if (!m[r] || m[r] < t) m[r] = t; }
  }));
  return m;
}

// Why each analysis runs as often as it does, grounded in the last analysis. Falls back to the scan.
function whyFromLast(t, f, { prev, src, last }) {
  const F = aFindings(prev);
  const deps = [...new Set(F.map(x => x.title.match(/^Outdated dependency: (\S+)/)?.[1]).filter(Boolean))];
  const vulnerable = deps.filter(d => CVE_PKGS.includes(d)).slice(0, 3);
  const depRepos = new Set(F.filter(x => /^Outdated dependency/.test(x.title)).map(x => x.repo));
  const never = src.repos.filter(r => !last[r.name]).length;
  const when = short(prev.startedAt), fl = f.toLowerCase();
  if (t === 'security' && vulnerable.length) return <><b>{listOf(vulnerable)}</b> were flagged as outdated on {when}, and those versions have publicly known vulnerabilities. New CVEs can appear any week, so {fl} keeps the exposure window short.</>;
  if (t === 'comprehensive' && never) return <><b>{never} of {src.repos.length} repositories</b> have never been analyzed, and the other {src.repos.length - never} haven't been checked since {when}. {f} builds the full backlog quickly and keeps it accurate as new versions ship.</>;
  if (t === 'modernization' && depRepos.size) return <><b>{plural(depRepos.size, 'repository', 'repositories')}</b> already {depRepos.size === 1 ? 'has' : 'have'} findings that call for upgrading {orOf(deps.slice(0, 3))}. Since they will change anyway, {fl} shows what else can move to containers or serverless.</>;
  return whyFromScan(t, estate(src.repos.map(r => r.name)), f);
}

function pitch(t, { prev, src, last }) {
  if (!prev) return GENERIC[t];
  const F = aFindings(prev);
  const deps = [...new Set(F.map(x => x.title.match(/^Outdated dependency: (\S+)/)?.[1]).filter(Boolean))];
  const vulnerable = deps.filter(d => CVE_PKGS.includes(d)).slice(0, 3);
  const never = src.repos.filter(r => !last[r.name]).length;
  const when = short(prev.startedAt);
  if (t === 'comprehensive') return `On ${when} it found ${F.length} findings in just ${plural(prev.repos.length, 'repository', 'repositories')}.${never ? ` The other ${never} have never been checked, so most of your tech debt is still unknown.` : ''} This gives you the full backlog to plan against.`;
  if (t === 'security' && vulnerable.length) return `Your last results flagged outdated ${listOf(vulnerable)}, versions with publicly known vulnerabilities. This checks whether you are exposed in those repositories${never ? ` and the ${never} you haven't analyzed` : ''}.`;
  if (t === 'modernization' && deps.length) return `Your findings already call for upgrading ${listOf(deps.slice(0, 3))}. Since those repositories will change anyway, this shows which ones can also move to containers or serverless in the same pass.`;
  if (t === 'agentic' && F.length) return `Before you create remediations for your ${F.length} findings, this shows which repositories agents can change reliably and which need better docs or tests first.`;
  return GENERIC[t];
}

// Advice for the analysis a user arrived on, and which analysis pairs well with it.
const PAIRS = {
  security: ['quick', 'to catch outdated dependencies early'],
  quick: ['security', 'to check whether those outdated versions are actually vulnerable'],
  comprehensive: ['security', 'because new CVEs appear between the deeper runs'],
  modernization: ['comprehensive', 'so you see the upgrade work and the modernization options together'],
  agentic: ['comprehensive', 'so you know what needs remediating as well as where agents can do it'],
  custom: ['comprehensive', 'so policy gaps land next to the rest of your tech debt'],
};
function advice(t, freq, { prev, src, last }) {
  const F = prev ? aFindings(prev) : [];
  const deps = [...new Set(F.map(x => x.title.match(/^Outdated dependency: (\S+)/)?.[1]).filter(Boolean))].slice(0, 3);
  const never = src.repos.filter(r => !last[r.name]).length;
  const when = prev && short(prev.startedAt);
  const why = {
    security: `New CVEs are published every day${deps.length ? `, and your ${when} results already flagged ${listOf(deps)}` : ''}.`,
    quick: 'It only reads package manifests, so it is cheap to run often.',
    comprehensive: `It reviews code rather than manifests, so it is slower and deeper.${never ? ` ${never} of your ${src.repos.length} repositories have never been analyzed.` : ''}`,
    modernization: 'Opportunities shift as upgrades land and repositories change.',
    agentic: 'Readiness shifts as APIs, authentication and documentation improve.',
    custom: 'Policies drift as code changes, so a regular re-check keeps them honest.',
  }[t];
  const [pair, reason] = PAIRS[t];
  return `Run ${typeName(t)} ${freq.toLowerCase()}. ${why} ${typeName(pair)} pairs well at the same frequency ${reason}.`;
}

function initial(S, q) {
  const from = S.analyses.find(a => a.id === q.get('from'));
  const qType = ORDER.includes(q.get('type')) ? q.get('type') : null;
  const qRepo = q.get('repo');
  const src = (from && S.sources.find(s => s.id === from.sourceId)) || (qRepo && S.sources.find(s => s.repos.some(r => r.name === qRepo))) || S.sources.at(-1);
  const added = from && src ? src.repos.filter(r => r.addedAt && r.addedAt > from.startedAt).map(r => r.name) : [];
  return {
    sourceId: src?.id || '',
    picked: qType ? [qType] : PLAN,
    freqs: Object.fromEntries(ORDER.map(t => [t, ANALYSIS_META[t].freq])), def: CUSTOM_DEFS[0], day: 'Monday', time: '06:00',
    repoMode: qRepo || from ? 'choose' : 'all', selected: qRepo ? [qRepo] : from ? [...from.repos, ...added] : [], includeNew: true,
    infra: 'managed', stack: '', roleMode: 'create', role: '',
    advanced: !!(qRepo || from), open: { repos: false, schedule: false, infra: false },
    contexts: {}, sharedContext: '', ctxOpen: qType || null,
    fromType: qType,
    origin: qRepo ? `Started from ${qRepo}. Only that repository is selected.`
      : from ? `Started from your ${short(from.startedAt)} ${typeName(from.type)} analysis${added.length ? `, plus ${plural(added.length, 'repository', 'repositories')} added since` : ''}.` : null,
  };
}

export default function NewAnalysis() {
  const S = useStore();
  const { q } = useRoute();
  const [w, setW] = useState(() => initial(S, q));
  const [errors, setErrors] = useState({});
  const [findOpen, setFindOpen] = useState(false);
  const [repoQ, setRepoQ] = useState('');
  const set = patch => setW(p => ({ ...p, ...(typeof patch === 'function' ? patch(p) : patch) }));

  const src = S.sources.find(s => s.id === w.sourceId);
  const types = ORDER.filter(t => w.picked.includes(t));
  const st = staleness();
  const last = src ? lastAnalyzed(S, src.id) : {};
  const prev = src && [...S.analyses].filter(a => a.sourceId === src.id && a.type !== 'quick').sort((a, b) => b.startedAt - a.startedAt)[0];
  const repos = !src ? [] : w.repoMode === 'all' ? src.repos.map(r => r.name) : w.selected.filter(n => src.repos.some(r => r.name === n));
  const managed = w.infra === 'managed';
  const stacks = runStacks();
  const valid = src && types.length > 0 && repos.length > 0;
  // The plan table is for the returning user we prompted about stale findings; everyone else picks from the catalog.
  const planLayout = !!st && !!src && st.src.id === w.sourceId && !w.fromType;

  // Previously analyzed repositories first, otherwise keep the source's order.
  const ordered = src ? [...src.repos].sort((a, b) => (last[b.name] ? 1 : 0) - (last[a.name] ? 1 : 0)) : [];
  const shown = ordered.filter(r => !repoQ || r.name.toLowerCase().includes(repoQ.toLowerCase()));
  const pg = usePager(shown.length, 6, repoQ + w.sourceId);

  const why = (t, f) => prev ? whyFromLast(t, f, { prev, src, last }) : whyFromScan(t, estate(src.repos.map(r => r.name)), f);

  function begin() {
    const er = {};
    if (!managed && !w.stack) er.stack = stacks.length ? 'Choose an infrastructure stack.' : 'No infrastructure deployed. Deploy a stack from Settings or choose AWS managed.';
    if (managed && w.roleMode === 'existing' && !w.role) er.role = 'Choose an execution role.';
    setErrors(er);
    if (Object.keys(er).length) { set(p => ({ advanced: true, open: { ...p.open, infra: true } })); focusFirstError(); return; }

    const g = commit(S => {
      const name = uniqueRunName(S, `${slug(src.org)}-${types.length === 1 ? slug(typeName(types[0])) : 'analysis'}`);
      const createRole = managed && w.roleMode === 'create';
      return startRun(S, {
        name, src, types, def: w.def, repos, freqs: w.freqs, watch: true, rescan: false, includeNew: w.includeNew,
        contexts: w.contexts, sharedContext: w.sharedContext,
        day: w.day, time: w.time, infra: managed ? 'managed' : w.stack,
        role: createRole ? `arn:aws:iam::${ACCOUNT}:role/AWSTransformSchedule-${name}`.slice(0, 120) : managed ? `arn:aws:iam::${ACCOUNT}:role/${w.role}` : '', roleCreated: createRole,
      });
    });
    go(`#/web/cm/runs/${g.id}`);
  }

  const cancel = () => go(S.analyses.length ? '#/web/cm/analyses' : '#/web/cm');

  const repoPicker = src && (
    <>
      <Choice name="na-repos" checked={w.repoMode === 'all'} onChange={() => set({ repoMode: 'all' })} label={<>All {src.repos.length} repositories <b style={{ color: 'var(--green)' }}>(recommended)</b></>} />
      <Choice name="na-repos" checked={w.repoMode === 'choose'} onChange={() => set({ repoMode: 'choose' })} label="Choose repositories">
        <div className="repo-box">
          {findOpen && <div style={{ marginBottom: 8 }}><SearchInput value={repoQ} onChange={setRepoQ} placeholder="Find repositories" /></div>}
          {pg.slice(shown).map(r => {
            const on = w.selected.includes(r.name);
            return (
              <label key={r.name} className="repo-line">
                <input type="checkbox" checked={on} onChange={() => set(p => ({ selected: on ? p.selected.filter(n => n !== r.name) : [...p.selected, r.name] }))} />
                <span className="grow">{r.name}</span>
                <span className="small muted">{last[r.name] ? `Last analyzed ${short(last[r.name])}` : r.addedAt ? 'New · never analyzed' : 'Never analyzed'}</span>
              </label>
            );
          })}
          {!shown.length && <div className="small muted">No repositories match “{repoQ}”.</div>}
          <div className="row small muted" style={{ marginTop: 8 }}>
            <span>{w.selected.length} selected · Showing {Math.min(6, shown.length)} of {shown.length}{!findOpen && <> · <a href="#" onClick={ev => { ev.preventDefault(); setFindOpen(true); }}>Find repositories</a></>}</span>
            {shown.length > 6 && pg.el}
          </div>
        </div>
      </Choice>
    </>
  );

  const infraPicker = (
    <>
      <Choice name="na-infra" checked={managed} onChange={() => set({ infra: 'managed' })} label="AWS managed" desc="Nothing to deploy. AWS Transform runs the analyses on infrastructure it manages.">
        <div style={{ marginTop: 10 }}>
          <Choice name="na-role" checked={w.roleMode === 'create'} onChange={() => set({ roleMode: 'create' })} label="Create an execution role for me" />
          <Choice name="na-role" checked={w.roleMode === 'existing'} onChange={() => set({ roleMode: 'existing' })} label="Use an existing role">
            <Field id="na-role" error={errors.role} hint={<>Roles in this account that AWS Transform can assume. <a href="#" onClick={ev => { ev.preventDefault(); toast('Roles refreshed'); }}>Refresh</a></>} style={{ marginTop: 8 }}>
              <Select id="na-role" value={w.role} invalid={errors.role} placeholder="Choose a role" options={ROLES} style={{ maxWidth: 480 }}
                onChange={v => { set({ role: v }); setErrors(x => ({ ...x, role: undefined })); }} />
            </Field>
          </Choice>
        </div>
      </Choice>
      <Choice name="na-infra" checked={!managed} onChange={() => set({ infra: 'customer' })} label="Customer owned" desc="Runs on a stack in your own AWS account.">
        <Field id="na-stack" label="Infrastructure stack" error={errors.stack} style={{ marginTop: 10 }}
          hint={!stacks.length && <>Deploy <span className="mono">atx-runner</span> or <span className="mono">AtxInfrastructureStack</span> from <a href="#/web/cm/settings?how=1">Settings</a> first, or use AWS managed.</>}>
          {stacks.length
            ? <Select id="na-stack" value={w.stack} onChange={v => set({ stack: v })} invalid={errors.stack} placeholder="Choose an infrastructure stack" options={stacks.map(s => [s.name, `${s.name} (${s.type})`])} style={{ maxWidth: 480 }} />
            : <Select id="na-stack" value="" onChange={() => {}} disabled options={[['', 'No infrastructure deployed']]} style={{ maxWidth: 480 }} />}
        </Field>
      </Choice>
    </>
  );

  const sourcePicker = src && S.sources.length > 1 && (
    <Field id="na-src" label="Source" style={{ marginBottom: 20 }}>
      <Select id="na-src" value={w.sourceId} style={{ maxWidth: 360 }} onChange={v => set({ sourceId: v, repoMode: 'all', selected: [] })}
        options={S.sources.map(s => [s.id, `${s.name} (${PROVIDERS[s.provider].name})`])} />
    </Field>
  );

  const advanced = src && w.advanced && (
    <div className="container">
      <h2 className="c-header">Advanced settings</h2>
      {sourcePicker}
      <b>Repositories</b>
      <div style={{ marginTop: 8 }}>{repoPicker}</div>
      <hr className="sep" />
      <b>Infrastructure</b>
      <div style={{ marginTop: 8 }}>{infraPicker}</div>
    </div>
  );

  // Catalog layout (?type=): every analysis listed, with only the chosen one selected.
  const freqsUsed = [...new Set(types.map(t => w.freqs[t]))];
  const scheduleText = freqsUsed.length === 1
    ? (freqsUsed[0] === 'Once' ? 'Runs once today' : `Runs today and repeats ${EVERY_WORD[freqsUsed[0]]}`)
    : `Runs today, then ${['Weekly', 'Monthly', 'Daily', 'Once'].filter(f => freqsUsed.includes(f)).map(f => `${types.filter(t => w.freqs[t] === f).map(typeName).join(' and ')} ${f === 'Once' ? 'not again' : EVERY_WORD[f]}`).join(' and ')}`;
  const beginLabel = isRecurring(types, w.freqs) || !types.length ? 'Begin continuous analysis' : `Run ${types.length === 1 ? 'analysis' : 'analyses'} once`;
  const repoText = !src ? '' : w.repoMode === 'all' ? `All ${src.repos.length} in ${src.org}.${w.includeNew ? ' New repositories included automatically.' : ''}`
    : `${repos.length === 1 ? `${repos[0]} only` : `${repos.length} of ${src.repos.length} repositories`}.${w.includeNew ? ' New repositories included automatically.' : ''}`;
  const infraText = !managed ? `Customer owned: ${w.stack || 'choose a stack'}.` : w.roleMode === 'create' ? 'AWS managed. We create the execution role for you.' : `AWS managed, using ${w.role || 'an existing role'}.`;
  const toggleOpen = k => set(p => ({ open: { ...p.open, [k]: !p.open[k] } }));
  const toggleType = t => set(p => ({ picked: p.picked.includes(t) ? p.picked.filter(x => x !== t) : [...p.picked, t] }));
  const catalog = src && (
    <div className="container cat-box">
      <div className="spread" style={{ alignItems: 'flex-end' }}>
        <div><h2>Analyses <span className="counter">({types.length} selected)</span></h2><p className="muted" style={{ marginTop: 2 }}>Pick any combination. Each runs at its own frequency.</p></div>
        {PLAN.some(t => !types.includes(t)) && <button className="btn link" onClick={() => set(p => ({ picked: [...new Set([...p.picked, ...PLAN])] }))}>Add the {PLAN.length} we suggest</button>}
      </div>
      <div style={{ marginTop: 14 }}>
        {CATALOG.map(t => {
          const on = types.includes(t);
          return (
            <div key={t} className={`an-row ${on ? 'selected' : ''}`}>
              <label>
                <input type="checkbox" checked={on} onChange={() => toggleType(t)} />
                <span className="grow"><b>{typeName(t)}</b><div style={{ color: '#414d5c', marginTop: 2, lineHeight: '20px' }}>{pitch(t, { prev, src, last })}</div>
                  {t === 'custom' && on && <Select className="fsel small" aria-label="Transformation definition" value={w.def} onChange={v => set({ def: v })} options={CUSTOM_DEFS} style={{ marginTop: 6 }} />}
                </span>
              </label>
              {on
                ? <Dropdown variant="pill" ariaLabel={`${typeName(t)} frequency`} value={w.freqs[t]} options={FREQ_OPTIONS} onChange={v => set(p => ({ freqs: { ...p.freqs, [t]: v } }))} />
                : <span className="freq-tag grey">{w.freqs[t]}</span>}
              {on && (w.ctxOpen === t ? (
                <div className="ctx-box" onClick={e => e.stopPropagation()}>
                  <label className="field-label" htmlFor={`na-ctx-${t}`}>Context for {typeName(t)} <i className="muted">(optional)</i></label>
                  <textarea id={`na-ctx-${t}`} className="input" rows={3} style={{ maxWidth: 'none', marginTop: 4 }}
                    placeholder="e.g., Ignore findings in /test. We are PCI-scoped. lodash 4.17 is approved internally."
                    value={w.contexts[t] || ''} onChange={e => { const v = e.target.value; set(p => ({ contexts: { ...p.contexts, [t]: v } })); }} />
                  <div className="spread" style={{ marginTop: 8 }}>
                    <span className="small muted">Used on every scheduled run. You can change it later without recreating the schedule.</span>
                    <button className="btn small" onClick={() => set({ ctxOpen: null })}>Done</button>
                  </div>
                </div>
              ) : (
                <button className="ctx-link" onClick={() => set({ ctxOpen: t })}>
                  {w.contexts[t]?.trim() ? 'Edit context' : 'Add context'}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 14 }}>
        {S.sources.length > 1 && <SettingRow label="Source" summary={`${src.org} (${PROVIDERS[src.provider].name})`} open={w.open.source} onToggle={() => toggleOpen('source')}>{sourcePicker}</SettingRow>}
        <SettingRow label="Repositories" summary={repoText} open={w.open.repos} onToggle={() => toggleOpen('repos')}>{repoPicker}</SettingRow>
        <SettingRow label="Shared context" summary={w.sharedContext.trim() || <span className="muted">None. Optional facts every analysis should know.</span>}
          editLabel={w.sharedContext.trim() ? 'Edit' : 'Add'} open={w.open.shared} onToggle={() => toggleOpen('shared')}>
          <Field id="na-shared" hint="Added to every analysis in this run, alongside any context you set on a single analysis.">
            <textarea id="na-shared" className="input" rows={3} style={{ maxWidth: 640 }}
              placeholder="e.g., We deploy on Amazon ECS. Java 21 is our target runtime. Ignore vendored code under /third_party."
              value={w.sharedContext} onChange={e => set({ sharedContext: e.target.value })} />
          </Field>
        </SettingRow>
        <SettingRow label="Schedule" summary={types.length ? scheduleText : 'Choose an analysis'} open={w.open.schedule} onToggle={() => toggleOpen('schedule')}>
          <div className="row" style={{ gap: 10 }}>
            <span>Repeat runs on</span>
            <Dropdown ariaLabel="Day" value={w.day} onChange={v => set({ day: v })} options={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => [d, `${d}s`])} style={{ width: 140 }} />
            <span>at</span>
            <Dropdown ariaLabel="Time" value={w.time} onChange={v => set({ time: v })} options={Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`).map(t => [t, `${t} PT`])} style={{ width: 120 }} />
          </div>
        </SettingRow>
        <SettingRow label="Infrastructure" summary={infraText} open={w.open.infra} onToggle={() => toggleOpen('infra')}>{infraPicker}</SettingRow>
      </div>
      <div className="cat-foot">
        <span className="grow">{valid ? `${plural(types.length, 'analysis', 'analyses')} on ${plural(repos.length, 'repository', 'repositories')}. ${scheduleText}.` : 'Choose at least one analysis and one repository.'}</span>
        <button className="btn link" onClick={cancel}>Cancel</button>
        <button className="btn primary" onClick={begin} disabled={!valid}>{beginLabel}</button>
      </div>
    </div>
  );

  return (
    <>
      <Breadcrumbs items={[['Continuous modernization', '#/web/cm'], ['Analyses', '#/web/cm/analyses'], ['Run new analysis']]} />
      <div className="gs-main" style={{ maxWidth: 1200 }}>
        <div className="stack">
          <div className="gs-head">
            <h1>Run new analysis</h1>
            <p>{!src ? 'Connect a source to get started.'
              : planLayout ? `Here's how we'll keep ${src.org} current, based on ${prev ? 'your last analysis' : 'a scan of your estate'}. Each analysis starts today and repeats on the schedule below. Change anything you need to.`
              : 'Everything below is set up to begin as is. Change any part you like.'}</p>
          </div>
          {src && !planLayout && (w.fromType
            ? <div className="origin"><Icon n="info" s={16} />{advice(w.fromType, w.freqs[w.fromType], { prev, src, last })}</div>
            : w.origin && <div className="origin"><Icon n="info" s={16} />{w.origin}</div>)}

          {planLayout && st && st.src.id === w.sourceId && (
            <div className="stale-bar" style={{ alignItems: 'flex-start', border: 0, marginBottom: 0 }}>
              <span style={{ color: 'var(--blue)' }}><Icon n="clock" s={18} /></span>
              <div>
                <b>Your findings are {ago(st.since).replace(' ago', '')} old and cover only {st.a.repos.length} of your {st.src.repos.length} repositories.</b>
                <div>Code changes, new CVEs and end-of-support dates since {short(st.since)} aren't reflected.</div>
              </div>
            </div>
          )}

          {!src ? (
            <div className="container">
              <h2 className="c-header">Connect a source</h2>
              <ConnectSourceForm onConnected={s => { set({ sourceId: s.id }); toast(`Connected ${s.name} · ${s.repos.length} repositories`); }} />
            </div>
          ) : !planLayout ? catalog : (
            <>
              <ScheduleTable org={src.org} types={types} freqs={w.freqs} setFreq={(t, v) => set(p => ({ freqs: { ...p.freqs, [t]: v } }))}
                intro={`Your code, its dependencies and the threats against them change every week. These analyses re-run on their own, so your findings always match your estate today, not the day you ${prev ? 'last ran an analysis' : 'first scanned it'}. You'll only hear about what's new or changed.`}
                onAdd={t => set(p => ({ picked: [...p.picked, t] }))} onRemove={t => set(p => ({ picked: p.picked.filter(x => x !== t) }))} why={why}
                def={w.def} setDef={v => set({ def: v })} day={w.day} setDay={v => set({ day: v })} time={w.time} setTime={v => set({ time: v })}
                aside={<button className="btn link" onClick={() => set(p => ({ advanced: !p.advanced }))} aria-expanded={w.advanced}>Advanced settings <Icon n={w.advanced ? 'down' : 'right'} s={14} /></button>} />
              {advanced}
              <ReviewBox src={src} types={types} freqs={w.freqs} day={w.day} time={w.time} repos={repos.length} />
              <div className="wiz-actions">
                {!valid && <span className="note">Choose at least one analysis and one repository.</span>}
                <button className="btn link" onClick={cancel}>Cancel</button>
                <button className="btn primary" onClick={begin} disabled={!valid}>{beginLabel}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function SettingRow({ label, summary, open, onToggle, editLabel = 'Edit', children }) {
  return (
    <div className="set-row">
      <b className="set-k">{label}</b>
      <div className="grow" style={{ minWidth: 0 }}>{summary}{open && <div style={{ marginTop: 12 }}>{children}</div>}</div>
      <button className="btn link" onClick={onToggle} aria-expanded={!!open}>{open ? 'Done' : editLabel}</button>
    </div>
  );
}
