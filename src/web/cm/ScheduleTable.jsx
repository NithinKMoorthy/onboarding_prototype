import { CUSTOM_DEFS, PROVIDERS, typeName } from '../../lib/domain';
import { fmtTime, plural } from '../../lib/format';
import { Dropdown, Icon, Select } from '../../components/ui';

/* The continuous-analysis plan shared by Get started (Schedule and run) and Run new analysis:
   one row per analysis with its frequency and why it's worth running, plus the shared run day and time. */

export const FREQ_OPTIONS = ['Once', 'Daily', 'Weekly', 'Monthly'];
export const isRecurring = (types, freqs) => types.some(t => freqs[t] !== 'Once');

export const ORDER = ['health', 'comprehensive', 'modernization', 'agentic', 'quick', 'custom'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIMES = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

// Why each analysis is worth running, grounded in an estate scan.
export function whyFromScan(t, e) {
  const top = e.exposures.slice(0, 2).map(x => x.name.replace(/ runtime$/, ''));
  return {
    health: <><b>{plural(e.eos, 'repository', 'repositories')}</b> run {orList(e.langs.filter(l => l.eos && l.runtime).map(l => l.runtime)) || 'runtimes'} that AWS Health has scheduled for deprecation. This shows which deployed resources each event affects and the date you need to act by.</>,
    security: <><b>{e.exposures[0]?.repos || e.eos} repositories</b> run {top.join(' or ') || 'end-of-support runtimes'}, which no longer get security patches. This checks them for known CVEs, exposed secrets and insecure configuration.</>,
    comprehensive: <><b>{e.deps} outdated dependencies</b> across {e.repos} repositories. This reviews the code itself, so you see what upgrading involves across code quality, architecture and infrastructure, not just the version numbers.</>,
    modernization: <><b>{e.upgrade} repositories</b> need a runtime or framework upgrade. Since they'll change anyway, this shows which can also move to containers or serverless in the same pass.</>,
    agentic: <><b>{e.eos} repositories</b> need remediation that agents carry out. This scores API design, authentication and documentation, so you know where agents can work reliably.</>,
    quick: <><b>{e.repos} repositories</b> of package manifests. A fast, low-cost check that flags outdated dependencies between deeper reviews.</>,
    custom: <>Checks your platform team's own policies across <b>{e.repos} repositories</b>, so policy gaps show up next to the rest of your findings.</>,
  }[t];
}
const orList = xs => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`;

export function ScheduleTable({ org, intro, types, freqs, setFreq, onAdd, onRemove, why, def, setDef, day, setDay, time, setTime, aside }) {
  return (
    <div className="container">
      <h2>Continuous analysis for {org}</h2>
      <p style={{ margin: '4px 0 16px', maxWidth: 760, color: '#414d5c' }}>{intro}</p>
      <table className="tbl sched-tbl">
        <thead><tr><th style={{ width: 220 }}>Analysis</th><th style={{ width: 170 }}>Runs</th><th>Why this analysis</th><th className="cb" /></tr></thead>
        <tbody>
          {types.map(t => (
            <tr key={t}>
              <td style={{ verticalAlign: 'top' }}><b>{typeName(t)}</b>
                {t === 'custom' && <Select className="fsel small" aria-label="Transformation definition" value={def} onChange={setDef} options={CUSTOM_DEFS} style={{ display: 'block', marginTop: 6 }} />}
              </td>
              <td style={{ verticalAlign: 'top' }}><Dropdown ariaLabel={`${typeName(t)} frequency`} value={freqs[t]} onChange={v => setFreq(t, v)} options={FREQ_OPTIONS} style={{ width: 150 }} /></td>
              <td style={{ verticalAlign: 'top' }}>{why(t)}</td>
              <td style={{ verticalAlign: 'top' }}><button className="copy" aria-label={`Remove ${typeName(t)}`} onClick={() => onRemove(t)}><Icon n="x" /></button></td>
            </tr>
          ))}
          {!types.length && <tr><td colSpan={4} className="empty">Add at least one analysis to continue.</td></tr>}
        </tbody>
      </table>
      {types.length < ORDER.length && (
        <div className="row wrap add-row">
          <span className="muted">Add an analysis:</span>
          {ORDER.filter(t => !types.includes(t)).map(t => <button key={t} className="chip-add" onClick={() => onAdd(t)}>+ {typeName(t)}</button>)}
        </div>
      )}
      <div className="row wrap" style={{ gap: 10, paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
        <b>Repeat runs on</b>
        <Dropdown ariaLabel="Day" value={day} onChange={setDay} options={DAYS.map(d => [d, `${d}s`])} style={{ width: 140 }} />
        <span>at</span>
        <Dropdown ariaLabel="Time" value={time} onChange={setTime} options={TIMES.map(t => [t, `${t} PT`])} style={{ width: 120 }} />
        <span className="muted grow">· applies to every scheduled analysis</span>
        {aside}
      </div>
    </div>
  );
}

// "Security and Tech debt (comprehensive) weekly; Modernization readiness monthly, on Mondays at 06:00 PT."
export const scheduleLine = (types, freqs, day, time) => `${['Daily', 'Weekly', 'Monthly', 'Once']
  .map(f => [f, types.filter(t => freqs[t] === f)]).filter(([, ts]) => ts.length)
  .map(([f, ts]) => `${ts.map(typeName).join(' and ')} ${f === 'Once' ? 'once, today' : f.toLowerCase()}`).join('; ')}${isRecurring(types, freqs) ? `, on ${day}s at ${time} PT` : ''}.`;

export function ReviewBox({ src, types, freqs, day, time, repos }) {
  // Matches the simulation: repos start 2.5s apart and take up to 14s each.
  const etaMin = Math.max(1, Math.ceil(((repos - 1) * 2.5 + 14) / 60));
  return (
    <div className="container">
      <h2 className="c-header">Review</h2>
      <div className="row starts" style={{ alignItems: 'flex-start' }}>
        <Icon n="ok" s={18} />
        <span><b>Starts right away.</b> {types.length === 1 ? 'The analysis kicks' : `All ${types.length} analyses kick`} off when you begin, with first results in about {plural(etaMin, 'minute')} (around {fmtTime(Date.now() + etaMin * 60000)}).{isRecurring(types, freqs) ? ` After that, ${types.every(t => freqs[t] !== 'Once') ? 'they repeat' : 'the scheduled ones repeat'} on schedule.` : ' They run once and don\'t repeat.'}</span>
      </div>
      <div className="review-grid" style={{ marginTop: 16 }}>
        <div><div className="k">Source</div>{src.org} ({PROVIDERS[src.provider].name})</div>
        <div><div className="k">Analyses</div>{types.map(typeName).join(', ') || '—'}</div>
        <div><div className="k">Repositories</div>{repos === src.repos.length ? `All ${repos}` : `${repos} of ${src.repos.length}`}</div>
        <div style={{ gridColumn: '1 / -1' }}><div className="k">Schedule</div>{types.length ? scheduleLine(types, freqs, day, time) : '—'}</div>
      </div>
    </div>
  );
}
