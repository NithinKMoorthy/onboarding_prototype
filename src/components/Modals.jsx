import { useState } from 'react';
import { closeModal, commit, db, defaults, nid, openModal, replaceState, resetAll, toast, ui, useStore } from '../lib/store';
import { go } from '../lib/router';
import { returningState } from '../lib/scenarios';
import { ACCOUNT, PROVIDERS, REGION, STACKS, TYPES, aFindings, aStatus, allFindings, fStatus, fTrans, langOf, remReady, remStatus, timeline, typeName } from '../lib/domain';
import { fmtDT, hash, plural } from '../lib/format';
import { BUCKET_ERR, BUCKET_RE } from '../console/EnableWebApp';
import { cancelRemediation } from '../web/cm/Remediations';
import { Alert, CancelButton, Choice, CopyButton, Field, Icon, Modal, Sev, Status, TextInput } from './ui';

const MODALS = {
  cli: CliModal, feedback: FeedbackModal, reset: ResetModal,
  deleteService: DeleteServiceModal, storage: StorageModal,
  finding: FindingModal, report: ReportModal, remediate: RemediateModal, remView: RemViewModal,
  source: SourceModal, removeSource: RemoveSourceModal, deleteSchedules: DeleteSchedulesModal, deleteAnalysis: DeleteAnalysisModal,
  deploy: DeployModal, compareTypes: CompareTypesModal,
};

export default function Modals() {
  useStore();
  const m = ui.modal;
  const C = m && MODALS[m.kind];
  return C ? <C key={`${m.kind}:${m.id || ''}`} {...m} /> : null;
}

const Done = ({ label = 'Close' }) => <button className="btn primary" onClick={closeModal}>{label}</button>;
const danger = { background: 'var(--red)', borderColor: 'var(--red)' };
const CLI = 'curl -fsSL https://transform-cli.awsstatic.com/install.sh | bash';

function CliModal() {
  const svc = db().service;
  return (
    <Modal title="Install the AWS Transform CLI" footer={<Done label="Done" />}>
      <ol className="stack-s" style={{ paddingLeft: 20, margin: 0 }}>
        <li>Install the CLI:<div className="row" style={{ marginTop: 4 }}><span className="mono">{CLI}</span><CopyButton text={CLI} /></div></li>
        <li>Sign in with your AWS credentials:<div className="mono" style={{ marginTop: 4 }}>atx login{svc && ` --tenant ${svc.tenant}`} --region {REGION}</div></li>
        <li>Run a transformation in a repository:<div className="mono" style={{ marginTop: 4 }}>atx custom run --definition AWS/java-version-upgrade</div></li>
      </ol>
      {!svc && <p className="small muted" style={{ marginTop: 12 }}>The CLI works without enabling the web application.</p>}
    </Modal>
  );
}

function FeedbackModal() {
  const [text, setText] = useState('');
  return (
    <Modal title="Provide feedback" footer={<><CancelButton /><button className="btn primary" onClick={() => { closeModal(); toast('Thanks — feedback sent'); }}>Submit</button></>}>
      <Field id="m-fb" label="What's working, and what isn't?"><textarea id="m-fb" className="input" rows={5} value={text} onChange={e => setText(e.target.value)} /></Field>
    </Modal>
  );
}

function ResetModal() {
  const [as, setAs] = useState('new');
  function reset() {
    resetAll();
    if (as === 'returning') { replaceState(returningState()); go('#/web/cm/findings'); }
    else go('#/');
  }
  return (
    <Modal title="Reset prototype?" footer={<><CancelButton /><button className="btn primary" onClick={reset}>Reset</button></>}>
      <p>This clears all prototype data (service, sources, analyses, findings, infrastructure). Choose where to start.</p>
      <div style={{ marginTop: 14 }}>
        <Choice name="m-reset" checked={as === 'new'} onChange={() => setAs('new')} label="New user"
          desc="Nothing set up. Starts at the console landing page." />
        <Choice name="m-reset" checked={as === 'returning'} onChange={() => setAs('returning')} label="Returning user"
          desc="Web app enabled and acme-platform connected. Tech debt (comprehensive) ran once on 6 repositories 4 weeks ago and was never scheduled." />
      </div>
    </Modal>
  );
}

function DeleteServiceModal() {
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  function del() {
    if (confirm.trim().toLowerCase() !== 'delete') { setError('Type delete to confirm.'); return; }
    replaceState({ ...defaults(), infra: db().infra });
    go('#/', { type: 'success', text: 'AWS Transform service deleted.' });
  }
  return (
    <Modal title="Delete AWS Transform service?" footer={<><CancelButton /><button className="btn primary" style={danger} onClick={del}>Delete</button></>}>
      <p>This permanently deletes the service in {REGION}, including the web application, connected sources, analyses, findings, schedules, and remediation history. Users lose access to the URL immediately.</p>
      <p style={{ marginTop: 10 }}>CloudFormation stacks you deployed stay in your account. Delete them separately.</p>
      <Field id="m-confirm" label={<>To confirm, type <b>delete</b></>} error={error} style={{ marginTop: 16 }}>
        <TextInput id="m-confirm" value={confirm} onChange={setConfirm} invalid={error} />
      </Field>
    </Modal>
  );
}

function StorageModal() {
  const svc = db().service;
  const [storage, setStorage] = useState(svc.storage);
  const [bucket, setBucket] = useState(svc.bucket || '');
  const [error, setError] = useState('');
  function save() {
    if (storage === 's3' && !BUCKET_RE.test(bucket.trim())) { setError(BUCKET_ERR); return; }
    commit(S => { S.service.storage = storage; S.service.bucket = bucket.trim(); });
    closeModal();
    toast('Storage settings saved');
  }
  return (
    <Modal title="Edit storage" footer={<><CancelButton /><button className="btn primary" onClick={save}>Save</button></>}>
      <Choice name="ms" checked={storage === 'managed'} onChange={() => setStorage('managed')} label="AWS Transform managed storage" />
      <Choice name="ms" checked={storage === 's3'} onChange={() => setStorage('s3')} label="My own Amazon S3 bucket">
        <Field id="m-b" label="S3 bucket name" error={error} style={{ marginTop: 12 }}><TextInput id="m-b" value={bucket} onChange={setBucket} invalid={error} /></Field>
      </Choice>
      <p className="small muted" style={{ marginTop: 12 }}>New artifacts go to the new location. Existing artifacts stay where they are.</p>
    </Modal>
  );
}

function FindingModal({ id }) {
  const f = allFindings().find(x => x.key === id);
  if (!f) return null;
  const st = fStatus(f);
  const ready = remReady();
  const setState = (v, msg) => { commit(S => { if (v) S.fstate[f.key] = v; else delete S.fstate[f.key]; }); closeModal(); toast(msg); };
  const footer = st === 'Open'
    ? <><button className="btn" onClick={() => setState('Dismissed', 'Finding dismissed')}>Dismiss</button>
      <button className="btn primary" disabled={!ready || f.fix !== 'Automated'} title={ready ? '' : 'Deploy remediation infrastructure first'} onClick={() => openModal('remediate', { keys: [f.key] })}>Create remediation</button></>
    : st === 'Dismissed' ? <button className="btn" onClick={() => setState(null, 'Finding reopened')}>Reopen</button> : <Done />;
  return (
    <Modal title={f.title} wide footer={footer}>
      <div className="row wrap" style={{ marginBottom: 12 }}><Sev s={f.sev} /><Status s={st} /><span className="badge grey">{typeName(f.type)}</span><span className="badge outline">{f.fix} fix</span></div>
      <div className="review"><dl>
        <dt>Repository</dt><dd>{f.repo} · {langOf(f.repo)}</dd>
        <dt>Location</dt><dd className="mono">{f.file}{/\.(java|js|py)$/.test(f.file) && `:${f.line}`}</dd>
        <dt>Description</dt><dd>{f.desc}</dd>
        <dt>Recommendation</dt><dd>{f.rec}</dd>
        <dt>Transformation</dt><dd className="mono">{fTrans(f)}</dd>
        <dt>Reported</dt><dd>{fmtDT(f.at)}</dd>
      </dl></div>
    </Modal>
  );
}

function ReportModal({ id, repo }) {
  const a = db().analyses.find(x => x.id === id);
  if (!a) return null;
  const fs = aFindings(a).filter(f => f.repo === repo);
  return (
    <Modal title={`${repo} report`} wide footer={<><button className="btn" onClick={() => go(`#/web/cm/findings?repo=${encodeURIComponent(repo)}`)}>Open in Findings</button><Done /></>}>
      <p className="muted" style={{ marginBottom: 12 }}>{typeName(a.type)} · {langOf(repo)} · analyzed {fmtDT(timeline(a, a.repos.indexOf(repo)).end)}</p>
      <table className="tbl">
        <thead><tr><th>Finding</th><th>Severity</th><th>Fix</th></tr></thead>
        <tbody>
          {fs.length ? fs.map(f => (
            <tr key={f.key}><td><a href="#" onClick={e => { e.preventDefault(); openModal('finding', { id: f.key }); }}>{f.title}</a></td><td><Sev s={f.sev} /></td><td>{f.fix}</td></tr>
          )) : <tr><td colSpan={3} className="empty"><b>No findings</b>This repository passed every check in this analysis.</td></tr>}
        </tbody>
      </table>
    </Modal>
  );
}

function RemediateModal({ keys, onDone }) {
  const chosen = allFindings().filter(f => keys.includes(f.key) && fStatus(f) === 'Open');
  const auto = chosen.filter(f => fTrans(f) !== 'Manual');
  const manual = chosen.length - auto.length;
  const byT = {};
  auto.forEach(f => { byT[fTrans(f)] = (byT[fTrans(f)] || 0) + 1; });
  const repos = [...new Set(auto.map(f => f.repo))];
  const [name, setName] = useState(`remediation-${new Date().toISOString().slice(0, 10)}`);
  const [tags, setTags] = useState('');
  const [error, setError] = useState('');

  function create() {
    if (!/^[\w.-]{1,64}$/.test(name.trim())) { setError('Use 1–64 letters, numbers, hyphens, underscores, and periods.'); return; }
    const r = commit(S => {
      const r = { id: nid('rem'), name: name.trim(), createdAt: Date.now(), findingIds: auto.map(f => f.key), repos, trans: Object.keys(byT), tags: tags.split(',').map(t => t.trim()).filter(Boolean) };
      S.remediations.unshift(r);
      return r;
    });
    onDone?.();
    go('#/web/cm/remediations', { type: 'success', text: `Remediation ${r.name} started. AWS Transform is opening ${plural(r.repos.length, 'pull request')}.` });
  }

  return (
    <Modal title="Create remediation" wide footer={<><CancelButton /><button className="btn primary" disabled={!auto.length} onClick={create}>Create remediation</button></>}>
      <p>AWS Transform applies the transformations below on infrastructure in your account and opens one pull request per repository ({plural(repos.length, 'repository', 'repositories')}).</p>
      {manual > 0 && <Alert type="warning" style={{ marginTop: 12 }}>{plural(manual, 'finding')} use a Manual fix and will be skipped.</Alert>}
      <table className="tbl" style={{ marginTop: 12 }}>
        <thead><tr><th>Transformation</th><th>Findings</th></tr></thead>
        <tbody>
          {Object.keys(byT).length ? Object.entries(byT).map(([t, c]) => <tr key={t}><td className="mono">{t}</td><td>{c}</td></tr>)
            : <tr><td colSpan={2} className="empty">No findings with an automated fix selected.</td></tr>}
        </tbody>
      </table>
      <Field id="m-rn" label="Name" error={error} style={{ marginTop: 16 }}><TextInput id="m-rn" value={name} onChange={setName} invalid={error} /></Field>
      <Field id="m-tags" label="Tags" optional hint="Separate tags with commas."><TextInput id="m-tags" placeholder="q4-upgrades, team-payments" value={tags} onChange={setTags} /></Field>
    </Modal>
  );
}

function prUrl(src, repo, num) {
  return {
    github: `https://github.com/${src.org}/${repo}/pull/${num}`,
    gitlab: `${src.url || 'https://gitlab.com'}/${src.org}/${repo}/-/merge_requests/${num}`,
    bitbucket: `https://bitbucket.org/${src.org}/${repo}/pull-requests/${num}`,
  }[src.provider];
}

function RemViewModal({ id }) {
  const S = db();
  const r = S.remediations.find(x => x.id === id);
  if (!r) return null;
  const rs = remStatus(r);
  const byKey = Object.fromEntries(allFindings().map(f => [f.key, f]));
  return (
    <Modal title={r.name} wide footer={<>{rs === 'In progress' && <button className="btn" onClick={() => { cancelRemediation(r.id); closeModal(); }}>Cancel remediation</button>}<Done /></>}>
      <div className="row" style={{ marginBottom: 12 }}><Status s={rs} /><span className="muted">Created {fmtDT(r.createdAt)}</span></div>
      <table className="tbl">
        <thead><tr><th>Repository</th><th>Findings</th><th>Pull request</th></tr></thead>
        <tbody>
          {r.repos.map((repo, i) => {
            const ids = r.findingIds.filter(k => byKey[k]?.repo === repo);
            const aId = byKey[ids[0]]?.aId;
            const src = S.sources.find(s => s.id === S.analyses.find(a => a.id === aId)?.sourceId) || S.sources[0] || { provider: 'github', org: 'my-org', branch: '' };
            const branch = (src.branch || 'atx/{PLACEHOLDER}').replace(/\{[^}]*\}/, `${r.id}-${i + 1}`);
            const num = 100 + (hash(r.id + repo) % 800);
            const url = prUrl(src, repo, num);
            return (
              <tr key={repo}>
                <td>{repo}<div className="small muted mono">{branch}</div></td>
                <td>{ids.length}</td>
                <td>{rs === 'Completed' ? <span className="row" style={{ gap: 4 }}>#{num}<CopyButton text={url} /></span> : rs === 'In progress' ? <Status s="In progress">Creating</Status> : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {r.tags.length > 0 && <p style={{ marginTop: 12 }}>Tags: {r.tags.map(t => <span key={t} className="badge outline" style={{ marginRight: 4 }}>{t}</span>)}</p>}
    </Modal>
  );
}

function SourceModal({ id }) {
  const s = db().sources.find(x => x.id === id);
  if (!s) return null;
  const pv = PROVIDERS[s.provider];
  return (
    <Modal title={s.name} footer={<Done />}>
      <div className="review"><dl>
        <dt>Status</dt><dd><Status s="Connected" /></dd>
        <dt>Provider</dt><dd>{pv.name}{s.url && ` (${s.url})`}</dd>
        <dt>{pv.org}</dt><dd>{s.org}</dd>
        <dt>Repositories</dt><dd>{s.repos.length}{s.provider === 'github' && (s.includePublic ? ' (including public)' : ' (private only)')}</dd>
        <dt>Branch template</dt><dd className="mono">{s.branch || 'Default'}</dd>
        <dt>Commit template</dt><dd className="mono">{s.commit || 'Default'}</dd>
        <dt>Commit author</dt><dd>{s.author || 'ATX Bot'}{s.email && ` <${s.email}>`}</dd>
        <dt>Connected</dt><dd>{fmtDT(s.createdAt)}</dd>
      </dl></div>
    </Modal>
  );
}

function RemoveSourceModal({ ids, onDone }) {
  const running = db().analyses.filter(a => ids.includes(a.sourceId) && aStatus(a) === 'In progress');
  function remove() {
    commit(S => {
      S.analyses.forEach(a => { if (ids.includes(a.sourceId) && aStatus(a) === 'In progress') a.stoppedAt = Date.now(); });
      S.sources = S.sources.filter(s => !ids.includes(s.id));
    });
    onDone?.();
    closeModal();
    toast(`${plural(ids.length, 'source')} removed`);
  }
  return (
    <Modal title={`Remove ${plural(ids.length, 'source')}?`} footer={<><CancelButton /><button className="btn primary" onClick={remove}>Remove</button></>}>
      <p>AWS Transform deletes the stored token and stops listing these repositories. Existing analyses and findings are kept.</p>
      {running.length > 0 && <Alert type="warning" style={{ marginTop: 12 }}>{plural(running.length, 'running analysis', 'running analyses')} use this source and will be stopped.</Alert>}
    </Modal>
  );
}

function DeleteSchedulesModal({ ids, onDone }) {
  function del() {
    commit(S => { S.schedules = S.schedules.filter(x => !ids.includes(x.id)); });
    onDone?.();
    closeModal();
    toast(`${plural(ids.length, 'schedule')} deleted`);
  }
  return (
    <Modal title={`Delete ${plural(ids.length, 'schedule')}?`} footer={<><CancelButton /><button className="btn primary" onClick={del}>Delete</button></>}>
      <p>Future runs are cancelled. Past analyses and findings are kept.</p>
    </Modal>
  );
}

function DeleteAnalysisModal({ id }) {
  const a = db().analyses.find(x => x.id === id);
  if (!a) return null;
  function del() {
    commit(S => { S.analyses = S.analyses.filter(x => x.id !== id); });
    go('#/web/cm/analyses', { type: 'success', text: 'Analysis deleted.' });
  }
  return (
    <Modal title="Delete analysis?" footer={<><CancelButton /><button className="btn primary" onClick={del}>Delete</button></>}>
      <p>Deletes <b>{a.name}</b> and the findings only it reported. Findings also reported by other analyses are kept.</p>
    </Modal>
  );
}

function DeployModal({ stacks }) {
  const names = stacks.filter(n => !db().infra[n]);
  function deploy() {
    commit(S => { names.forEach(n => { S.infra[n] = { startedAt: Date.now(), version: '1.4.2', op: 'deploy' }; }); });
    closeModal();
    toast('Deployment started');
  }
  return (
    <Modal title="Deploy infrastructure" footer={<><CancelButton /><button className="btn primary" onClick={deploy} disabled={!names.length}>Deploy</button></>}>
      <p>AWS Transform creates {names.length === 1 ? 'this CloudFormation stack' : 'these CloudFormation stacks'} in account <b>{ACCOUNT}</b> ({REGION}). You own and manage these resources and pay for what they use.</p>
      <ul style={{ margin: '12px 0 0', paddingLeft: 20 }}>
        {names.map(n => <li key={n}><span className="mono">{n}</span> <span className="muted">· {STACKS.find(s => s.name === n).type}</span></li>)}
      </ul>
      <p className="small muted" style={{ marginTop: 12 }}>In the product, this opens the CloudFormation quick-create page. This prototype simulates the deployment.</p>
    </Modal>
  );
}

function CompareTypesModal() {
  return (
    <Modal title="Analysis types" wide footer={<Done />}>
      <div className="stack">
        {TYPES.map(t => (
          <div key={t.id} className="row" style={{ alignItems: 'flex-start' }}>
            <span className={`ico ${t.ico}`}><Icon n={t.icon} s={22} /></span>
            <div className="grow"><b>{t.name}</b><div className="muted">{t.desc}</div></div>
            <a href={`#/web/cm/new?type=${t.id}`} className="small" style={{ fontWeight: 700, whiteSpace: 'nowrap', textDecoration: 'none' }}>Run this analysis</a>
          </div>
        ))}
      </div>
    </Modal>
  );
}

