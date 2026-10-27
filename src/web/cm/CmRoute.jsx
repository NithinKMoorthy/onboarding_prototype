import { useStore } from '../../lib/store';
import { useRoute } from '../../lib/router';
import { TYPES, allFindings, fStatus } from '../../lib/domain';
import { Icon } from '../../components/ui';
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

const TABS = [['dashboard', 'Dashboard', Dashboard], ['findings', 'Findings', Findings], ['remediations', 'Remediations', Remediations], ['analyses', 'Analyses', Analyses], ['sources', 'Sources', Sources], ['settings', 'Settings', Settings]];

export default function CmRoute({ parts }) {
  const S = useStore();
  const { q } = useRoute();
  const [p0, p1] = parts;
  if (p0 === 'get-started') return <GetStarted />;
  if (p0 === 'new') return <NewAnalysis />;
  if (p0 === 'analyses' && p1) return <AnalysisDetail key={p1} id={p1} />;
  if (p0 === 'sources' && p1 === 'new') return <ConnectSourcePage />;
  const tab = TABS.find(t => t[0] === p0);
  if (tab) return <CmTabs tab={tab} q={q} />;
  return S.analyses.length ? <CmTabs tab={TABS[0]} q={q} /> : <CmEmpty resume={!!S.onboarding} />;
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

function CmEmpty({ resume }) {
  return (
    <>
      <CmHeader />
      <div className="empty-hero">
        <div className="art"><Icon n="code" s={52} /></div>
        <h2>No analysis results yet</h2>
        <p>Run your first analysis to discover findings.</p>
        <a className="btn primary" href="#/web/cm/get-started">{resume ? 'Continue getting started' : 'Get started'}</a>
        <p className="small" style={{ marginTop: 12 }}>Already know what you need? <a href="#/web/cm/new">Run a single analysis</a></p>
      </div>
      <h2 style={{ textAlign: 'center', marginTop: 28 }}>Analysis types</h2>
      <div className="types-grid">
        {TYPES.map(t => (
          <div key={t.id} className="type-item">
            <div className="row"><span className={`ico ${t.ico}`}><Icon n={t.icon} s={22} /></span><h3>{t.name}</h3></div>
            <p>{t.desc}</p>
          </div>
        ))}
      </div>
    </>
  );
}
