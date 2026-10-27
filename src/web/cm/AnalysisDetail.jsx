import { useState } from 'react';
import { commit, nid, openModal, toast, useStore } from '../../lib/store';
import { go } from '../../lib/router';
import { aDone, aEnd, aFindings, aStatus, repoStates, srcName, typeName } from '../../lib/domain';
import { elapsed, fmtDate, fmtTime, plural } from '../../lib/format';
import { Alert, Breadcrumbs, FilterSelect, Icon, Menu, SearchInput, Status, usePager } from '../../components/ui';

export default function AnalysisDetail({ id }) {
  const S = useStore();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const a = S.analyses.find(x => x.id === id);
  const rowsAll = a ? a.repos : [];
  const states = a ? repoStates(a) : [];
  const F = a ? aFindings(a) : [];
  const rows = rowsAll.map((r, i) => ({ r, s: states[i], n: F.filter(f => f.repo === r).length }))
    .filter(x => (!status || x.s === status) && (!q || x.r.toLowerCase().includes(q.toLowerCase())));
  const pg = usePager(rows.length, 10, q + status);

  if (!a) {
    return (
      <>
        <Breadcrumbs items={[['Continuous modernization', '#/web/cm'], ['Analyses', '#/web/cm/analyses'], ['Not found']]} />
        <div className="container"><div className="empty"><b>Analysis not found</b>It may have been deleted. <a href="#/web/cm/analyses">View analyses</a></div></div>
      </>
    );
  }

  const done = aDone(a), n = a.repos.length, as = aStatus(a);
  const pct = Math.round(done / n * 100);
  const end = as === 'In progress' ? Date.now() : aEnd(a);
  const doneCls = as === 'Completed' ? 'big done' : 'big';
  const schedule = a.scheduleId ? (S.schedules.find(x => x.id === a.scheduleId)?.name || 'Deleted') : 'Run once';

  function rerun() {
    if (!S.sources.some(s => s.id === a.sourceId)) { toast('The source for this analysis was removed'); return; }
    const base = a.name.replace(/ \(rerun \d+\)$/, '');
    const b = commit(S => {
      const b = { ...a, id: nid('an'), startedAt: Date.now(), stoppedAt: null, name: `${base} (rerun ${S.analyses.filter(x => x.name.startsWith(base)).length})` };
      S.analyses.push(b);
      return b;
    });
    go(`#/web/cm/analyses/${b.id}`, { type: 'success', text: 'Analysis started successfully.' });
  }

  return (
    <>
      <Breadcrumbs items={[['Continuous modernization', '#/web/cm'], ['Analyses', '#/web/cm/analyses'], [a.name]]} />
      <div className="spread" style={{ marginBottom: 16 }}>
        <h1>{a.name}</h1>
        <div className="row">
          <Menu label={<>Actions <Icon n="down" s={14} /></>} items={[
            { label: 'Run again', onClick: rerun },
            { label: 'Stop analysis', disabled: as !== 'In progress', onClick: () => { commit(S => { S.analyses.find(x => x.id === a.id).stoppedAt = Date.now(); }); toast('Analysis stopped'); } },
            { label: 'Delete', onClick: () => openModal('deleteAnalysis', { id: a.id }) },
          ]} />
          <a className="btn primary" href="#/web/cm/findings">View findings</a>
        </div>
      </div>

      <div className="stack">
        {as === 'In progress' && (
          <Alert type="info" title="Analyzing repositories. This might take minutes to hours. You can check back later.">
            <div className="small" style={{ margin: '8px 0' }}>{done} of {n} repos</div>
            <div className="row" style={{ gap: 20 }}><div className="progress grow" style={{ maxWidth: 1000 }}><span style={{ width: `${pct}%` }} /></div><span className="small">{pct}%</span></div>
            <div className="small" style={{ marginTop: 8 }}>{typeName(a.type)}, started at {fmtTime(a.startedAt)}.</div>
          </Alert>
        )}
        {as === 'Completed' && (
          <Alert type="success" title="Analysis completed." actions={<a className="btn small" href="#/web/cm/findings">View findings</a>}>
            {' '}{plural(F.length, 'finding')} across {plural(new Set(F.map(f => f.repo)).size, 'repository', 'repositories')}. Finished at {fmtTime(aEnd(a))}.
          </Alert>
        )}
        {as === 'Stopped' && (
          <Alert type="warning" title="Analysis stopped.">{' '}{done} of {n} repos were analyzed before it stopped at {fmtTime(a.stoppedAt)}. Findings from those repos are kept.</Alert>
        )}

        <div className="container">
          <h2 className="c-header">Analysis summary</h2>
          <div className="summary-grid">
            <div><b>Repository analyzed</b><div className={doneCls}>{done}/{n}</div></div>
            <div><b>Elapsed time</b><div className={doneCls}>{elapsed(end - a.startedAt)}</div></div>
            <div><b>Total findings</b><div className={doneCls}>{F.length}</div></div>
          </div>
          <div className="summary-grid" style={{ marginTop: 12 }}>
            <div><b>Analysis type</b><div>{typeName(a.type)}{a.def && <> · <span className="mono">{a.def}</span></>}</div></div>
            <div><b>Source</b><div>{srcName(a.sourceId)}</div></div>
            <div><b>Date created</b><div>{fmtDate(a.startedAt)}</div></div>
          </div>
          <div className="summary-grid" style={{ marginTop: 12 }}>
            <div><b>Infrastructure</b><div>{a.infra}</div></div>
            <div><b>Schedule</b><div>{schedule}</div></div>
            <div><b>Status</b><div><Status s={as} /></div></div>
          </div>
        </div>

        <div className="container">
          <h2 className="c-header">Repositories <span className="counter">({n})</span></h2>
          <div className="table-tools">
            <SearchInput value={q} onChange={setQ} placeholder="Find repositories" width="260px" />
            <FilterSelect value={status} onChange={setStatus} aria-label="Status" options={[['', 'All statuses'], 'Pending', 'In progress', 'Completed', 'Stopped']} />
            {pg.el}
          </div>
          <table className="tbl">
            <thead><tr><th>Repository name</th><th>Status</th><th>Findings</th><th>Report</th></tr></thead>
            <tbody>
              {rows.length ? pg.slice(rows).map(x => (
                <tr key={x.r}>
                  <td>{x.r}</td><td><Status s={x.s} /></td><td>{x.n}</td>
                  <td>{x.s === 'Completed' ? <a href="#" onClick={e => { e.preventDefault(); openModal('report', { id: a.id, repo: x.r }); }}>View report</a> : '-'}</td>
                </tr>
              )) : <tr><td colSpan={4} className="empty">No repositories match the filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
