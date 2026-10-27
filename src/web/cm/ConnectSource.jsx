import { useState } from 'react';
import { commit, db, nid } from '../../lib/store';
import { go } from '../../lib/router';
import { PROVIDERS, genRepos } from '../../lib/domain';
import { focusFirstError } from '../../lib/format';
import { Breadcrumbs, Choice, Field, Icon, Spinner, TextInput } from '../../components/ui';

const blank = () => ({ provider: 'github', org: '', token: '', url: '', includePublic: true, name: '', branch: '', commit: '', author: '', email: '' });

export function validateSource(c) {
  const e = {};
  const pv = PROVIDERS[c.provider];
  for (const k of ['branch', 'commit', 'email', 'url']) c = { ...c, [k]: c[k] || '' };
  if (!c.org.trim()) e.org = `Enter the ${pv.org.toLowerCase()}.`;
  else if (!/^[\w.-]+(\/[\w.-]+)*$/.test(c.org.trim())) e.org = 'Use letters, numbers, hyphens, underscores, and periods.';
  if (!c.token.trim()) e.token = 'Enter a personal access token.';
  else if (c.token.trim().length < 8) e.token = 'This token is too short to be valid.';
  if (!c.name.trim()) e.name = 'Enter a source name.';
  else if (!/^[A-Za-z0-9-]{1,64}$/.test(c.name.trim())) e.name = 'Use 1–64 letters, numbers, and hyphens.';
  else if (db().sources.some(s => s.name === c.name.trim())) e.name = 'A source with this name already exists.';
  if (c.branch && !/\{[^}]*\}/.test(c.branch)) e.branch = 'Include a {PLACEHOLDER}.';
  else if (c.branch && /\s|\.\.|~|\^|:|\\/.test(c.branch)) e.branch = 'Branch names cannot contain spaces or the characters ~ ^ : \\ or "..".';
  if (c.commit && !/\{[^}]*\}/.test(c.commit)) e.commit = 'Must contain {} or {any text}.';
  if (c.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) e.email = 'Enter a valid email address.';
  if (c.url && !/^https:\/\/[^\s/]+/.test(c.url)) e.url = 'Enter an https:// URL.';
  // Prototype hook: tokens starting with bad/invalid/expired simulate a provider rejection.
  if (!Object.keys(e).length && /^(bad|invalid|expired)/i.test(c.token.trim())) e.token = `${pv.name} rejected this token. Check that it hasn't expired and has the required scopes.`;
  return e;
}

export function createSource(c) {
  const isGh = c.provider === 'github';
  return commit(S => {
    const s = {
      id: nid('src'), name: c.name.trim(), provider: c.provider, org: c.org.trim(), url: (c.url || '').trim(),
      includePublic: isGh && c.includePublic, branch: (c.branch || '').trim(), commit: (c.commit || '').trim(), author: (c.author || '').trim(), email: (c.email || '').trim(),
      repos: genRepos(isGh && c.includePublic), createdAt: Date.now(),
    };
    S.sources.push(s);
    return s;
  });
}

/** Connect-source form. layout="inline" renders inside the wizard; layout="page" renders the standalone page body. */
export function ConnectSourceForm({ onConnected, onCancel, cancelLabel = 'Cancel', layout = 'inline' }) {
  const [c, setC] = useState(blank);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [gitOpen, setGitOpen] = useState(false);
  const pv = PROVIDERS[c.provider];
  const set = k => v => { setC(p => ({ ...p, [k]: v })); setErrors(e => (e[k] ? { ...e, [k]: undefined } : e)); };

  function connect() {
    const e = validateSource(c);
    setErrors(e);
    if (['branch', 'commit', 'author', 'email'].some(k => e[k])) setGitOpen(true);
    if (Object.keys(e).length) { focusFirstError(); return; }
    setBusy(true);
    setTimeout(() => {
      onConnected(createSource(c));
    }, 1400);
  }

  const text = (k, label, placeholder, opts = {}) => (
    <Field id={`c-${k}`} label={label} optional={opts.optional} desc={opts.desc} hint={opts.hint} error={errors[k]}>
      <TextInput id={`c-${k}`} type={opts.type || 'text'} invalid={errors[k]} placeholder={placeholder} value={c[k]} onChange={set(k)} style={{ maxWidth: 640 }} />
      {opts.after}
    </Field>
  );

  const gitFields = (
    <>
      {text('branch', 'Branch name template', 'feature/atx/{PLACEHOLDER}', { optional: true, desc: 'Template for the branch AWS Transform pushes changes to. Include a {PLACEHOLDER} — replaced with the generated branch name.', hint: "Must match your team's branch-naming rule, or the push is rejected. Example: feature/atx/{PLACEHOLDER}" })}
      {text('commit', 'Commit message template', 'fix: {PLACEHOLDER}', { optional: true, desc: 'Template for the commit messages AWS Transform creates. Include a {PLACEHOLDER} — the text inside the braces is replaced with the generated commit summary.', hint: 'Must contain {} or {any text}. Example: fix: {PLACEHOLDER}' })}
      {text('author', 'Git commit author name', 'AWS Transform', { optional: true, desc: 'Name used on commits AWS Transform pushes (git config user.name).', hint: 'Defaults to "ATX Bot". For example: AWS Transform' })}
      {text('email', 'Git commit author email', 'atx-bot@yourcompany.com', { optional: true, desc: 'Email used on commits AWS Transform pushes (git config user.email).', hint: 'Must be an email your organization allows, or the push is rejected. Example: atx-bot@yourcompany.com' })}
    </>
  );
  const fields = (
    <>
      <Field label="Provider">
        {Object.entries(PROVIDERS).map(([k, p]) => (
          <Choice key={k} name="provider" checked={c.provider === k} label={p.name} desc={p.desc} onChange={() => { setC(prev => ({ ...prev, provider: k })); setErrors({}); }} />
        ))}
      </Field>
      {pv.url && text('url', pv.url, c.provider === 'gitlab' ? 'https://gitlab.com' : 'https://bitbucket.example.com', { hint: c.provider === 'gitlab' ? 'Leave as https://gitlab.com unless you use a self-managed instance.' : 'Leave empty for Bitbucket Cloud.' })}
      {text('org', pv.org, pv.orgPh)}
      {text('token', 'Personal access token', 'Paste your personal access token', {
        type: 'password',
        after: <div className="token-help">The token needs {pv.scopes.map((s, i) => <span key={s}>{i > 0 && ' and '}<code>{s}</code></span>)} scopes. AWS Transform stores it encrypted and uses it to list repositories and open pull requests for remediations.</div>,
      })}
      {c.provider === 'github' && (
        <div className="field">
          <Choice type="checkbox" checked={c.includePublic} onChange={set('includePublic')} label="Include public repositories"
            desc="Any GitHub token has read-only access to public repositories by default. Turn this off to list only the private repositories this token is scoped to." />
        </div>
      )}
      {text('name', 'Source name', 'my-source', { hint: '1–64 characters: letters, numbers, and hyphens.' })}
      <div className={`expander ${gitOpen ? 'open' : ''}`}>
        <button type="button" onClick={() => setGitOpen(o => !o)} aria-expanded={gitOpen}>
          <Icon n="right" />Commit settings - <i style={{ fontWeight: 400 }}>optional</i>
        </button>
        {!gitOpen && <div className="small muted" style={{ marginLeft: 24, marginTop: 2 }}>Branch name, commit message, and commit author for the changes AWS Transform pushes. Defaults are used if left empty.</div>}
        {gitOpen && <div style={{ marginTop: 16 }}>{gitFields}</div>}
      </div>
    </>
  );
  const submit = <button className="btn primary" onClick={connect} disabled={busy}>{busy ? <><Spinner /> Connecting…</> : 'Connect source'}</button>;

  if (layout === 'page') {
    return (
      <>
        <div className="container">{fields}</div>
        <div className="wiz-actions"><button className="btn link" onClick={onCancel}>{cancelLabel}</button>{submit}</div>
      </>
    );
  }
  return (
    <>
      {fields}
      <div className="row" style={{ marginTop: 20 }}>{submit}{onCancel && <button className="btn link" onClick={onCancel}>{cancelLabel}</button>}</div>
    </>
  );
}

export function ConnectSourcePage() {
  return (
    <>
      <Breadcrumbs items={[['Continuous modernization', '#/web/cm'], ['Sources', '#/web/cm/sources'], ['Connect new source']]} />
      <h1 style={{ marginBottom: 16 }}>Connect new source</h1>
      <ConnectSourceForm layout="page" onCancel={() => go('#/web/cm/sources')}
        onConnected={src => go('#/web/cm/sources', { type: 'success', text: `Source ${src.name} connected. ${src.repos.length} repositories available.` })} />
    </>
  );
}
