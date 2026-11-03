import { useEffect, useMemo, useState } from 'react';
import { commit, db, nid, openModal, toast, useStore } from '../../lib/store';
import { TYPES, allFindings, fStatus, fTrans, remReady, skillFor, skillProgress, skillState, staleness, typeName } from '../../lib/domain';
import { askSend } from '../../lib/assistant';
import { fmtDate, plural } from '../../lib/format';
import { Alert, FilterSelect, Icon, Modal, SearchInput, Sev, TextInput, usePager, useSelection } from '../../components/ui';
import { RerunNotice, StaleBanner } from './StaleBanner';

/* Findings: groups and standalone findings in one list, in recommended order.
   A group rolls up the same finding across repositories (or a custom set you pick); expanding it lists its findings.
   An AWS Transform summary on top says what it grouped and where to start. */

const SEV = { High: 3, Medium: 2, Low: 1 };
const DAY = 86400000;
const STATUS = [['active', 'Open and in remediation'], ['Open', 'Open'], ['In remediation', 'In remediation'], ['Remediated', 'Remediated'], ['Dismissed', 'Dismissed'], ['all', 'All statuses']];
const REM_KINDS = [['td', 'Managed TD ready'], ['skill', 'Specialized skill'], ['generating', 'Generating skill'], ['none', 'Needs a skill'], ['rem', 'In a remediation']];
const GEN = { complex: { ms: 30000, min: 15 }, simple: { ms: 18000, min: 8 } };

const daysLeft = due => Math.ceil((new Date(due) - Date.now()) / DAY);
const topSev = fs => ['High', 'Medium', 'Low'].find(s => fs.some(f => f.sev === s));
const reposOf = fs => [...new Set(fs.map(f => f.repo))];
const isComplex = fs => fs.length > 3 || reposOf(fs).length > 2;
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
// "Outdated dependency: lodash 4.17.15 → 4.17.21" reads better as a group as "Upgrade lodash 4.17.15 → 4.17.21".
const groupTitle = t => t.replace(/^Outdated dependency: /, 'Upgrade ');
const remOf = f => db().remediations.find(r => !r.cancelled && r.findingIds.includes(f.key));

// What makes these findings matter, from the titles, categories and repository names.
function scopeTags(fs) {
  const repos = reposOf(fs).join(' ');
  const text = fs.map(f => `${f.title} ${f.cat}`).join(' ');
  return [
    /end of life|end of support|deprecat|runtime is/i.test(text) && ['EOL', 'red'],
    /CVE-|Vulnerab|Exposed secret/i.test(text) && ['Known CVEs', 'red'],
    /(payment|order|billing|checkout|pricing|identity)/i.test(repos) && ['Prod-critical', ''],
    /(web|api|mobile|okta|gateway)/i.test(repos) && ['Internet-facing', ''],
    /payment|billing|checkout/i.test(repos) && ['PCI scope', ''],
    /(→ \d|upgrade available|EKS)/i.test(text) && ['Breaking changes', 'amber'],
    /test coverage/i.test(text) && ['Low test coverage', 'amber'],
  ].filter(Boolean).slice(0, 4);
}

// How a row gets fixed: an existing remediation, a skill being generated, a managed TD or a ready skill, or nothing yet.
function remediation(fs) {
  const open = fs.filter(f => fStatus(f) === 'Open');
  if (!open.length) {
    const r = fs.map(remOf).find(Boolean);
    return { kind: 'rem', label: 'View remediation', sub: r ? `${r.name} · ${fStatus(fs[0]) === 'Remediated' ? 'complete' : 'in progress'}` : 'Dismissed', go: r && (() => openModal('remView', { id: r.id })) };
  }
  const gen = open.map(f => skillFor(f.key)).find(sk => sk && skillState(sk) === 'Generating');
  if (gen) return { kind: 'generating', skill: gen };
  if (open.some(f => fTrans(f) === 'Manual')) return { kind: 'none', label: 'Generate skill', sub: 'No matching skill yet' };
  const sk = open.map(f => skillFor(f.key, true)).find(Boolean);
  const ts = [...new Set(open.map(fTrans))];
  if (sk) return { kind: 'skill', label: 'Review specialized skill', sub: `Ready · ${sk.name}`, skill: sk };
  return { kind: 'td', label: 'Review managed TD', sub: `Ready · ${ts.length === 1 ? ts[0] : `${ts.length} transformations`}` };
}

// Recommended order: severity, not yet in a remediation, nearest AWS Health deadline, then vulnerabilities, groups first, size.
function score(r) {
  const fs = r.children;
  const due = fs.find(f => f.due)?.due;
  const vuln = fs.some(f => ['Vulnerabilities', 'Secrets'].includes(f.cat));
  return [-SEV[r.sev], r.open ? 0 : 1, due ? daysLeft(due) : vuln ? 9998 : 9999, r.kind === 'group' ? 0 : 1, -fs.length];
}
const byScore = (a, b) => { const x = score(a), y = score(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

export default function Findings({ q }) {
  useStore();
  const S = db();
  const all = allFindings();
  const [f, setF] = useState({ q: '', status: q.get('status') || 'active', type: '', repo: q.get('repo') || '', rem: '' });
  const [tab, setTab] = useState(q.get('tab') || 'recommended');
  const [expanded, setExpanded] = useState(() => new Set());
  const [modal, setModal] = useState(null);
  const [alertX, setAlertX] = useState(false);
  const sel = useSelection();
  const set = k => v => { setF(p => ({ ...p, [k]: v })); sel.clear(); };
  const ready = remReady();
  const stale = !!staleness();

  // Auto-remediate: once a skill passes validation, its remediation starts by itself.
  const skills = S.skills || [];
  useEffect(() => {
    skills.filter(sk => sk.auto && !sk.launched && skillState(sk) === 'Ready').forEach(sk => {
      commit(D => {
        const s = D.skills.find(x => x.id === sk.id);
        s.launched = true;
        const keys = sk.keys.filter(k => { const x = all.find(y => y.key === k); return x && fStatus(x) === 'Open'; });
        if (!keys.length) return;
        D.remediations.unshift({ id: nid('rem'), name: `${sk.name.split('/')[1]}-auto`, createdAt: Date.now(), findingIds: keys, repos: reposOf(all.filter(x => keys.includes(x.key))), trans: [sk.name], tags: ['auto-remediate'] });
      });
      toast(`The skill for ${sk.title} passed validation. AWS Transform started remediating it.`);
    });
  });

  const term = f.q.trim().toLowerCase();
  const keep = x => {
    const st = fStatus(x);
    return (f.status === 'all' || (f.status === 'active' ? ['Open', 'In remediation'].includes(st) : st === f.status))
      && (!f.type || x.type === f.type) && (!f.repo || x.repo === f.repo)
      && (!term || `${x.title} ${x.repo} ${x.cat} ${fTrans(x)}`.toLowerCase().includes(term));
  };

  const { rows, startWith, counts, totals } = useMemo(() => {
    const list = all.filter(keep);
    const custom = (S.fgroups || []).map(g => ({ g, children: list.filter(x => g.keys.includes(x.key)) })).filter(x => x.children.length);
    const inCustom = new Set(custom.flatMap(x => x.children.map(c => c.key)));
    // Suggested groups: the same finding in two or more repositories.
    const byTitle = new Map();
    list.filter(x => !inCustom.has(x.key)).forEach(x => byTitle.set(x.title, [...(byTitle.get(x.title) || []), x]));
    const mk = (key, kind, title, children, extra = {}) => ({ key, kind, title, children, sev: topSev(children), open: children.some(c => fStatus(c) === 'Open'), due: children.find(c => c.due)?.due, ...extra });
    const groups = [
      ...custom.map(({ g, children }) => mk(g.id, 'group', g.name, children, { custom: true })),
      ...[...byTitle].filter(([, cs]) => reposOf(cs).length > 1).map(([t, cs]) => mk(`G:${t}`, 'group', groupTitle(t), cs)),
    ];
    const grouped = new Set(groups.flatMap(g => g.children.map(c => c.key)));
    const solo = list.filter(x => !grouped.has(x.key)).map(x => mk(x.key, 'finding', x.title, [x]));
    const flat = groups.flatMap(g => g.children.map(c => mk(c.key, 'finding', c.title, [c], { group: g }))).concat(solo);
    const tabs = { recommended: [...groups, ...solo].filter(r => r.open || r.due), groups, all: flat };
    const shown = (tabs[tab] || []).filter(r => !f.rem || remediation(r.group ? r.group.children : r.children).kind === f.rem).sort(byScore);
    return {
      rows: shown,
      startWith: tabs.recommended.filter(r => r.open).sort(byScore).slice(0, 2).map(r => r.title),
      counts: { recommended: tabs.recommended.length, groups: groups.length, all: flat.length },
      totals: { findings: list.length, groups, solo: solo.length },
    };
  }, [all, S, f, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const skillRows = skills.filter(sk => !sk.cancelled && (skillState(sk) === 'Generating' || !sk.keys.every(k => remOf({ key: k }))));
  const pg = usePager(rows.length, 10, JSON.stringify(f) + tab);
  const page = pg.slice(rows);

  // Selection is by finding; selecting a group selects its findings.
  const selected = all.filter(x => sel.has(x.key));
  const openSel = selected.filter(x => fStatus(x) === 'Open');
  const pageKeys = page.flatMap(r => r.children.map(c => c.key));
  const allOnPage = pageKeys.length > 0 && pageKeys.every(sel.has);
  const toggle = keys => sel.setMany(keys, !keys.every(sel.has));
  const toggleExp = k => setExpanded(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const repos = [...new Set(all.map(x => x.repo))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const types = TYPES.filter(t => !t.hidden && all.some(x => x.type === t.id));

  const remediate = keys => ready && openModal('remediate', { keys, onDone: sel.clear });
  const act = (r, m) => {
    if (m.kind === 'none') setModal({ type: 'generate', r: r.group || r });
    else if (m.kind === 'skill') toast('Review specialized skill is coming soon.');
    else if (m.kind === 'td') toast('Review managed TD is coming soon.');
    else m.go?.();
  };
  function dismiss() {
    commit(D => openSel.forEach(x => { D.fstate[x.key] = 'Dismissed'; }));
    sel.clear();
    toast(`${plural(openSel.length, 'finding')} dismissed`);
  }

  // AWS Transform's summary: what it grouped, where to start, and the nearest AWS Health deadline.
  const grouped = totals.groups.reduce((n, g) => n + g.children.length, 0);
  const firstDue = all.filter(x => x.due && keep(x) && fStatus(x) === 'Open').sort((a, b) => a.due.localeCompare(b.due))[0];
  const summary = `I grouped ${plural(grouped, 'finding')} into ${plural(totals.groups.length, 'group')}${totals.solo ? ` and left ${totals.solo} standalone` : ''}.`
    + (startWith.length ? ` Start with ${startWith[0]}${startWith[1] ? `, then ${startWith[1]}` : ''}.` : '')
    + (firstDue ? ` The earliest AWS Health deadline is ${firstDue.title}, due ${fmtDate(firstDue.due)}.` : '');

  return (
    <div className="findings-v2">
      <StaleBanner />
      <RerunNotice />
      {!ready && !alertX && !stale && (
        <Alert type="info" title="Infrastructure for remediation is not ready" style={{ marginBottom: 18 }} onDismiss={() => setAlertX(true)}
          actions={<a className="btn small" href="#/web/cm/settings?how=1">View instruction</a>}>
          Setup infrastructure before creating remediations.
        </Alert>
      )}
      {totals.findings > 0 && (
        <div className="ai-summary">
          <span className="ai-summary-icon">✦</span>
          <p>{summary}</p>
          <button className="btn ai-ghost-btn" disabled={selected.length < 2} title={selected.length < 2 ? 'Select two or more findings first' : ''} onClick={() => setModal({ type: 'group' })}>Create custom group</button>
          <button className="btn ai-chat-btn" onClick={() => askSend(`Walk me through my findings. ${summary}`)}>✦ Continue in chat</button>
        </div>
      )}
      <div className="spread c-header">
        <h2>Findings <span className="counter">({totals.findings})</span>
          <span className="counter small heading-note"> · {plural(totals.groups.length, 'group')} · {totals.solo} standalone</span></h2>
        <div className="row">
          {f.repo && <a className="btn" href={`#/web/cm/new?repo=${encodeURIComponent(f.repo)}`}>Analyze {f.repo}</a>}
          <button className="btn" onClick={dismiss} disabled={!openSel.length}>Dismiss</button>
          <button className="btn primary" disabled={!openSel.length || !ready} onClick={() => remediate(openSel.map(x => x.key))}>Create remediation</button>
        </div>
      </div>
      <nav className="tabs findings-tabs">
        {[['recommended', 'Recommended'], ['groups', 'Groups'], ['skills', 'Skill generations'], ['all', 'All findings']].map(([id, label]) => (
          <a key={id} href="#" className={tab === id ? 'active' : ''} onClick={e => { e.preventDefault(); setTab(id); sel.clear(); }}>
            {label} <span className="tab-count">{id === 'skills' ? skillRows.length : counts[id]}</span>
          </a>
        ))}
      </nav>
      {tab === 'skills' ? <SkillGenerations skills={skillRows} onReview={() => toast('Review specialized skill is coming soon.')} /> : <>
        <div className="table-tools">
          <SearchInput value={f.q} onChange={set('q')} placeholder="Find findings" />
          <FilterSelect value={f.status} onChange={set('status')} aria-label="Status" options={STATUS} />
          <FilterSelect value={f.repo} onChange={set('repo')} aria-label="Repository" options={[['', 'All repositories'], ...repos]} />
          <FilterSelect value={f.rem} onChange={set('rem')} aria-label="Remediation" options={[['', 'Any remediation'], ...REM_KINDS]} />
          <FilterSelect value={f.type} onChange={set('type')} aria-label="Analysis" options={[['', 'All analyses'], ...types.map(t => [t.id, t.name])]} />
          <span className="grow" />
          <span className="muted small">Sorted by recommended · {page.length} of {rows.length}</span>
          {pg.el}
        </div>
        {selected.length > 0 && (
          <div className="selection-bar">
            <b>{plural(selected.length, 'finding')} selected</b>
            <span>{plural(openSel.length, 'open finding')} · {plural(reposOf(openSel).length, 'repository', 'repositories')}</span>
            <span className="sel-sep" />
            <span className="muted">One pull request per repository</span>
            <span className="grow" />
            <button className="btn link small" onClick={sel.clear}>Clear selection</button>
          </div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl findings-table">
            <thead>
              <tr>
                <th className="cb"><input type="checkbox" aria-label="Select all on page" checked={allOnPage} disabled={!page.length} onChange={() => sel.setMany(pageKeys, !allOnPage)} /></th>
                <th>Finding</th><th style={{ width: 96 }}>Severity</th><th style={{ width: '22%' }}>Scope</th><th style={{ width: '24%' }}>Remediation</th>
              </tr>
            </thead>
            <tbody>
              {page.map(r => r.kind === 'group'
                ? <GroupRows key={r.key} r={r} open={expanded.has(r.key)} onToggle={() => toggleExp(r.key)} sel={sel} toggle={toggle} act={act} />
                : <FindingRow key={r.key} r={r} sel={sel} act={act} />)}
              {!rows.length && <tr><td colSpan={5} className="empty" style={{ color: 'var(--text)' }}>{all.length ? 'No findings match the filters.' : 'No findings. Run an analysis to discover tech debt.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </>}

      {modal?.type === 'generate' && <GenerateSkillModal r={modal.r} onClose={() => setModal(null)} />}
      {modal?.type === 'group' && <CustomGroupModal keys={selected.map(x => x.key)} onClose={() => setModal(null)} onDone={() => { sel.clear(); setTab('groups'); }} />}
    </div>
  );
}

function DueTag({ due }) {
  if (!due) return null;
  const d = daysLeft(due);
  return <div><span className="aws-ple-tag due-tag" title={`${d} days left`}>AWS Health · due {fmtDate(due)}</span></div>;
}

function ScopeCell({ fs }) {
  const repos = reposOf(fs);
  const tags = scopeTags(fs);
  return (
    <div className="scope-cell">
      <span>{repos.length === 1 ? repos[0] : plural(repos.length, 'repository', 'repositories')}</span>
      {tags.length > 0 && (
        <div className="scope-tags">
          {tags.slice(0, 2).map(([t, tone]) => <span key={t} className={`scope-tag ${tone}`}>{t}</span>)}
          {tags.length > 2 && <span className="scope-tag" title={tags.slice(2).map(([t]) => t).join(', ')}>+{tags.length - 2}</span>}
        </div>
      )}
    </div>
  );
}

function RemediationCell({ r, act }) {
  const m = remediation(r.children);
  if (m.kind === 'generating') {
    const sk = m.skill, frac = skillProgress(sk);
    return (
      <div className="remed-cell">
        <b className="gen-title"><span className="gen-spark">✦</span> Generating skill · {Math.round(frac * 100)}%</b>
        <span className="gen-meter"><span style={{ width: `${Math.max(4, frac * 100)}%` }} /></span>
        <div className="muted small">About {Math.max(1, Math.round((1 - frac) * sk.minutes))} min left</div>
      </div>
    );
  }
  return (
    <div className="remed-cell">
      {m.go || m.kind !== 'rem' ? <a href="#" onClick={e => { e.preventDefault(); act(r, m); }}><b>{m.label}</b></a> : <b>{m.label}</b>}
      <div className="muted small">{m.sub}</div>
    </div>
  );
}

function GroupRows({ r, open, onToggle, sel, toggle, act }) {
  const keys = r.children.map(c => c.key);
  const all = keys.every(sel.has);
  const some = !all && keys.some(sel.has);
  return (
    <>
      <tr className={`group-row ${all ? 'sel' : ''}`}>
        <td className="cb"><input type="checkbox" checked={all} ref={el => el && (el.indeterminate = some)} onChange={() => toggle(keys)} aria-label={`Select ${r.title}`} /></td>
        <td>
          <div className="group-cell">
            <button type="button" className="copy caret" aria-expanded={open} aria-label={open ? 'Collapse group' : 'Expand group'} onClick={onToggle}>
              <Icon n="down" s={14} className={open ? '' : 'rot'} />
            </button>
            <div>
              <a href="#" onClick={e => { e.preventDefault(); onToggle(); }}><b>{r.title}</b></a>
              {r.custom && <> <span className="custom-tag">Custom group</span></>}
              <DueTag due={r.due} />
              <div className="muted small">Group · {plural(r.children.length, 'finding')}</div>
            </div>
          </div>
        </td>
        <td><Sev s={r.sev} /></td>
        <td><ScopeCell fs={r.children} /></td>
        <td><RemediationCell r={r} act={act} /></td>
      </tr>
      {open && r.children.map(c => (
        <tr key={c.key} className={`child-row ${sel.has(c.key) ? 'sel' : ''}`}>
          <td className="cb" />
          <td>
            <div className="child-cell">
              <input type="checkbox" checked={sel.has(c.key)} onChange={() => sel.toggle(c.key)} aria-label={`Select ${c.title} in ${c.repo}`} />
              <div>
                <a href="#" onClick={e => { e.preventDefault(); openModal('finding', { id: c.key }); }}>{r.custom ? c.title : c.repo}</a>
                <div className="muted small mono">{c.file}:{c.line}</div>
              </div>
            </div>
          </td>
          <td><Sev s={c.sev} /></td>
          <td>{c.repo}</td>
          <td className="muted small">{fStatus(c) === 'Open' ? 'Remediated with this group' : fStatus(c)}</td>
        </tr>
      ))}
    </>
  );
}

function FindingRow({ r, sel, act }) {
  const x = r.children[0];
  return (
    <tr className={sel.has(x.key) ? 'sel' : ''}>
      <td className="cb"><input type="checkbox" checked={sel.has(x.key)} onChange={() => sel.toggle(x.key)} aria-label={`Select ${x.title}`} /></td>
      <td>
        <div className="group-cell">
          <span className="caret-spacer" />
          <div>
            <a href="#" onClick={e => { e.preventDefault(); openModal('finding', { id: x.key }); }}><b>{x.title}</b></a>
            <DueTag due={x.due} />
            <div className="muted small">{r.group ? <>In group: {r.group.title}</> : `Standalone · ${typeName(x.type)}`}</div>
          </div>
        </div>
      </td>
      <td><Sev s={x.sev} /></td>
      <td><ScopeCell fs={[x]} /></td>
      <td>{r.group ? <span className="muted small">Fixed with its group</span> : <RemediationCell r={r} act={act} />}</td>
    </tr>
  );
}

// Skills AWS Transform is generating, or has generated and is waiting for review.
function SkillGenerations({ skills, onReview }) {
  if (!skills.length) return <div className="empty"><b>No skill generations</b><p className="muted">When you generate a specialized skill, its progress shows here.</p></div>;
  const findings = allFindings();
  return (
    <>
      <table className="tbl findings-table">
        <thead><tr><th>Skill for</th><th style={{ width: '26%' }}>Progress</th><th style={{ width: 130 }}>Agent minutes</th><th style={{ width: '20%' }}>Next</th></tr></thead>
        <tbody>
          {skills.map(sk => {
            const done = skillState(sk) === 'Ready', frac = skillProgress(sk);
            const step = frac < 0.5 ? 1 : frac < 0.85 ? 2 : 3;
            const n = sk.keys.length, repos = reposOf(findings.filter(x => sk.keys.includes(x.key)));
            return (
              <tr key={sk.id}>
                <td><b>{sk.title}</b><div className="muted small">{n > 1 ? 'Group' : 'Standalone'} · {plural(n, 'finding')} · {repos.length === 1 ? repos[0] : plural(repos.length, 'repository', 'repositories')}</div></td>
                <td>
                  <div className="sg-head"><b className={done ? 'sg-ok' : 'sg-run'}>{done ? 'Ready to review' : step === 1 ? 'Generating' : 'Validating'}</b><span className="muted small">{done ? 'Done' : `~${Math.max(1, Math.round((1 - frac) * sk.minutes))} min left`}</span></div>
                  <span className={`gen-meter wide ${done ? 'ok' : ''}`}><span style={{ width: `${Math.max(4, frac * 100)}%` }} /></span>
                  <div className="muted small">{done ? `Passed validation on all ${plural(n, 'finding')}` : `Step ${step} of 3 · ${['reading the code', `testing against the ${plural(n, 'finding')}`, 'checking for regressions'][step - 1]}`}</div>
                </td>
                <td>{done ? sk.minutes : `${Math.max(1, Math.round(frac * sk.minutes))} so far`}</td>
                <td>{done
                  ? (sk.launched ? <span className="muted small">Remediation started automatically</span> : <button className="btn primary small" onClick={() => onReview(sk)}>Review skill</button>)
                  : <><div className="small">{sk.auto ? 'Runs automatically once it passes validation' : "You review it when it's done"}</div>
                    <a href="#" onClick={e => { e.preventDefault(); commit(D => { D.skills.find(x => x.id === sk.id).cancelled = true; }); toast(`Stopped generating the skill for ${sk.title}.`); }}><b>Cancel</b></a></>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small table-note">Skills keep generating if you leave this page.</p>
    </>
  );
}

// Asks before generating: what it costs, why a skill is needed, and whether to remediate automatically.
function GenerateSkillModal({ r, onClose }) {
  const [auto, setAuto] = useState(false);
  const fs = r.children.filter(x => fStatus(x) === 'Open');
  const repos = reposOf(fs);
  const c = isComplex(fs) ? GEN.complex : GEN.simple;
  const text = fs.map(x => `${x.title} ${x.cat}`).join(' ');
  const why = /config|hard-coded|blocking|i\/o/i.test(text) ? ['The change spans code, configuration and infrastructure templates', 'No managed TD knows which values and call sites are safe to change']
    : /RDS|EKS|PostgreSQL|cluster/i.test(text) ? ['The upgrade touches infrastructure as code and the application together', 'No managed TD covers this engine or cluster version change']
    : /auth|token|secret/i.test(text) ? ["Fixes must follow each repository's authentication patterns", 'No managed TD covers these patterns']
    : [`No managed or custom TD covers ${(fs[0]?.cat || 'these').toLowerCase()} findings like these`, 'The right fix depends on how each repository is structured'];
  function generate() {
    commit(D => {
      D.skills = D.skills || [];
      D.skills.unshift({ id: nid('skill'), name: `skill/${slug(r.title)}`, title: r.title, keys: fs.map(x => x.key), startedAt: Date.now(), duration: c.ms, minutes: c.min, auto });
    });
    toast(`Generating a specialized skill for ${r.title}. Progress shows on its row.`);
    onClose();
  }
  return (
    <Modal title="Generate a specialized skill" onClose={onClose} footer={<><button className="btn link" onClick={onClose}>Cancel</button><button className="btn primary" onClick={generate}>Generate skill</button></>}>
      <p>No managed or custom TD covers <b>{r.title}</b>, so AWS Transform will build a specialized skill for it.{c === GEN.complex && ' This one is complex, so it takes longer and uses more agent minutes than running an existing TD.'}</p>
      <h4 className="gen-h">Why a skill is needed</h4>
      <ul className="gen-why">{why.map(w => <li key={w}>{w}</li>)}</ul>
      <div className="gen-stats">
        <div><span className="muted small">Time to generate</span><b>{c === GEN.complex ? '5–10 min' : '2–5 min'}</b><span className="muted small">You can leave this page</span></div>
        <div><span className="muted small">Agent minutes</span><b>{c === GEN.complex ? '20–30' : '10–15'}</b><span className="muted small">vs. ~10 for a managed TD</span></div>
        <div><span className="muted small">Covers</span><b>{plural(fs.length, 'finding')}</b><span className="muted small">{plural(repos.length, 'repository', 'repositories')}</span></div>
      </div>
      <p className="muted small">Estimates, billed at your account's agent-minute rate.</p>
      <label className="gen-auto">
        <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />
        <span><b>Auto-remediate when the skill is ready</b>
          <span className="muted small" style={{ display: 'block' }}>After validation, runs on {plural(repos.length, 'repository', 'repositories')} and opens {repos.length === 1 ? 'a pull request' : 'pull requests'}. You still review and merge.</span></span>
      </label>
    </Modal>
  );
}

function CustomGroupModal({ keys, onClose, onDone }) {
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  function create() {
    if (!name.trim()) { setErr('Enter a name.'); return; }
    commit(D => {
      D.fgroups = (D.fgroups || []).map(g => ({ ...g, keys: g.keys.filter(k => !keys.includes(k)) })).filter(g => g.keys.length);
      D.fgroups.unshift({ id: nid('grp'), name: name.trim(), keys, createdAt: Date.now() });
    });
    toast(`Group ${name.trim()} created with ${plural(keys.length, 'finding')}.`);
    onClose(); onDone();
  }
  return (
    <Modal title="Create custom group" onClose={onClose} footer={<><button className="btn link" onClick={onClose}>Cancel</button><button className="btn primary" onClick={create}>Create group</button></>}>
      <p>Group {plural(keys.length, 'selected finding')} so they're tracked and remediated together.</p>
      <label className="lbl" htmlFor="cg-name" style={{ display: 'block', fontWeight: 700, margin: '12px 0 4px' }}>Group name</label>
      <TextInput id="cg-name" value={name} onChange={v => { setName(v); setErr(''); }} invalid={err} placeholder="e.g. Payments Q1 upgrades" />
      {err && <div className="err" style={{ color: "var(--red)", fontSize: 12, marginTop: 4, display: "flex", gap: 4 }}><Icon n="err" s={14} />{err}</div>}
    </Modal>
  );
}
