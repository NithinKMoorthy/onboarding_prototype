import { useState } from 'react';
import { commit, nid, toast, useStore } from '../../lib/store';
import { go } from '../../lib/router';
import { ACCOUNT, ANALYSIS_META, CUSTOM_DEFS, PROVIDERS, TYPES, aStatus, createAnalysis, estate, repoStatus, runStacks, timeline, typeName } from '../../lib/domain';
import { fmtDate, focusFirstError, plural } from '../../lib/format';
import { Breadcrumbs, Choice, ErrorText, Field, Icon, SearchInput, Select, TextInput, Tile, usePager } from '../../components/ui';
import { ConnectSourceForm } from './ConnectSource';

const ROLE_RE = /^arn:aws:iam::(\d{12}):role\/[\w+=,.@/-]+$/;
const NAME_RE = /^[A-Za-z0-9-]{1,64}$/;
const SHORT_DESC = {
  quick: 'Scans package manifests for outdated dependencies and stale versions. Results in minutes.',
  comprehensive: 'Code-level review across dependencies, code quality, architecture, performance and infrastructure.',
  security: 'CVEs, exposed secrets and insecure configurations, using the AWS Security Agent.',
  agentic: 'How ready repositories are for AI agents: API design, authentication patterns and documentation.',
  modernization: 'Containerization, serverless and platform-upgrade opportunities.',
  custom: 'Run a transformation definition your platform team maintains as an analysis.',
};
const TILE_ORDER = ['quick', 'comprehensive', 'security', 'agentic', 'modernization', 'custom'];
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Latest completed quick scan of a source, used to recommend what to run next.
function latestScan(S, sourceId) {
  return [...S.analyses].filter(a => a.sourceId === sourceId && a.type === 'quick' && aStatus(a) === 'Completed').sort((a, b) => b.startedAt - a.startedAt)[0];
}

// When each repo of a source was last analyzed (any analysis type).
function lastAnalyzed(S, sourceId) {
  const m = {};
  S.analyses.filter(a => a.sourceId === sourceId).forEach(a => a.repos.forEach((r, i) => {
    if (repoStatus(a, i) === 'Completed') { const t = timeline(a, i).end; if (!m[r] || m[r] < t) m[r] = t; }
  }));
  return m;
}

export default function NewAnalysis() {
  const S = useStore();
  const initialSrc = S.sources.at(-1);
  const initialScan = initialSrc && latestScan(S, initialSrc.id);
  const [w, setW] = useState(() => ({
    type: initialScan ? 'comprehensive' : 'quick', def: CUSTOM_DEFS[0], name: '',
    sourceId: initialSrc?.id || '', showConnect: !S.sources.length,
    selected: initialSrc ? Object.keys(lastAnalyzed(S, initialSrc.id)) : [],
    schedule: 'recurring', repeat: '', infra: 'managed', stack: '',
    roleMode: 'create', role: '',
    startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), startTime: '02:00',
  }));
  const [errors, setErrors] = useState({});
  const [repoQ, setRepoQ] = useState('');
  const set = (k, v) => { setW(p => ({ ...p, [k]: v })); setErrors(e => (e[k] ? { ...e, [k]: undefined } : e)); };
  const setSelected = fn => { setW(p => ({ ...p, selected: fn(p.selected) })); setErrors(e => (e.repos ? { ...e, repos: undefined } : e)); };

  const src = S.sources.find(s => s.id === w.sourceId);
  const scan = src && latestScan(S, src.id);
  const recommended = scan ? 'comprehensive' : 'quick';
  const last = src ? lastAnalyzed(S, src.id) : {};
  // Previously analyzed repositories first, otherwise keep the source's order.
  const repos = src ? [...src.repos].sort((a, b) => (last[b.name] ? 1 : 0) - (last[a.name] ? 1 : 0)) : [];
  const shown = repos.filter(r => !repoQ || r.name.toLowerCase().includes(repoQ.toLowerCase()));
  const pg = usePager(shown.length, 10, repoQ + w.sourceId);
  const page = pg.slice(shown);
  const allSelected = src && w.selected.length === src.repos.length;
  const allOnPage = page.length > 0 && page.every(r => w.selected.includes(r.name));

  const recFreq = ANALYSIS_META[w.type].freq;
  const repeat = w.repeat || recFreq;
  const recurring = w.schedule === 'recurring';
  const managed = w.infra === 'managed';
  const stacks = runStacks();
  const defaultName = src ? `${slug(typeName(w.type))}-${slug(src.org)}`.slice(0, 64) : slug(typeName(w.type));
  const name = w.name.trim() || defaultName;

  function pickSource(id) {
    setW(p => ({ ...p, sourceId: id, showConnect: false, selected: Object.keys(lastAnalyzed(S, id)) }));
    setErrors({});
  }

  function run() {
    const e = {};
    if (!src) e.source = 'Connect a source to continue.';
    if (!NAME_RE.test(name)) e.name = 'Use 1–64 letters, numbers and hyphens.';
    else if (recurring && S.schedules.some(x => x.name === name)) e.name = 'A schedule with this name already exists. Choose a different name.';
    if (!w.selected.length) e.repos = 'Choose at least one repository.';
    if (!managed && !w.stack) e.stack = stacks.length ? 'Choose an infrastructure stack.' : 'No infrastructure deployed. Deploy a stack from Settings or choose AWS managed.';
    if (recurring && managed && w.roleMode === 'existing') {
      const m = w.role.trim().match(ROLE_RE);
      if (!m) e.role = `Enter an IAM role ARN, for example arn:aws:iam::${ACCOUNT}:role/MyRole.`;
      else if (m[1] !== ACCOUNT) e.role = `The role must be in this account (${ACCOUNT}).`;
    }
    setErrors(e);
    if (Object.keys(e).length) { focusFirstError(); return; }

    const a = commit(S => {
      let schId = null;
      if (recurring) {
        const role = !managed ? '' : w.roleMode === 'create' ? `arn:aws:iam::${ACCOUNT}:role/AWSTransformSchedule-${name}`.slice(0, 120) : w.role.trim();
        const sch = {
          id: nid('sch'), name, infra: managed ? 'AWS managed' : w.stack, frequency: repeat, type: w.type, sourceId: src.id,
          repos: [...w.selected], role, roleCreated: managed && w.roleMode === 'create', createdAt: Date.now(),
          startAt: managed ? null : Date.parse(`${w.startDate}T${w.startTime}:00Z`),
        };
        S.schedules.push(sch);
        schId = sch.id;
      }
      return createAnalysis(S, nid('an'), { name, type: w.type, def: w.def, selected: w.selected, infra: w.infra, stack: w.stack }, src, schId);
    });
    const roleNote = recurring && managed && w.roleMode === 'create' ? ' AWS Transform created an execution role for it.' : '';
    go(`#/web/cm/analyses/${a.id}`, { type: 'success', text: recurring ? `Analysis started. It runs again ${repeat.toLowerCase()}.${roleNote}` : 'Analysis started successfully.' });
  }

  const cancel = () => go(S.analyses.length ? '#/web/cm/analyses' : '#/web/cm');
  const infraText = managed ? 'on AWS-managed infrastructure' : `on ${w.stack || 'your own infrastructure'}`;

  return (
    <>
      <Breadcrumbs items={[['Continuous modernization', '#/web/cm'], ['Analyses', '#/web/cm/analyses'], ['Run new analysis']]} />
      <div className="gs-main" style={{ maxWidth: 960 }}>
        <div className="stack">
          <div className="gs-head"><h1>Run new analysis</h1><p>Choose what to analyze, how often, and where it runs.</p></div>

          <div className="container">
            <h2 className="c-header">What to analyze</h2>
            <div className="prov-tiles" role="radiogroup" aria-label="Analysis type">
              {TILE_ORDER.map(t => (
                <Tile key={t} name="na-type" checked={w.type === t} onChange={() => set('type', t)} title={typeName(t)}
                  badge={t === recommended && 'Recommended'} badgeBelow={t === recommended && t !== 'quick'} desc={SHORT_DESC[t]} />
              ))}
            </div>
            {scan && <p className="small muted" style={{ marginTop: 12 }}>Recommended from your latest estate scan: {plural(estate(scan.repos).eos, 'repository', 'repositories')} on end-of-support runtimes.</p>}
            {!scan && src && <p className="small muted" style={{ marginTop: 12 }}>Recommended because {src.name} hasn't been scanned yet. A quick scan shows where to go deeper.</p>}
            {w.type === 'custom' && (
              <Field id="na-def" label="Transformation definition" desc="Definitions your platform team publishes to this account." style={{ marginTop: 16 }}>
                <Select id="na-def" value={w.def} onChange={v => set('def', v)} options={CUSTOM_DEFS} />
              </Field>
            )}
            <hr className="sep" />
            {w.showConnect || !src ? (
              <>
                <label className="field-label" style={{ marginBottom: 8 }}>Source</label>
                <ErrorText msg={errors.source} />
                <ConnectSourceForm cancelLabel="Use an existing source"
                  onCancel={S.sources.length ? () => set('showConnect', false) : null}
                  onConnected={s => { pickSource(s.id); toast(`Connected ${s.name} · ${s.repos.length} repositories`); }} />
              </>
            ) : (
              <div className="split" style={{ alignItems: 'start' }}>
                <Field id="na-name" label="Name" optional error={errors.name} hint={!errors.name && `${recurring ? 'Also names the schedule. ' : ''}1–64 characters: letters, numbers and hyphens.`}>
                  <TextInput id="na-name" invalid={errors.name} placeholder={defaultName} value={w.name} onChange={v => set('name', v)} />
                </Field>
                <Field id="na-src" label="Source" style={{ marginTop: 0 }}>
                  <Select id="na-src" value={w.sourceId} onChange={pickSource} options={S.sources.map(s => [s.id, `${s.name} (${PROVIDERS[s.provider].name})`])} />
                  <a href="#" className="small" style={{ fontWeight: 700, display: 'inline-block', marginTop: 4 }} onClick={e => { e.preventDefault(); set('showConnect', true); }}>Connect a new source</a>
                </Field>
              </div>
            )}
          </div>

          {src && !w.showConnect && (
            <div className="container">
              <div className="spread">
                <h2>Which repositories <span className="counter">({w.selected.length} of {src.repos.length} selected)</span></h2>
                <button className="btn" onClick={() => setSelected(() => allSelected ? [] : src.repos.map(r => r.name))}>{allSelected ? 'Clear selection' : `Select all ${src.repos.length}`}</button>
              </div>
              <p className="muted" style={{ margin: '2px 0 14px' }}>From {src.org}. Default branches are analyzed.</p>
              <div className="table-tools"><SearchInput value={repoQ} onChange={setRepoQ} placeholder="Find repositories" width="340px" />{pg.el}</div>
              <ErrorText msg={errors.repos} />
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="cb"><input type="checkbox" aria-label="Select all on page" checked={allOnPage}
                      onChange={() => { const names = page.map(r => r.name); setSelected(sel => allOnPage ? sel.filter(n => !names.includes(n)) : [...new Set([...sel, ...names])]); }} /></th>
                    <th>Repository</th><th>Branch</th><th>Last analyzed</th><th>Visibility</th>
                  </tr>
                </thead>
                <tbody>
                  {page.length ? page.map(r => {
                    const on = w.selected.includes(r.name);
                    return (
                      <tr key={r.name} className={`clickable ${on ? 'sel' : ''}`} onClick={() => setSelected(sel => sel.includes(r.name) ? sel.filter(n => n !== r.name) : [...sel, r.name])}>
                        <td className="cb"><input type="checkbox" checked={on} readOnly aria-label={`Select ${r.name}`} /></td>
                        <td>{r.name}</td><td>{r.branch}</td>
                        <td className={last[r.name] ? '' : 'muted'}>{last[r.name] ? fmtDate(last[r.name]) : 'Never'}</td>
                        <td><span className={`badge ${r.vis === 'Public' ? 'green' : ''}`}>{r.vis}</span></td>
                      </tr>
                    );
                  }) : <tr><td colSpan={5} className="empty">No repositories match “{repoQ}”.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          <div className="container">
            <h2>How often</h2>
            <p className="muted" style={{ margin: '4px 0 16px' }}>Recurring analysis keeps findings current as your code and dependencies change.</p>
            <div className="prov-tiles two">
              <Tile name="na-sch" checked={recurring} onChange={() => set('schedule', 'recurring')} title="Recurring" badge="Recommended" desc="Runs now, then on a schedule. You're notified only about new and changed findings." />
              <Tile name="na-sch" checked={!recurring} onChange={() => set('schedule', 'once')} title="Run once" desc="A single snapshot. Findings go stale as repositories change." />
            </div>
            {recurring && (
              <>
                <Field id="na-rep" label="Repeat" hint={`Recommended for ${typeName(w.type)}: ${recFreq.toLowerCase()}.`} style={{ marginTop: 20 }}>
                  <Select id="na-rep" value={repeat} onChange={v => set('repeat', v)} style={{ maxWidth: 300 }}
                    options={['Daily', 'Weekly', 'Monthly'].map(f => [f, f === recFreq ? `${f} (recommended)` : f])} />
                </Field>
                {managed ? (
                  <p className="row" style={{ gap: 6, marginTop: 16 }}><Icon n="clock" />On AWS-managed infrastructure, AWS Transform picks the run time. Runs are in UTC.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 640 }}>
                    <Field id="na-sd" label="Start date (UTC)"><TextInput id="na-sd" type="date" value={w.startDate} onChange={v => set('startDate', v)} /></Field>
                    <Field id="na-st" label="Start time (UTC)"><TextInput id="na-st" type="time" value={w.startTime} onChange={v => set('startTime', v)} /></Field>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="container">
            <h2 className="c-header">Where it runs</h2>
            <div className="prov-tiles two">
              <Tile name="na-infra" checked={managed} onChange={() => set('infra', 'managed')} title="AWS managed" badge="Recommended" desc="Runs on infrastructure AWS Transform manages. Nothing to deploy." />
              <Tile name="na-infra" checked={!managed} onChange={() => { set('infra', 'customer'); set('stack', w.stack); }} title="Customer owned" desc="Runs on a stack deployed in your own AWS account. You choose the start time." />
            </div>
            {!managed && (
              <Field id="na-stack" label="Infrastructure stack" desc="A deployed stack in your account to run this analysis on." error={errors.stack} style={{ marginTop: 20 }}
                hint={!stacks.length && <>Deploy <span className="mono">atx-runner</span> or <span className="mono">AtxInfrastructureStack</span> from <a href="#/web/cm/settings?how=1">Settings</a> first, or use AWS managed.</>}>
                {stacks.length
                  ? <Select id="na-stack" value={w.stack} onChange={v => set('stack', v)} invalid={errors.stack} placeholder="Choose an infrastructure stack" options={stacks.map(s => [s.name, `${s.name} (${s.type})`])} />
                  : <Select id="na-stack" value="" onChange={() => {}} disabled options={[['', 'No infrastructure deployed']]} />}
              </Field>
            )}
            {managed && recurring && (
              <>
                <hr className="sep" />
                <b>Execution role</b>
                <p style={{ margin: '2px 0 10px' }}>Recurring runs on AWS-managed infrastructure need a role that AWS Transform can assume. <a href="#" onClick={e => e.preventDefault()}>Learn more</a></p>
                <Choice name="na-role" checked={w.roleMode === 'create'} onChange={() => set('roleMode', 'create')}
                  label={<>Create a role for me <b style={{ color: 'var(--green)' }}>(recommended)</b></>} desc="AWS Transform creates a role that trusts it, with only the permissions this analysis needs." />
                <Choice name="na-role" checked={w.roleMode === 'existing'} onChange={() => set('roleMode', 'existing')} label="Use an existing role">
                  <Field id="na-role" label="Execution role ARN" error={errors.role} hint={!errors.role && `The role must trust transform.amazonaws.com. For example arn:aws:iam::${ACCOUNT}:role/MyRole.`} style={{ marginTop: 10 }}>
                    <TextInput id="na-role" invalid={errors.role} placeholder={`arn:aws:iam::${ACCOUNT}:role/MyRole`} value={w.role} onChange={v => set('role', v)} />
                  </Field>
                </Choice>
              </>
            )}
          </div>

          <div className="container soft">
            <h2 style={{ marginBottom: 8 }}>Summary</h2>
            {src ? (
              <>
                <p>Runs {typeName(w.type)} on {plural(w.selected.length, 'repository', 'repositories')} from {src.org}, {recurring ? `now and then ${repeat.toLowerCase()}` : 'once'}, {infraText}.</p>
                <p className="muted" style={{ marginTop: 6 }}>{recurring
                  ? "After each run you'll see only new and changed findings. You can pause or change the schedule from the Analyses tab."
                  : 'You can turn on a recurring schedule later from the Analyses tab.'}</p>
              </>
            ) : <p className="muted">Connect a source to see what will run.</p>}
          </div>

          <div className="wiz-actions">
            <button className="btn link" onClick={cancel}>Cancel</button>
            <button className="btn primary" onClick={run}>{recurring ? 'Run and schedule' : 'Run analysis'}</button>
          </div>
        </div>
      </div>
    </>
  );
}
