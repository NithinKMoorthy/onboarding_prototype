import { openModal, useStore } from '../../lib/store';
import { useRoute } from '../../lib/router';
import { rng } from '../../lib/format';
import { allFindings, fStatus, showLanding } from '../../lib/domain';
import { Breadcrumbs } from '../../components/ui';
import Dashboard from './Dashboard';
import Findings from './Findings';
import Remediations from './Remediations';
import Analyses from './Analyses';
import Sources from './Sources';
import Settings from './Settings';
import NewAnalysis from './NewAnalysis';
import AnalysisDetail from './AnalysisDetail';
import { ConnectSourcePage } from './ConnectSource';
import GetStarted from './GetStarted';
import RunGroup from './RunGroup';

const TABS = [['dashboard', 'Dashboard', Dashboard], ['findings', 'Findings', Findings], ['remediations', 'Remediations', Remediations], ['analyses', 'Analyses', Analyses], ['sources', 'Sources', Sources], ['settings', 'Settings', Settings]];

export default function CmRoute({ parts }) {
  const S = useStore();
  const { q } = useRoute();
  const [p0, p1] = parts;
  if (p0 === 'get-started') return <GetStarted />;
  if (p0 === 'new') return <NewAnalysis key={q.toString()} />;
  if (p0 === 'runs' && p1) return <RunGroup key={p1} id={p1} />;
  if (p0 === 'analyses' && p1) return <AnalysisDetail key={p1} id={p1} />;
  if (p0 === 'sources' && p1 === 'new') return <ConnectSourcePage />;
  const tab = TABS.find(t => t[0] === p0);
  if (tab) return <CmTabs tab={tab} q={q} />;
  return showLanding(S) ? <CmLanding /> : <CmTabs tab={TABS[0]} q={q} />;
}

const CmHeader = () => (
  <div className="page-head">
    <h1>Continuous modernization</h1>
    <p>Continuously assess and modernize your application portfolio. Review findings and remediation, and ask AWS Transform about your code.</p>
  </div>
);

function CmTabs({ tab: [key, , Body], q }) {
  const open = allFindings().filter(f => fStatus(f) === 'Open').length;
  return (
    <>
      <CmHeader />
      <nav className="tabs">
        {TABS.map(([k, label]) => (
          <a key={k} href={`#/web/cm/${k}`} className={k === key ? 'active' : ''}>{label}{k === 'findings' && <> <span className="badge dark">{open}</span></>}</a>
        ))}
      </nav>
      {/* Remount on query change so filters arriving via the URL (e.g. ?repo=) re-initialize. */}
      <Body key={q.toString()} q={q} />
    </>
  );
}

const STEPS = [
  ['Connect your source', 'GitHub, GitLab or Bitbucket. One organization is enough to start.'],
  ['We scan your estate', 'A read-only pass over your package manifests. Takes minutes.'],
  ['Turn on recommended analyses', 'Each one is tied to something we found, and runs on a schedule.'],
];
// Illustration: scattered, outdated repositories (orange, grey) settle into an orderly, current grid (blue).
// One card in the grid is newly flagged, caught by a scheduled run. Seeded so the layout is stable.
const CARD = { w: 30, h: 18 };
const GRID = { x: 292, y: 14, cols: 4, rows: 5, dx: 38, dy: 29, flagged: [2, 2] };
const SCATTER = (() => {
  const r = rng('landing-scatter');
  // A jittered 6 × 5 lattice keeps the cards loose without piling on top of each other.
  return Array.from({ length: 30 }, (_, i) => {
    // Same vertical band as the grid, ending a clear gap before it.
    const x = 8 + (i % 6) * 44 + (r() - 0.5) * 12;
    const y = 16 + Math.floor(i / 6) * 27 + (r() - 0.5) * 10;
    const t = x / 270; // 0 = far left (stale), 1 = next to the grid (nearly current)
    const fill = t > 0.62 ? (r() < 0.5 ? '#a9cbf5' : '#8fbcf0')
      : t > 0.38 ? (r() < 0.5 ? '#b8bcc2' : '#a9cbf5')
      : (r() < 0.55 ? (r() < 0.5 ? '#f4a46a' : '#f8c9a3') : (r() < 0.5 ? '#9aa0a8' : '#b8bcc2'));
    return { x, y, rot: (r() - 0.5) * 50 * (1 - t), fill };
  });
})();
const GRID_FILLS = ['#a9cbf5', '#5aa0ec', '#8fbcf0', '#1e6fd9'];

function Card({ x, y, rot = 0, fill, dashed }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot} ${CARD.w / 2} ${CARD.h / 2})`}>
      {dashed && <rect x={-3} y={-3} width={CARD.w + 6} height={CARD.h + 6} rx={5} fill="none" stroke="#e07700" strokeWidth={1.2} strokeDasharray="2 2" />}
      <rect width={CARD.w} height={CARD.h} rx={3.5} fill={fill} />
      <rect x={5} y={6.5} width={5} height={5} rx={1} fill="#fff" opacity={0.9} />
      <rect x={13} y={6} width={12} height={2} rx={1} fill="#fff" opacity={0.9} />
      <rect x={13} y={10} width={8} height={2} rx={1} fill="#fff" opacity={0.9} />
    </g>
  );
}

function EstateArt() {
  const r = rng('landing-grid');
  const cells = [];
  for (let row = 0; row < GRID.rows; row++) for (let col = 0; col < GRID.cols; col++) {
    const flagged = row === GRID.flagged[0] && col === GRID.flagged[1];
    cells.push(<Card key={`${row}-${col}`} x={GRID.x + col * GRID.dx} y={GRID.y + row * GRID.dy} fill={flagged ? '#f08a3c' : GRID_FILLS[Math.floor(r() * GRID_FILLS.length)]} dashed={flagged} />);
  }
  return (
    <svg viewBox="0 0 440 182" width="100%" role="img" aria-label="Illustration: scattered, outdated repositories settle into an orderly grid of current ones, with one newly flagged repository highlighted.">
      {SCATTER.map((c, i) => <Card key={i} {...c} />)}
      {cells}
      <line x1={4} y1={174} x2={434} y2={174} stroke="#c6c6cd" strokeWidth={1} />
      <path d="M430 170 L436 174 L430 178" fill="none" stroke="#c6c6cd" strokeWidth={1} />
    </svg>
  );
}

function CmLanding() {
  const S = useStore();
  const resume = !!S.onboarding;
  return (
    <>
      <Breadcrumbs items={[['Continuous modernization', '#/web/cm'], ['Get started']]} />
      <div className="page-head">
        <h1>Continuous modernization</h1>
        <p>Continuously assess and modernize your application portfolio.</p>
      </div>

      <div className="land">
        <div className="land-l">
          <div className="eyebrow" style={{ color: 'var(--blue)' }}>Get started</div>
          <h1 className="land-h">See what needs modernizing across your repositories, in minutes</h1>
          <p className="land-p">Connect your source code. We scan it, recommend the analyses that matter for what we find, and keep them running so your findings never go stale.</p>
          <ol className="land-steps">
            {STEPS.map(([t, d], i) => (
              <li key={t}><span className={`n ${i === 0 ? 'cur' : ''}`}>{i + 1}</span><div><b>{t}</b><div className="muted">{d}</div></div></li>
            ))}
          </ol>
          <div className="row wrap land-cta">
            <a className="btn primary cta" href="#/web/cm/get-started">{resume ? 'Continue getting started' : 'Connect and scan'}</a>          </div>
        </div>

        <div className="land-r">
          <div className="eyebrow">Your estate, kept modern</div>
          <div className="land-art"><EstateArt /></div>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 20 }}>
        Read-only scan · Nothing to deploy · Six analysis types available after your scan.{' '}
        <a href="#" onClick={e => { e.preventDefault(); openModal('compareTypes'); }} style={{ fontWeight: 700, textDecoration: 'none' }}>Explore analysis types</a>
      </p>
    </>
  );
}
