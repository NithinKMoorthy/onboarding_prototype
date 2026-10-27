import { useState } from 'react';
import { commit, openModal, toast, useStore } from '../../lib/store';
import { allFindings, remStatus } from '../../lib/domain';
import { fmtDT, plural } from '../../lib/format';
import { FilterSelect, Status, usePager } from '../../components/ui';

export function cancelRemediation(id) {
  commit(S => { S.remediations.find(r => r.id === id).cancelled = true; });
  toast('Remediation cancelled. Findings returned to Open.');
}

export default function Remediations() {
  const S = useStore();
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const tags = [...new Set(S.remediations.flatMap(r => r.tags))];
  const list = S.remediations.filter(r => (!status || remStatus(r) === status) && (!tag || r.tags.includes(tag)));
  const pg = usePager(list.length, 10, status + tag);

  return (
    <>
      <div className="spread c-header">
        <h2>Remediations <span className="counter">({list.length})</span></h2>
        {!S.remediations.length && <a className="btn" href="#/web/cm/findings">Go to findings</a>}
      </div>
      <div className="table-tools">
        <FilterSelect value={status} onChange={setStatus} aria-label="Status" options={[['', 'All statuses'], 'In progress', 'Completed', 'Cancelled']} />
        <FilterSelect value={tag} onChange={setTag} aria-label="Tag" options={[['', 'All tags'], ...tags]} />
        {pg.el}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>Name</th><th>Status</th><th>Outcome</th><th>Date created</th><th>Transformation</th><th>Repositories</th><th>Findings</th><th>Actions</th></tr></thead>
          <tbody>
            {list.length ? pg.slice(list).map(r => {
              const rs = remStatus(r);
              const view = e => { e.preventDefault(); openModal('remView', { id: r.id }); };
              return (
                <tr key={r.id}>
                  <td><a href="#" onClick={view}>{r.name}</a>{r.tags.map(t => <span key={t}> <span className="badge outline">{t}</span></span>)}</td>
                  <td><Status s={rs} /></td>
                  <td>{rs === 'Completed' ? `${plural(r.repos.length, 'pull request')} opened` : rs === 'In progress' ? <span className="muted">Creating pull requests…</span> : '—'}</td>
                  <td>{fmtDT(r.createdAt)}</td>
                  <td><span className="mono small">{r.trans.length > 1 ? `${r.trans[0]} +${r.trans.length - 1}` : r.trans[0]}</span></td>
                  <td>{r.repos.length}</td><td>{r.findingIds.length}</td>
                  <td>
                    <button className="btn link small" onClick={view}>View</button>
                    {rs === 'In progress' && <button className="btn link small" onClick={() => cancelRemediation(r.id)}>Cancel</button>}
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={8} className="empty" style={{ color: 'var(--text)' }}>No remediation campaigns yet.{allFindings().length > 0 && ' Select findings and choose Create remediation.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
