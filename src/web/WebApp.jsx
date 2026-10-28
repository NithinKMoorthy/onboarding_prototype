import { commit, openModal, replaceState, resetAll, setUi, ui, useStore } from '../lib/store';
import { go } from '../lib/router';
import { returningState } from '../lib/scenarios';
import { REGION, USER_ARN, showLanding } from '../lib/domain';
import { Icon } from '../components/ui';
import Home from './Home';
import AskPanel from './AskPanel';
import CmRoute from './cm/CmRoute';

export default function WebApp({ parts }) {
  const S = useStore();

  if (!S.service) {
    return (
      <div className="web">
        <WebTop />
        <div className="w-body"><main className="w-main">
          <div className="home" style={{ maxWidth: 720 }}>
            <h1>Web application isn't enabled</h1>
            <p style={{ margin: '12px 0 20px' }}>An administrator must enable the AWS Transform web application in the AWS console before you can sign in.</p>
            <a className="btn primary" href="#/enable">Go to AWS console</a>
          </div>
        </main></div>
        <WebFooter />
      </div>
    );
  }

  const sec = parts[0] || '';
  const isCm = sec === 'cm';
  // The first-run landing, Get started, Run new analysis and run-group pages are focused: navigation open, no banner or Ask panel.
  const focused = isCm && (['get-started', 'new', 'runs'].includes(parts[1]) || (!parts[1] && showLanding(S)));
  const bannerKey = isCm ? 'cmBannerX' : 'homeBannerX';
  const banner = S[bannerKey] || focused ? null : isCm
    ? <><strong>AWS Transform continuous modernization</strong> now supports AWS-managed infrastructure for analysis. You can run analyses without provisioning or managing your own compute infrastructure. <a href="#" onClick={e => e.preventDefault()}>Learn more <Icon n="ext" s={14} /></a></>
    : <><strong>AWS Transform continuous modernization</strong> detects, prioritizes, and remediates technical debt across your repositories. You can now run analysis on AWS-managed infrastructure, without provisioning your own. Connect your source code to get started. <a href="#/web/cm">View continuous modernization</a></>;
  const showAsk = !focused && (isCm || ui.msgs.length > 0);
  const flash = ui.flash;

  return (
    <div className="web">
      <WebTop />
      {flash && (
        <div className="w-banner">
          <div className={`flashbar ${flash.type}`}>
            <Icon n={flash.type === 'success' ? 'ok' : flash.type === 'error' ? 'err' : 'info'} s={18} />
            <div className="grow">{flash.text}</div>
            <button className="x" onClick={() => setUi({ flash: null })} aria-label="Dismiss"><Icon n="x" s={18} /></button>
          </div>
        </div>
      )}
      {banner && (
        <div className="w-banner">
          <div className="flashbar">
            <Icon n="info" s={18} />
            <div className="grow">{banner}</div>
            <button className="x" onClick={() => commit(S => { S[bannerKey] = true; })} aria-label="Dismiss"><Icon n="x" s={18} /></button>
          </div>
        </div>
      )}
      <div className="w-body">
        {(ui.drawer || focused) && (
          <nav className="w-drawer">
            <a href="#/web" className={sec === '' ? 'active' : ''}>Home</a>
            <a href="#/web/cm" className={isCm ? 'active' : ''}>Continuous modernization</a>
            <hr />
            <a href="#/">AWS console</a>
            <a href="#" onClick={e => e.preventDefault()}>Documentation <Icon n="ext" s={14} /></a>
          </nav>
        )}
        <main className="w-main">{isCm ? <CmRoute parts={parts.slice(1)} /> : <Home />}</main>
        {/* Keep the panel within the viewport below the banners. */}
        {showAsk && <AskPanel offset={53 + 56 * ((flash ? 1 : 0) + (banner ? 1 : 0))} />}
      </div>
      <WebFooter returning={isCm && parts[1] === 'findings'} />
    </div>
  );
}

function WebTop() {
  return (
    <header className="w-top">
      <button className="burger" onClick={() => setUi({ drawer: !ui.drawer })} aria-label="Toggle navigation"><Icon n="menu" s={22} /></button>
      <a className="brand" href="#/web">AWS Transform</a>
      <div className="right">
        <a className="fb" href="#" onClick={e => { e.preventDefault(); openModal('feedback'); }}>Provide feedback</a>
        <span className="muted">|</span>
        <span className="region">N. Virginia ({REGION})</span>
        <span className="avatar" title={USER_ARN}>N</span>
      </div>
    </header>
  );
}

function WebFooter({ returning }) {
  const noop = e => e.preventDefault();
  return (
    <footer className="w-foot">
      <a href="#" onClick={noop}>Privacy</a><a href="#" onClick={noop}>Site terms</a><a href="#" onClick={noop}>Cookie preferences</a><a href="#" onClick={noop}>Documentation</a>
      <span>© 2026, Amazon Web Services, Inc. or its affiliates. All rights reserved.</span>
      {/* Prototype shortcut: reload the returning-user scenario (stale one-off analysis) without going through Reset. */}
      {returning && <button className="reset" onClick={() => { resetAll(); replaceState(returningState()); go('#/web/cm/findings'); }}>Load returning user</button>}
      <button className="reset" style={returning ? { marginLeft: 0 } : undefined} onClick={() => openModal('reset')}>Reset prototype</button>
    </footer>
  );
}
