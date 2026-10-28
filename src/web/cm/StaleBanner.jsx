import { commit, useStore } from '../../lib/store';
import { go } from '../../lib/router';
import { ANALYSIS_META, PLAN, fmtNext, nextRun, scheduleSummary, staleness, startRun, typeName, uniqueRunName } from '../../lib/domain';
import { ago } from '../../lib/format';
import { Alert, Icon } from '../../components/ui';

/* Returning users: a one-off analysis has gone stale. One click starts the recommended plan on a schedule. */

const short = t => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const FREQS = Object.fromEntries(PLAN.map(t => [t, ANALYSIS_META[t].freq]));

export function StaleBanner() {
  useStore();
  const st = staleness();
  if (!st) return null;
  const { src } = st;
  const repos = src.repos.map(r => r.name);

  function begin() {
    const g = commit(S => {
      const g = startRun(S, {
        name: uniqueRunName(S, `${slug(src.org)}-plan`), src, types: PLAN, repos, freqs: FREQS,
        watch: true, rescan: true, includeNew: true, day: 'Monday', time: '06:00', infra: 'managed', roleCreated: true,
      });
      S.rerunNotice = g.id;
      return g;
    });
    go(`#/web/cm/runs/${g.id}`);
  }

  return (
    <div className="stale-bar">
      <span className="stale-ico"><Icon n="clock" s={18} /></span>
      <div className="grow">
        <b>These findings are {ago(st.since).replace(' ago', '')} old and cover only {st.a.repos.length} of your {repos.length} repositories.</b>
        <div>Code changes, new CVEs and end-of-support dates since {short(st.since)} aren't reflected. Our recommended plan keeps every repository current, and you only hear about what's new.</div>
      </div>
      <a className="btn link" href="#/web/cm/new">Customize</a>
      <button className="btn primary" onClick={begin}>Keep my estate current</button>
    </div>
  );
}

// Shown after a returning user turns a one-off analysis into a recurring one.
export function RerunNotice() {
  const S = useStore();
  const g = S.rerunNotice && (S.runs || []).find(x => x.id === S.rerunNotice);
  const schedules = g ? S.schedules.filter(x => g.scheduleIds.includes(x.id)) : [];
  if (!schedules.length) return null;
  const others = schedules.filter(x => x.type !== 'quick');
  return (
    <Alert type="success" style={{ marginBottom: 18 }} onDismiss={() => commit(S => { S.rerunNotice = null; })}
      actions={<a href="#/web/cm/analyses" onClick={e => { e.preventDefault(); go('#/web/cm/analyses'); }}><b>Change schedule</b></a>}>
      Recurring: {scheduleSummary(others.map(x => [typeName(x.type), x.frequency])).replace('the others', 'the rest')}. Next run {fmtNext(Math.min(...schedules.map(nextRun)))}. You will only hear about new and changed findings.
    </Alert>
  );
}
