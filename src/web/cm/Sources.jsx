import { openModal, useStore } from '../../lib/store';
import { PROVIDERS } from '../../lib/domain';
import { fmtDate } from '../../lib/format';
import { Status, usePager, useSelection } from '../../components/ui';

export default function Sources() {
  const S = useStore();
  const sel = useSelection();
  const pg = usePager(S.sources.length);
  return (
    <>
      <div className="spread c-header">
        <h2>Sources <span className="counter">({S.sources.length})</span></h2>
        <div className="row">
          <button className="btn" disabled={!sel.size} onClick={() => openModal('removeSource', { ids: sel.keys, onDone: sel.clear })}>Remove</button>
          <a className="btn primary" href="#/web/cm/sources/new">Connect new source</a>
        </div>
      </div>
      <div className="table-tools">{pg.el}</div>
      <table className="tbl">
        <thead><tr><th className="cb" /><th>Source name</th><th>Status</th><th># of repos</th><th>Provider</th><th>Organization</th><th>Connected</th></tr></thead>
        <tbody>
          {S.sources.length ? pg.slice(S.sources).map(x => (
            <tr key={x.id} className={sel.has(x.id) ? 'sel' : ''}>
              <td className="cb"><input type="checkbox" aria-label="Select source" checked={sel.has(x.id)} onChange={() => sel.toggle(x.id)} /></td>
              <td><a href="#" onClick={e => { e.preventDefault(); openModal('source', { id: x.id }); }}>{x.name}</a></td>
              <td><Status s="Connected" /></td><td>{x.repos.length}</td><td>{PROVIDERS[x.provider].name}</td><td>{x.org}</td><td>{fmtDate(x.createdAt)}</td>
            </tr>
          )) : <tr><td colSpan={7} className="empty"><b>No sources</b>Connect GitHub, GitLab, or Bitbucket to analyze your repositories.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
