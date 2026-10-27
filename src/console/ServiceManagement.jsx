import { openModal, useStore } from '../lib/store';
import { useRoute } from '../lib/router';
import { ACCOUNT, REGION } from '../lib/domain';
import { fmtDT } from '../lib/format';
import { CopyButton, Icon, Status } from '../components/ui';
import { ConsoleFlash, RegionNote } from './shared';

const CLI = 'curl -fsSL https://transform-cli.awsstatic.com/install.sh | bash';

export default function ServiceManagement() {
  const S = useStore();
  const { q } = useRoute();
  const v = S.service;

  if (!v) {
    return (
      <div className="stack">
        <RegionNote />
        <ConsoleFlash />
        <h1>Service management</h1>
        <div className="container" style={{ borderRadius: 0 }}>
          <div className="empty"><b>No AWS Transform service</b>Enable the web application to create a service in this account.
            <div style={{ marginTop: 14 }}><a className="btn primary" href="#/enable">Enable web application</a></div>
          </div>
        </div>
      </div>
    );
  }

  const tab = q.get('tab') || 'users';
  const accessName = { iam: 'IAM-only access', idc: 'AWS IAM Identity Center', idp: v.idp === 'okta' ? 'Okta Workforce Identity' : 'Microsoft Entra ID' }[v.access];
  const url = `https://${v.tenant}.transform.${REGION}.on.aws/signin/`;
  const arn = `arn:aws:transform:${REGION}:${ACCOUNT}:profile/${v.profile}`;

  return (
    <div className="stack">
      <RegionNote />
      <ConsoleFlash />
      <h1>Service management</h1>
      <div className="container">
        <div className="spread" style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 24 }}>Your AWS Transform service</h2>
          <button className="btn" onClick={() => openModal('deleteService')}>Delete</button>
        </div>
        <dl className="kv">
          <div><dt>Web application URL (with {{ iam: 'IAM', idc: 'IdC', idp: 'IdP' }[v.access]})</dt><dd><CopyButton text={url} /><a href="#/web" title="Opens the prototype web app">{url}</a></dd></div>
          <div><dt>CLI install command <a href="#" style={{ fontWeight: 400 }} onClick={e => { e.preventDefault(); openModal('cli'); }}>View install instruction <Icon n="ext" s={14} /></a></dt><dd><CopyButton text={CLI} /><span className="mono">{CLI}</span></dd></div>
          <div><dt>Service profile ARN</dt><dd><CopyButton text={arn} />{arn}</dd></div>
          <div><dt>Tenant ID</dt><dd><CopyButton text={v.tenant} />{v.tenant}</dd></div>
        </dl>
      </div>

      <nav className="tabs">
        <a href="#/service?tab=users" className={tab === 'users' ? 'active' : ''}>Users</a>
        <a href="#/service?tab=settings" className={tab === 'settings' ? 'active' : ''}>Settings</a>
      </nav>

      {tab === 'users' ? (
        <div className="container">
          <h2 style={{ fontSize: 24, marginBottom: 14 }}>User access</h2>
          <dl className="kv">
            <div><dt>Access model</dt><dd>{accessName}</dd></div>
            <div><dt>{v.access === 'iam' ? 'IAM access' : 'Status'}</dt><dd>{v.access === 'iam' ? <Status s="Enabled" /> : <Status cls="warn" icon="warn">Action required: assign users</Status>}</dd></div>
          </dl>
          <p className="muted" style={{ marginTop: 8 }}>
            {v.access === 'iam'
              ? <>Anyone with IAM permissions for <span className="mono">transform:*</span> in this account can sign in with the URL above.</>
              : `Assign users and groups from ${v.access === 'idc' ? 'IAM Identity Center' : 'your identity provider'} before sharing the URL.`}
          </p>
        </div>
      ) : (
        <div className="container">
          <div className="spread" style={{ marginBottom: 14 }}>
            <h2 style={{ fontSize: 24 }}>Settings</h2>
            <button className="btn" onClick={() => openModal('storage')}>Edit storage</button>
          </div>
          <dl className="kv">
            <div><dt>Encryption key</dt><dd>{v.enc === 'custom' ? <span className="mono">{v.kms}</span> : 'AWS managed key'}</dd></div>
            <div><dt>Storage</dt><dd>{v.storage === 's3' ? <>Amazon S3 bucket <span className="mono">{v.bucket}</span></> : 'AWS Transform managed storage'}</dd></div>
            <div><dt>Region</dt><dd>US East (N. Virginia) {REGION}</dd></div>
            <div><dt>Created</dt><dd>{fmtDT(v.createdAt)}</dd></div>
          </dl>
        </div>
      )}
    </div>
  );
}
