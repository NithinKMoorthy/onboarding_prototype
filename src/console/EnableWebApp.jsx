import { useState } from 'react';
import { commit, openModal, useStore } from '../lib/store';
import { go } from '../lib/router';
import { ACCOUNT, REGION } from '../lib/domain';
import { focusFirstError, hex } from '../lib/format';
import { Alert, Choice, Field, Icon, Select, Spinner, TextInput } from '../components/ui';
import { RegionNote } from './shared';

const KMS_RE = /^arn:aws:kms:[a-z0-9-]+:\d{12}:(key|alias)\/.+$/;
export const BUCKET_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
export const BUCKET_ERR = 'Bucket names are 3–63 lowercase letters, numbers, periods, and hyphens.';

export default function EnableWebApp() {
  const S = useStore();
  const [s, setS] = useState({ mode: 'quick', enc: 'default', kms: '', access: 'iam', idp: 'entra', storage: 'managed', bucket: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = k => v => setS(p => ({ ...p, [k]: v }));

  if (S.service) {
    return (
      <div className="stack" style={{ marginTop: 20 }}>
        <RegionNote />
        <h1>Enable web application</h1>
        <div className="container" style={{ borderRadius: 0 }}>
          <p>The web application is already enabled for this account, so encryption and user access can't be changed. <a href="#/service">Go to Service management</a>.</p>
          <p className="small muted" style={{ margin: '12px 0' }}>Prototype only: start over to walk through setup again, including identity options under Manual setup.</p>
          <button className="btn" onClick={() => openModal('reset')}>Start over</button>
        </div>
      </div>
    );
  }

  function enable() {
    const e = {};
    if (s.mode === 'manual') {
      if (s.enc === 'custom' && !KMS_RE.test(s.kms.trim())) e.kms = `Enter a KMS key ARN, for example arn:aws:kms:${REGION}:${ACCOUNT}:key/1234abcd-….`;
      if (s.storage === 's3' && !BUCKET_RE.test(s.bucket.trim())) e.bucket = BUCKET_ERR;
    }
    setErrors(e);
    if (Object.keys(e).length) { focusFirstError(); return; }
    setBusy(true);
    setTimeout(() => {
      const manual = s.mode === 'manual';
      commit(S => {
        S.service = {
          tenant: hex(16), profile: hex(12).toUpperCase(), createdAt: Date.now(),
          enc: manual ? s.enc : 'default', kms: s.kms.trim(),
          access: manual ? s.access : 'iam', idp: s.idp,
          storage: manual ? s.storage : 'managed', bucket: s.bucket.trim(),
        };
      });
      go('#/service', { type: 'success', text: 'Web application is ready. Share the URL with your team, and the CLI install command with developers.' });
    }, 1800);
  }

  const radio = (name, value, label, desc, extra) => (
    <Choice name={name} checked={s[name] === value} onChange={() => set(name)(value)} label={label} desc={desc}>{extra}</Choice>
  );

  return (
    <div className="stack" style={{ marginTop: 20 }}>
      <RegionNote />
      <h1>Enable web application</h1>
      <div className="mode-cards" style={{ margin: 0 }}>
        {[['quick', 'Quick start', 'Enable the web application in one click with default settings.'], ['manual', 'Manual setup', "Configure identity, encryption, and storage to match your organization's requirements."]].map(([m, t, d]) => (
          <label key={m} className={`mode-card ${s.mode === m ? 'selected' : ''}`}>
            <input type="radio" name="mode" checked={s.mode === m} onChange={() => set('mode')(m)} />
            <span><span style={{ fontSize: 16 }}>{t}</span><div className="small muted">{d}</div></span>
          </label>
        ))}
      </div>

      {s.mode === 'quick' ? (
        <div className="container">
          <h2 style={{ fontSize: 28, marginBottom: 8 }}>What's included</h2>
          <ul className="included">
            {[['IAM-only user access', "Use existing AWS credentials to access Transform - simpler to set up and suitable for teams that don't require SSO capabilities."],
              ['AWS managed encryption key', 'Your data is encrypted by default with a key that AWS owns and manages for you.'],
              ['AWS Transform managed storage', 'Let AWS Transform manage the data for you. Create connectors to import data when needed.']].map(([t, d]) => (
              <li key={t}><b><Icon n="ok" /> {t}</b><div className="muted" style={{ marginLeft: 22 }}>{d}</div></li>
            ))}
          </ul>
          <p>You can change storage settings later. <span style={{ color: 'var(--orange)' }}><Icon n="warn" s={14} /></span> Note: user access can't be changed after setup, and changing the encryption key may make existing data inaccessible.</p>
        </div>
      ) : (
        <>
          <div className="container">
            <h2>Encryption key <a href="#" className="small" onClick={e => e.preventDefault()}>Info</a></h2>
            <p style={{ margin: '4px 0 16px' }}>Your data is encrypted by default with a key that AWS owns and manages for you. To choose a different key, customize your encryption settings. Changing the encryption key affects existing transformations.</p>
            {radio('enc', 'default', 'Default AWS managed key', 'Your data is encrypted by default with a key that AWS owns and manages for you.')}
            {radio('enc', 'custom', 'Customize encryption settings', 'Use an AWS KMS key.',
              <Field id="kms" label="AWS KMS key ARN" error={errors.kms} hint="The key policy must allow AWS Transform to use the key." style={{ marginTop: 10 }}>
                <TextInput id="kms" invalid={errors.kms} placeholder={`arn:aws:kms:${REGION}:${ACCOUNT}:key/…`} value={s.kms} onChange={set('kms')} />
              </Field>)}
          </div>
          <div className="container">
            <h2>User access <a href="#" className="small" onClick={e => e.preventDefault()}>Info</a></h2>
            <p style={{ margin: '4px 0 16px' }}>Choose how you would like your organization to log in to AWS Transform.</p>
            <Alert type="warning" style={{ marginBottom: 16 }}>You will not be able to change user access type once you enable AWS Transform.</Alert>
            {radio('access', 'iam', <>IAM-only access – <b>recommended</b></>, "Use existing AWS credentials to access Transform. Users authenticate with their IAM roles or users. This option is simpler to set up and suitable for teams that don't require SSO capabilities.")}
            {radio('access', 'idc', 'AWS IAM Identity Center (IdC)', 'You can use an existing profile in IdC.',
              <div className="hint">Using the organization instance of IAM Identity Center in {REGION}. You assign users and groups after setup.</div>)}
            {radio('access', 'idp', 'Use my existing identity provider (IdP)', 'We currently support Microsoft Entra and Okta Workforce Identity.',
              <Field id="idp" label="Identity provider" hint="You'll exchange SAML metadata with your IdP after setup." style={{ marginTop: 10 }}>
                <Select id="idp" value={s.idp} onChange={set('idp')} options={[['entra', 'Microsoft Entra ID'], ['okta', 'Okta Workforce Identity']]} />
              </Field>)}
          </div>
          <div className="container">
            <h2>Storage</h2>
            <p style={{ margin: '4px 0 16px' }}>Choose where AWS Transform stores artifacts. You can change this later.</p>
            {radio('storage', 'managed', 'AWS Transform managed storage', 'Let AWS Transform manage the data for you. Create connectors to import data when needed.')}
            {radio('storage', 's3', 'My own Amazon S3 bucket', 'Store artifacts in a bucket in this account.',
              <Field id="bucket" label="S3 bucket name" error={errors.bucket} style={{ marginTop: 10 }}>
                <TextInput id="bucket" invalid={errors.bucket} placeholder="my-transform-artifacts" value={s.bucket} onChange={set('bucket')} />
              </Field>)}
          </div>
        </>
      )}

      <div className="wiz-actions">
        <a className="btn link" href="#/">Cancel</a>
        <button className="btn primary" onClick={enable} disabled={busy}>{busy ? <><Spinner /> Enabling…</> : 'Enable'}</button>
      </div>
    </div>
  );
}
