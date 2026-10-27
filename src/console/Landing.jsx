import { openModal, useStore } from '../lib/store';
import { Icon, Status } from '../components/ui';
import { ConsoleFlash } from './shared';

const FEATURES = [
  ['Assess Infrastructure', 'Evaluate on-premises infrastructure for cloud migration. Get TCO analysis and right-sizing recommendations.'],
  ['Migrate Workloads', 'Assess, plan, and migrate virtual and physical servers to AWS with automated network conversion.'],
  ['Modernize Mainframe and Windows', 'Analyze, document, and refactor z/OS COBOL, PL/I, .NET, and SQL Server applications.'],
  ['Continuously modernize', 'Detect, prioritize, and remediate technical debt across your repositories on a schedule.'],
];

export default function Landing() {
  const S = useStore();
  return (
    <>
      <ConsoleFlash style={{ margin: '16px 32px' }} />
      <section className="hero">
        <div className="hero-inner">
          <div>
            <div>Migration &amp; Modernization</div>
            <h1>AWS Transform</h1>
            <div className="tagline">Agentic modernization of mainframe, VMware, Windows, and custom applications.</div>
            <p>AWS Transform is a collaborative enterprise IT transformation workbench powered by expert agents, agentic AI systems, and continuous learning that accelerates cloud migration, legacy app modernization, and tech debt reduction. It offers purpose-built transformations for mainframe, VMware, and Windows workloads. It also helps modernize any legacy code: from updating frameworks, APIs, or versions to any custom transformations.</p>
          </div>
          <div className="getstarted">
            <h2>Get started</h2>
            <h3>Web application</h3>
            {S.service ? (
              <>
                <p style={{ marginTop: 8 }}>Your web application is enabled. <Status s="Enabled" /></p>
                <a className="btn primary" href="#/web">Open web application <Icon n="ext" s={14} /></a>
                <p style={{ margin: '-6px 0 18px' }}><a href="#/service">Manage service</a></p>
              </>
            ) : (
              <>
                <p style={{ marginTop: 8 }}>Perform assessments and use agents for mainframe, VMware, Windows and more.</p>
                <a className="btn primary" href="#/enable">Enable web application</a>
              </>
            )}
            <h3>Custom CLI</h3>
            <p style={{ marginTop: 8 }}>Upgrade runtimes, modernize frameworks and eliminate tech debt through continuous modernization.</p>
            <button className="btn" onClick={() => openModal('cli')}>View CLI instructions <Icon n="ext" s={14} /></button>
          </div>
        </div>
      </section>
      <section className="features">
        <div>
          <h2 style={{ fontSize: 28, lineHeight: '36px' }}>With AWS Transform you can</h2>
          <div className="feature-grid">
            {FEATURES.map(([t, d]) => <div key={t} className="feature-card"><h3>{t}</h3><p>{d}</p></div>)}
          </div>
        </div>
        <div className="container" style={{ borderRadius: 0, alignSelf: 'start' }}>
          <h2 style={{ fontSize: 24, marginBottom: 10 }}>Pricing</h2>
          <p>Currently, AWS Transform offers migration and modernization of enterprise workloads, such as Windows, server migration (including VMware), and mainframe, at no cost, and offers custom transformations for code, APIs, frameworks, and more as a paid feature. You pay for AWS resources you deploy in your account.</p>
        </div>
      </section>
    </>
  );
}
