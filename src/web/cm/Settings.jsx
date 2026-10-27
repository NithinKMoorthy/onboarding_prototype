import { useState } from 'react';
import { commit, openModal, toast, useStore } from '../../lib/store';
import { ACCOUNT, REGION, STACKS, stackStatus } from '../../lib/domain';
import { fmtDT } from '../../lib/format';
import { Icon, Menu, SearchInput, Status } from '../../components/ui';

export default function Settings({ q }) {
  const S = useStore();
  const [how, setHow] = useState(q.get('how') === '1');
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState(null);

  const deployed = STACKS.filter(x => stackStatus(x.name) === 'Deployed').length;
  const term = search.toLowerCase();
  const list = STACKS.filter(x => !term || x.name.toLowerCase().includes(term) || x.type.toLowerCase().includes(term));
  const canUpdate = chosen && stackStatus(chosen) === 'Deployed';
  const undeployed = STACKS.filter(x => !S.infra[x.name]);
  const deploy = names => openModal('deploy', { stacks: names });

  function update() {
    commit(S => { Object.assign(S.infra[chosen], { startedAt: Date.now(), version: '1.4.3', op: 'update' }); });
    toast(`Updating ${chosen} to 1.4.3`);
  }

  return (
    <>
      <div className={`container expander ${how ? 'open' : ''}`} style={{ marginTop: 0, paddingTop: 16 }}>
        <button onClick={() => setHow(h => !h)} aria-expanded={how}><Icon n="right" /><span style={{ fontSize: 20 }}>How to provision infrastructure</span></button>
        {how && (
          <ol className="stack-s" style={{ margin: '14px 0 0', paddingLeft: 20, lineHeight: '22px' }}>
            <li><b>Decide where analysis runs.</b> AWS-managed infrastructure needs no setup. Deploy your own stacks only when source code must stay in your VPC, or to run remediations.</li>
            <li><b>Deploy the stacks.</b> Choose <i>Deploy infrastructure</i>. This launches AWS CloudFormation in account {ACCOUNT} ({REGION}). You can also use the CLI: <span className="mono">atx infra deploy --all --region {REGION}</span></li>
            <li><b>Remediation needs</b> <span className="mono">AtxInfrastructureStack</span> (Batch) and <span className="mono">AtxDispatcherStack</span>. Customer-owned analysis needs <span className="mono">atx-runner</span> (EC2) or <span className="mono">AtxInfrastructureStack</span>.</li>
            <li><b>Refresh</b> this table until the stacks show <i>Deployed</i>.</li>
          </ol>
        )}
      </div>

      <div className="container">
        <div className="spread">
          <h2>Infrastructure <span className="counter">({STACKS.length})</span></h2>
          <div className="row">
            <button className="btn icon" onClick={() => toast('Infrastructure status refreshed')} aria-label="Refresh"><Icon n="refresh" /></button>
            <button className="btn" disabled={!canUpdate} onClick={update}>Update infrastructure <Icon n="ext" s={14} /></button>
            <Menu className="btn primary" disabled={!undeployed.length} label={<>Deploy infrastructure <Icon n="down" s={14} /></>} items={[
              { label: `Deploy all stacks (${undeployed.length})`, onClick: () => deploy(undeployed.map(x => x.name)) },
              { label: 'Remediation stacks only', disabled: !!(S.infra.AtxInfrastructureStack && S.infra.AtxDispatcherStack), onClick: () => deploy(['AtxInfrastructureStack', 'AtxDispatcherStack']) },
              '-',
              ...STACKS.map(x => ({ label: x.name, disabled: !!S.infra[x.name], onClick: () => deploy([x.name]) })),
            ]} />
          </div>
        </div>
        <p style={{ margin: '6px 0 14px' }}>Deploy infrastructure in your account to run analysis within your VPC. Use this when you need data to stay in your network. You own and manage these resources. {deployed} of {STACKS.length} stack types deployed.</p>
        <div className="table-tools"><SearchInput value={search} onChange={setSearch} placeholder="Find infrastructure" width="600px" /></div>
        <table className="tbl">
          <thead><tr><th className="cb" /><th>CloudFormation stack name</th><th>Status</th><th>Version</th><th>Type</th><th>Deployed at</th></tr></thead>
          <tbody>
            {list.map(x => {
              const rec = S.infra[x.name], st = stackStatus(x.name), live = rec && st === 'Deployed';
              return (
                <tr key={x.name} className={`clickable ${chosen === x.name ? 'sel' : ''}`} onClick={() => setChosen(x.name)}>
                  <td className="cb"><input type="radio" name="stack" checked={chosen === x.name} onChange={() => setChosen(x.name)} aria-label={`Select ${x.name}`} /></td>
                  <td>{x.name}</td><td><Status s={st} /></td><td>{live ? rec.version : '-'}</td><td>{x.type}</td><td>{live ? fmtDT(rec.startedAt) : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
