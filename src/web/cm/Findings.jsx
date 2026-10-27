import { useState } from 'react';
import { commit, openModal, toast, useStore } from '../../lib/store';
import { TRANSFORMS, TYPES, allFindings, fStatus, fTrans, remReady, typeName } from '../../lib/domain';
import { fmtDate, fmtTime, plural } from '../../lib/format';
import { Alert, FilterSelect, Icon, SearchInput, Sev, Status, usePager, useSelection } from '../../components/ui';

export default function Findings({ q }) {
  useStore();
  const all = allFindings();
  const [f, setF] = useState({ q: '', status: q.get('status') || 'Open', type: '', repo: q.get('repo') || '', fix: '' });
  const [alertX, setAlertX] = useState(false);
  const sel = useSelection();
  const set = k => v => setF(p => ({ ...p, [k]: v }));

  const term = f.q.toLowerCase();
  const list = all.filter(x => (f.status === 'all' || fStatus(x) === f.status) && (!f.type || x.type === f.type) && (!f.repo || x.repo === f.repo)
    && (!f.fix || x.fix === f.fix) && (!term || `${x.title} ${x.repo}`.toLowerCase().includes(term)));
  const pg = usePager(list.length, 10, JSON.stringify(f));
  const page = pg.slice(list);
  const selected = all.filter(x => sel.has(x.key));
  const openSel = selected.filter(x => fStatus(x) === 'Open');
  const ready = remReady();
  const allOnPage = page.length > 0 && page.every(x => sel.has(x.key));
  const repos = [...new Set(all.map(x => x.repo))].sort();

  function dismiss() {
    commit(S => openSel.forEach(x => { S.fstate[x.key] = 'Dismissed'; }));
    sel.clear();
    toast(`${plural(openSel.length, 'finding')} dismissed`);
  }

  return (
    <>
      {!ready && !alertX && (
        <Alert type="info" title="Infrastructure for remediation is not ready" style={{ marginBottom: 18 }} onDismiss={() => setAlertX(true)}
          actions={<a className="btn small" href="#/web/cm/settings?how=1">View instruction</a>}>
          Setup infrastructure before creating remediations.
        </Alert>
      )}
      <div className="spread c-header">
        <h2>Findings <span className="counter">({list.length})</span></h2>
        <div className="row">
          <button className="btn" onClick={dismiss} disabled={!openSel.length}>Dismiss</button>
          <button className="btn primary" disabled={!openSel.length || !ready} title={ready ? '' : 'Deploy remediation infrastructure first'}
            onClick={() => openModal('remediate', { keys: openSel.map(x => x.key), onDone: sel.clear })}>Create remediation</button>
        </div>
      </div>
      <div className="table-tools">
        <SearchInput value={f.q} onChange={set('q')} placeholder="Find findings" />
        <FilterSelect value={f.status} onChange={set('status')} aria-label="Status" options={['Open', 'In remediation', 'Remediated', 'Dismissed', ['all', 'All statuses']]} />
        <FilterSelect value={f.type} onChange={set('type')} aria-label="Analysis type" options={[['', 'All types'], ...TYPES.map(t => [t.id, t.name])]} />
        <FilterSelect value={f.repo} onChange={set('repo')} aria-label="Repository" options={[['', 'All repos'], ...repos]} />
        <FilterSelect value={f.fix} onChange={set('fix')} aria-label="Fix type" options={[['', 'All fix types'], ['Automated', 'Automated fix'], ['Manual', 'Manual fix']]} />
        {pg.el}
      </div>
      {selected.length > 0 && (
        <div className="selbar">
          {plural(selected.length, 'finding')} selected{selected.length !== openSel.length && ` · ${openSel.length} open`}
          <button className="btn link small" onClick={sel.clear}>Clear selection</button>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th className="cb"><input type="checkbox" aria-label="Select all on page" checked={allOnPage} disabled={!page.length} onChange={() => sel.setMany(page.map(x => x.key), !allOnPage)} /></th>
              <th>Finding</th><th>Severity</th><th>Status</th><th>Transformation <Icon n="edit" s={13} /></th><th>Date reported</th><th>Time</th><th>Analysis type</th><th>Repository</th>
            </tr>
          </thead>
          <tbody>
            {page.length ? page.map(x => {
              const st = fStatus(x);
              return (
                <tr key={x.key} className={sel.has(x.key) ? 'sel' : ''}>
                  <td className="cb"><input type="checkbox" aria-label="Select finding" checked={sel.has(x.key)} onChange={() => sel.toggle(x.key)} /></td>
                  <td><a href="#" onClick={e => { e.preventDefault(); openModal('finding', { id: x.key }); }}>{x.title}</a></td>
                  <td><Sev s={x.sev} /></td>
                  <td><Status s={st} /></td>
                  <td>{st === 'Open'
                    ? <FilterSelect className="fsel small" aria-label="Transformation" value={fTrans(x)} options={TRANSFORMS} onChange={v => commit(S => { S.ftrans[x.key] = v; })} />
                    : <span className="mono small">{fTrans(x)}</span>}</td>
                  <td>{fmtDate(x.at)}</td><td>{fmtTime(x.at)}</td><td>{typeName(x.type)}</td><td>{x.repo}</td>
                </tr>
              );
            }) : <tr><td colSpan={9} className="empty" style={{ color: 'var(--text)' }}>{all.length ? 'No findings match the filters.' : 'No findings. Run an analysis to discover tech debt.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
