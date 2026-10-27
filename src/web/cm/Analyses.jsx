import { useState } from 'react';
import { openModal, useStore } from '../../lib/store';
import { aDone, aFindings, aStatus, nextRun, srcName, typeName } from '../../lib/domain';
import { fmtDate, fmtDT, plural } from '../../lib/format';
import { FilterSelect, SearchInput, Status, usePager, useSelection } from '../../components/ui';

export default function Analyses() {
  const S = useStore();
  const [status, setStatus] = useState('');
  const [repo, setRepo] = useState('');
  const [schQ, setSchQ] = useState('');
  const schSel = useSelection();

  const repos = [...new Set(S.analyses.flatMap(a => a.repos))].sort();
  const list = [...S.analyses].sort((a, b) => b.startedAt - a.startedAt).filter(a => (!status || aStatus(a) === status) && (!repo || a.repos.includes(repo)));
  const pg = usePager(list.length, 10, status + repo);
  const schedules = S.schedules.filter(x => !schQ || x.name.toLowerCase().includes(schQ.toLowerCase()));
  const spg = usePager(schedules.length, 10, schQ);

  return (
    <>
      <div className="container">
        <div className="spread c-header"><h2>Analyses <span className="counter">({S.analyses.length})</span></h2><a className="btn primary" href="#/web/cm/new">Run new analysis</a></div>
        <div className="table-tools">
          <FilterSelect value={status} onChange={setStatus} aria-label="Status" options={[['', 'All statuses'], 'In progress', 'Completed', 'Stopped']} />
          <FilterSelect value={repo} onChange={setRepo} aria-label="Repository" options={[['', 'All repos'], ...repos]} />
          {pg.el}
        </div>
        <table className="tbl">
          <thead><tr><th>Date created</th><th>Analysis</th><th>Status</th><th>Repositories</th><th>Findings</th><th>Infrastructure</th></tr></thead>
          <tbody>
            {list.length ? pg.slice(list).map(a => {
              const done = aDone(a), pct = Math.round(done / a.repos.length * 100), as = aStatus(a);
              return (
                <tr key={a.id}>
                  <td>{fmtDate(a.startedAt)}</td>
                  <td><a href={`#/web/cm/analyses/${a.id}`}>{a.name}</a><div className="small muted">{typeName(a.type)}{a.scheduleId && ' · scheduled'}</div></td>
                  <td><Status s={as} /></td>
                  <td style={{ minWidth: 200 }}>
                    <div>{done} of {plural(a.repos.length, 'repo')}</div>
                    <div className="row" style={{ gap: 10 }}><div className={`progress grow ${as === 'Completed' ? 'done' : ''}`}><span style={{ width: `${pct}%` }} /></div><span className="small">{pct}%</span></div>
                  </td>
                  <td>{aFindings(a).length}</td>
                  <td>{a.infra}</td>
                </tr>
              );
            }) : <tr><td colSpan={6} className="empty">No analyses match the filters.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="container">
        <div className="spread">
          <h2>Schedules <span className="counter">({S.schedules.length})</span></h2>
          <div className="row">
            <button className="btn" disabled={!schSel.size} onClick={() => openModal('deleteSchedules', { ids: schSel.keys, onDone: schSel.clear })}>Delete</button>
            <a className="btn" href="#/web/cm/new">Schedule analysis</a>
          </div>
        </div>
        <p style={{ margin: '4px 0 14px' }}>Recurring analyses that run automatically.</p>
        <div className="table-tools"><SearchInput value={schQ} onChange={setSchQ} placeholder="Find schedules" width="600px" />{spg.el}</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th className="cb" /><th>Schedule ID</th><th>Schedule name</th><th>Infrastructure</th><th>Status</th><th>Frequency</th><th>Analysis type</th><th>Source</th><th>Repositories</th><th>Next run</th></tr></thead>
            <tbody>
              {schedules.length ? spg.slice(schedules).map(x => (
                <tr key={x.id} className={schSel.has(x.id) ? 'sel' : ''}>
                  <td className="cb"><input type="checkbox" aria-label="Select schedule" checked={schSel.has(x.id)} onChange={() => schSel.toggle(x.id)} /></td>
                  <td className="mono">{x.id}</td><td>{x.name}</td><td>{x.infra}</td><td><Status s="Enabled" /></td><td>{x.frequency}</td>
                  <td>{typeName(x.type)}</td><td>{srcName(x.sourceId)}</td><td>{x.repos.length}</td><td>{fmtDT(nextRun(x))} {x.tz || 'UTC'}</td>
                </tr>
              )) : <tr><td colSpan={10} className="empty"><b>No schedules</b>Create a schedule to run analysis on a recurring basis.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
