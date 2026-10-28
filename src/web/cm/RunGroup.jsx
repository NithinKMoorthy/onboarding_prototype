import { useState } from 'react';
import { commit, nid, openModal, useStore } from '../../lib/store';
import { go } from '../../lib/router';
import { PROVIDERS, aDone, aEnd, aFindings, aStatus, estate, fmtNext, nextRun, scheduleSummary, sevRank, typeName } from '../../lib/domain';
import { plural } from '../../lib/format';
import { Alert, Breadcrumbs, Icon } from '../../components/ui';

/* A group of analyses started together (from Get started), with their shared schedule. */

const EVERY = { Daily: 'Every day', Weekly: 'Every week', Monthly: 'Every month' };
const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];
const analysesPhrase = n => n === 1 ? 'the analysis' : n === 2 ? 'both analyses' : `all ${COUNT_WORDS[n] || n} analyses`;

function eta(ms) {
  if (ms <= 0) return null;
  const s = Math.ceil(ms / 1000);
  return s < 60 ? 'under a minute' : `about ${plural(Math.ceil(s / 60), 'minute')}`;
}

export default function RunGroup({ id }) {
  const S = useStore();
  const g = (S.runs || []).find(x => x.id === id);
  if (!g) {
    return (
      <>
        <Breadcrumbs items={[['Continuous modernization', '#/web/cm'], ['Analyses', '#/web/cm/analyses'], ['Not found']]} />
        <div className="container"><div className="empty"><b>Run not found</b>It may have been deleted. <a href="#/web/cm/analyses">View analyses</a></div></div>
      </>
    );
  }

  const src = S.sources.find(s => s.id === g.sourceId);
  const org = src?.org || g.name;
  const analyses = g.analysisIds.map(aid => S.analyses.find(a => a.id === aid)).filter(Boolean);
  const schedules = g.scheduleIds.map(sid => S.schedules.find(x => x.id === sid)).filter(Boolean);
  const nRepos = analyses[0]?.repos.length || 0;
  const total = analyses.reduce((n, a) => n + a.repos.length, 0);
  const done = analyses.reduce((n, a) => n + aDone(a), 0);
  const pct = total ? Math.round(done / total * 100) : 0;
  const finished = analyses.every(a => aStatus(a) !== 'In progress');
  const remaining = eta(Math.max(0, ...analyses.map(a => aEnd(a) - Date.now())));
  const findings = analyses.flatMap(aFindings).sort((a, b) => b.at - a.at);
  // Newest finding from each repository first, so the preview isn't five rows from one repo.
  const seenRepo = new Set();
  const preview = [...findings.filter(f => !seenRepo.has(f.repo) && seenRepo.add(f.repo)), ...findings].filter((f, i, arr) => arr.indexOf(f) === i).slice(0, 5);

  const scan = schedules.find(x => x.type === 'quick');
  const others = schedules.filter(x => x.type !== 'quick');
  const continuous = schedules.length > 0;
  const cadence = scheduleSummary(others.map(x => [typeName(x.type), x.frequency]));
  const subtitle = [
    plural(analyses.length, 'analysis', 'analyses'),
    plural(nRepos, 'repository', 'repositories'),
    continuous ? `Continuous: ${cadence}` : 'Run once',
  ].join(' · ');

  // Recurring rows, one per frequency: the estate re-scan, then the analyses grouped by how often they re-run.
  const byFreq = {};
  others.forEach(x => { (byFreq[x.frequency] = byFreq[x.frequency] || []).push(typeName(x.type)); });
  const recurringRows = [
    ...(scan ? [[EVERY[scan.frequency], 'Estate re-scan for newly outdated dependencies and new repositories.']] : []),
    ...Object.entries(byFreq).map(([f, names]) => [EVERY[f],
      `${names.length === others.length ? `${analysesPhrase(names.length)[0].toUpperCase()}${analysesPhrase(names.length).slice(1)}` : names.join(', ')} re-run.${g.email ? ' You get a digest of only new and changed findings.' : ''}`]),
  ];
  const firstLabel = g.firstRun && new Date(g.firstRun).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const steps = [
    { when: 'Now', dot: 'on', text: `First run across ${plural(nRepos, 'repository', 'repositories')}. Findings appear as each one finishes.` },
    { when: 'When it finishes', dot: finished ? 'on' : 'next', text: `Results are ready to review, and you can create your first campaign.${g.email ? ` We email ${g.email}.` : ''}` },
    ...(continuous ? [{ when: firstLabel, text: `First scheduled cycle: ${scan ? 'estate re-scan, then ' : ''}${analysesPhrase(others.length)} re-run at ${g.time} PT.` }] : []),
    ...recurringRows.map(([when, text]) => ({ when, text })),
  ];

  if (finished) return <Completed g={g} src={src} analyses={analyses} schedules={schedules} nRepos={nRepos} />;

  return (
    <>
      <Breadcrumbs items={[['Continuous modernization', '#/web/cm'], ['Analyses', '#/web/cm/analyses'], [g.name]]} />
      <div className="gs-main" style={{ maxWidth: 1240 }}>
        <div className="stack">
          {finished
            ? <Alert type="success"><b>First run complete for {org}.</b> Results are ready to review on the dashboard.</Alert>
            : <Alert type="success"><b>{continuous ? 'Continuous analysis' : 'Analysis'} has begun for {org}.</b> You can leave this page. {g.email ? `We'll email ${g.email} when the first results are ready.` : 'Findings appear on the dashboard as each repository finishes.'}</Alert>}

          <div>
            <div className="spread">
              <div className="row" style={{ gap: 12 }}><h1>{g.name}</h1><span className={`pill ${finished ? 'ok' : ''}`}>{finished ? 'Completed' : 'In progress'}</span></div>
              {continuous && <a className="btn" href="#/web/cm/analyses">Manage schedule</a>}
            </div>
            <p className="muted" style={{ marginTop: 6 }}>{subtitle}</p>
          </div>

          <div className="container">
            <div className="spread c-header"><h2>First run</h2><span className="muted">{finished ? 'Finished' : remaining ? `First results in ${remaining}` : 'Finishing up…'}</span></div>
            <div className="spread"><b>Overall</b><span>{pct}%</span></div>
            <div className="bar" style={{ marginTop: 6 }}><span style={{ width: `${pct}%` }} /></div>
            <hr className="sep" />
            {analyses.map(a => {
              const d = aDone(a);
              return (
                <div key={a.id} className="lang-row" style={{ gridTemplateColumns: '240px 1fr 220px' }}>
                  <a href={`#/web/cm/analyses/${a.id}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>{typeName(a.type)}</a>
                  <div className="bar"><span style={{ width: `${d / a.repos.length * 100}%` }} /></div>
                  <span className="muted">{d} of {plural(a.repos.length, 'repository', 'repositories')}</span>
                </div>
              );
            })}
          </div>

          <div className="container">
            <h2>{finished ? 'Findings' : 'Early findings'} <span className="counter">({findings.length}{finished ? '' : ' so far'})</span></h2>
            <div className="spread" style={{ margin: '4px 0 14px' }}>
              <span className="muted">{finished ? 'The newest findings from this run.' : 'Findings appear here as each repository finishes.'}</span>
              <a href="#/web/cm/findings"><b>{finished ? 'View all findings' : 'View all findings so far'}</b></a>
            </div>
            <table className="tbl">
              <thead><tr><th>Finding</th><th>Repository</th><th>Analysis</th></tr></thead>
              <tbody>
                {preview.length ? preview.map(f => (
                  <tr key={`${f.aId}|${f.key}`}>
                    <td><a href="#" onClick={e => { e.preventDefault(); openModal('finding', { id: f.key }); }}>{f.title}</a></td>
                    <td>{f.repo}</td><td>{typeName(f.type)}</td>
                  </tr>
                )) : <tr><td colSpan={3} className="empty">No findings yet. The first ones appear in a few seconds.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="container">
            <h2 className="c-header">What happens next</h2>
            <div className="tl">
              {steps.map((s, i) => (
                <div key={i} className="tl-row">
                  <span className={`dot ${s.dot || ''}`} /><b>{s.when}</b><span>{s.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="wiz-actions">
            <a className="btn link" href="#/web/cm/dashboard">Back to dashboard</a>
            <button className={`btn ${finished ? 'primary' : ''}`} onClick={() => go('#/web/cm/findings')}>{finished ? 'View results' : 'View results so far'}</button>
          </div>
        </div>
      </div>
    </>
  );
}

const STAT3 = {
  comprehensive: ['On end-of-support runtimes', (F, e) => e.eos],
  security: ['High severity findings', F => F.filter(f => f.sev === 'High').length],
  modernization: ['Container candidates', F => new Set(F.filter(f => f.cat === 'Containers').map(f => f.repo)).size],
  agentic: ['Missing API specs or docs', F => new Set(F.filter(f => ['API design', 'Documentation'].includes(f.cat)).map(f => f.repo)).size],
  custom: ['Policy violations', F => F.length],
};
const SHOWN = 9;

// "Security runs weekly and the other three monthly"
function watchSentence(others) {
  const by = {};
  others.forEach(x => { (by[x.frequency] = by[x.frequency] || []).push(typeName(x.type)); });
  const groups = Object.entries(by).sort((a, b) => a[1].length - b[1].length);
  const verb = names => names.length === 1 ? 'runs' : 'run';
  if (groups.length === 1) {
    const [f, names] = groups[0];
    return names.length === 1 ? `${names[0]} runs ${f.toLowerCase()}` : `${analysesPhrase(names.length)[0].toUpperCase()}${analysesPhrase(names.length).slice(1)} run ${f.toLowerCase()}`;
  }
  if (groups.length === 2 && groups[0][1].length < groups[1][1].length) {
    const [[f1, small], [f2, big]] = groups;
    return `${small.join(' and ')} ${verb(small)} ${f1.toLowerCase()} and the other ${COUNT_WORDS[big.length] || big.length} ${f2.toLowerCase()}`;
  }
  return groups.map(([f, names]) => `${names.join(' and ')} ${verb(names)} ${f.toLowerCase()}`).join(', ');
}

function Completed({ g, src, analyses, schedules, nRepos }) {
  const [tab, setTab] = useState(analyses[0]?.type);
  const a = analyses.find(x => x.type === tab) || analyses[0];
  const F = aFindings(a);
  const e = estate(a.repos);
  const cats = [...new Set(F.map(f => f.cat))];
  const byRepo = Object.values(F.reduce((m, f) => { (m[f.repo] = m[f.repo] || { repo: f.repo, list: [] }).list.push(f); return m; }, {}))
    .map(r => ({ ...r, top: [...r.list].sort((x, y) => sevRank(x.sev) - sevRank(y.sev))[0] }))
    .sort((x, y) => y.list.length - x.list.length || x.repo.localeCompare(y.repo));
  const rest = byRepo.slice(SHOWN);
  const [k3, v3] = STAT3[a.type] || ['Repositories analyzed', () => a.repos.length];

  const others = schedules.filter(x => x.type !== 'quick');
  const scan = schedules.find(x => x.type === 'quick');
  const continuous = schedules.length > 0;
  const next = continuous && Math.min(...schedules.map(nextRun));
  const cadence = watchSentence(others);

  function runAgain() {
    commit(S => {
      const gg = S.runs.find(x => x.id === g.id);
      gg.history = [...(gg.history || []), ...gg.analysisIds];
      gg.analysisIds = analyses.map(x => {
        const b = { ...x, id: nid('an'), startedAt: Date.now(), stoppedAt: null };
        S.analyses.push(b);
        return b.id;
      });
    });
  }

  return (
    <>
      <Breadcrumbs items={[['Continuous modernization', '#/web/cm'], ['Analyses', '#/web/cm/analyses'], [g.name]]} />
      <div className="gs-main" style={{ maxWidth: 1240 }}>
        <div className="stack">
          <div className="spread" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="row" style={{ gap: 12 }}><h1>{g.name}</h1><span className="status ok" style={{ fontWeight: 700 }}><Icon n="ok" />Completed</span></div>
              <p className="muted" style={{ marginTop: 6 }}>{[plural(analyses.length, 'analysis', 'analyses'), plural(nRepos, 'repository', 'repositories'), src && `${src.org} (${PROVIDERS[src.provider].name})`, continuous ? 'Recurring' : 'Run once'].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="row">
              <a className="btn" href="#/web/cm/analyses">{continuous ? 'Edit schedule' : 'Schedule'}</a>
              <button className="btn" onClick={runAgain}>Run again</button>
              <button className="btn primary" onClick={() => go('#/web/cm/findings')}>Create campaign</button>
            </div>
          </div>

          {continuous
            ? <Alert type="success"><b>Keeping watch.</b> {cadence}{scan ? ', and your estate is re-scanned weekly' : ''}. Next run {fmtNext(next)} at {g.time} PT.{schedules.some(x => x.includeNew) && src ? ` New repositories in ${src.org} are included automatically.` : ''}</Alert>
            : <Alert type="info">This was a one-time run. Findings go stale as repositories change. <a href="#/web/cm/new">Set up recurring analysis</a></Alert>}

          {analyses.length > 1 && (
            <nav className="tabs" style={{ margin: '8px 0 0' }}>
              {analyses.map(x => <a key={x.id} href="#" className={x.type === a.type ? 'active' : ''} onClick={ev => { ev.preventDefault(); setTab(x.type); }}>{typeName(x.type)}</a>)}
            </nav>
          )}

          <div className="container">
            <h2 className="c-header">Summary</h2>
            <div className="stat-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="stat"><div className="k">Findings</div><div className="v">{F.length}</div><div className="small muted">{cats.join(', ')}</div></div>
              <div className="stat"><div className="k">Repositories with findings</div><div className="v">{byRepo.length} <span className="muted" style={{ fontSize: 16, fontWeight: 400 }}>of {a.repos.length}</span></div></div>
              <div className="stat"><div className="k">{k3}</div><div className="v">{v3(F, e)}</div></div>
            </div>
          </div>

          <div className="container">
            <h2 className="c-header">Findings by repository</h2>
            <table className="tbl">
              <thead><tr><th>Repository</th><th>Findings</th><th>Category</th><th>Top finding</th></tr></thead>
              <tbody>
                {byRepo.slice(0, SHOWN).map(r => (
                  <tr key={r.repo}>
                    <td><a href={`#/web/cm/findings?repo=${encodeURIComponent(r.repo)}`}>{r.repo}</a></td>
                    <td>{r.list.length}</td><td>{r.top.cat}</td><td>{r.top.title}</td>
                  </tr>
                ))}
                {rest.length > 0 && (
                  <tr>
                    <td><a href="#/web/cm/findings">{plural(rest.length, 'more repository', 'more repositories')}</a></td>
                    <td>{rest.reduce((n, r) => n + r.list.length, 0)}</td><td className="muted">Mixed</td><td><a href="#/web/cm/findings">View all</a></td>
                  </tr>
                )}
                {!byRepo.length && <tr><td colSpan={4} className="empty">No findings from this analysis.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
