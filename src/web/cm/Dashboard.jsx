import { useStore } from '../../lib/store';
import { go } from '../../lib/router';
import { aDone, aStatus, allFindings, isActive, repoStatus, typeName } from '../../lib/domain';
import { fmtDT, plural } from '../../lib/format';
import { Alert, usePager } from '../../components/ui';

const SEVS = ['High', 'Medium', 'Low'];
const openRepo = repo => go(`#/web/cm/findings?repo=${encodeURIComponent(repo)}`);

export default function Dashboard() {
  const S = useStore();
  const F = allFindings().filter(isActive);
  const analyzed = new Set(S.analyses.flatMap(a => a.repos.filter((_, i) => repoStatus(a, i) === 'Completed')));
  const count = s => F.filter(f => f.sev === s).length;
  const reposWith = s => new Set(F.filter(f => f.sev === s).map(f => f.repo)).size;
  const last = S.analyses.length ? Math.max(...S.analyses.map(a => a.startedAt)) : null;
  const running = S.analyses.find(a => aStatus(a) === 'In progress');

  const tally = (keyOf) => {
    const m = {};
    F.forEach(f => { const r = m[keyOf(f)] = m[keyOf(f)] || { High: 0, Medium: 0, Low: 0, repos: new Set() }; r[f.sev]++; r.repos.add(f.repo); });
    return Object.entries(m).map(([k, r]) => ({ k, ...r, total: r.High + r.Medium + r.Low }));
  };
  const byRepo = tally(f => f.repo).sort((a, b) => b.High - a.High || b.total - a.total);
  const byType = tally(f => f.type);
  const pg = usePager(byRepo.length, 8);

  return (
    <>
      <div className="spread"><h2>Dashboard</h2><a className="btn primary" href="#/web/cm/new">New analysis</a></div>
      <p style={{ margin: '4px 0 18px' }}>Last analyzed: {last ? fmtDT(last) : '—'} · {plural(analyzed.size, 'analyzed repository', 'analyzed repositories')} · {plural(S.sources.length, 'source')} connected</p>
      {running && (
        <Alert type="info" title={`${running.name} is running.`} style={{ marginBottom: 18 }}>
          {' '}{aDone(running)} of {running.repos.length} repos analyzed. Results update as each repository completes. <a href={`#/web/cm/analyses/${running.id}`}>View progress</a>
        </Alert>
      )}
      <div className="metric-cards">
        {SEVS.map(s => (
          <div key={s} className={`metric ${s[0].toLowerCase()}`}>
            <div className="label">{s} severity findings</div><div className="val">{count(s)}</div><div className="small">Across {plural(reposWith(s), 'repo')}</div>
          </div>
        ))}
        <div className="metric t"><div className="label">Total findings</div><div className="val">{F.length}</div><div className="small">{plural(analyzed.size, 'repo')} analyzed</div></div>
      </div>

      <div className="container">
        <div className="spread c-header"><h2>Repos with findings</h2><div className="row">{byRepo.length > 8 && pg.el}<a className="btn" href="#/web/cm/findings">View all findings</a></div></div>
        <table className="tbl">
          <thead><tr><th>Repository</th><th>Distribution</th><th>High</th><th>Medium</th><th>Low</th><th>Total</th></tr></thead>
          <tbody>
            {byRepo.length ? pg.slice(byRepo).map(r => (
              <tr key={r.k} className="clickable" onClick={() => openRepo(r.k)}>
                <td><a href="#" onClick={e => e.preventDefault()}>{r.k}</a></td>
                <td>
                  <div className="dist" title={`${r.High} high, ${r.Medium} medium, ${r.Low} low`}>
                    {SEVS.map(s => r[s] ? <span key={s} className={s[0].toLowerCase()} style={{ width: `${(r[s] / r.total) * 100}%` }} /> : null)}
                  </div>
                </td>
                <td>{r.High}</td><td>{r.Medium}</td><td>{r.Low}</td><td><b>{r.total}</b></td>
              </tr>
            )) : <tr><td colSpan={6} className="empty" style={{ color: 'var(--text)' }}>No data available.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="container">
        <h2 className="c-header">Analysis breakdown</h2>
        <table className="tbl">
          <thead><tr><th>Analysis type</th><th>Repositories</th><th>High</th><th>Medium</th><th>Low</th><th>Total</th></tr></thead>
          <tbody>
            {byType.length ? byType.map(r => (
              <tr key={r.k}><td>{typeName(r.k)}</td><td>{r.repos.size}</td><td>{r.High}</td><td>{r.Medium}</td><td>{r.Low}</td><td><b>{r.total}</b></td></tr>
            )) : <tr><td colSpan={6} className="empty">No data available.</td></tr>}
          </tbody>
        </table>
        <div style={{ textAlign: 'center', borderTop: '1px solid var(--border-light)', margin: '12px -24px -8px', paddingTop: 12 }}>
          <a href="#/web/cm/findings">View all {F.length} findings</a>
        </div>
      </div>
    </>
  );
}
