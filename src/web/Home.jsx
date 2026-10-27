import { useState } from 'react';
import { toast } from '../lib/store';
import { askSend } from '../lib/assistant';
import { Icon } from '../components/ui';

const CARDS = [
  { href: '#/web/cm', icon: 'search', title: <>Continuous modernization <span className="new-tag">New</span></>, lines: ['Continuous application analysis and remediation'] },
  { icon: 'doc', title: 'Assess Apps', lines: ['Tech Debt Assessment'] },
  { icon: 'code', title: 'Modernize Windows Apps', lines: ['.NET', 'SQL Servers'] },
  { icon: 'grid', title: 'Modernize Mainframe Apps', color: 'red', lines: ['z/OS COBOL', 'z/OS PL/I'] },
  { icon: 'doc', title: 'Assess Infrastructure', color: 'green', lines: ['On-premises migration', 'TCO Analysis'] },
  { icon: 'cpu', title: 'Migrate workloads', color: 'green', lines: ['VMs (VMware, Hyper-V, KVM)', 'Physical Servers', 'Networks'] },
];

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const send = () => { askSend(prompt); setPrompt(''); };
  return (
    <div className="home">
      <div className="q">What do you want to do today?</div>
      <div className="prompt">
        <textarea placeholder="Tell me about your goals or ask any questions..." aria-label="Ask AWS Transform" value={prompt}
          onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <div className="spread"><span className="muted"><Icon n="slash" s={20} /></span><button className="btn icon link" onClick={send} aria-label="Send"><Icon n="send" s={20} /></button></div>
      </div>
      <p className="muted" style={{ textAlign: 'center', marginTop: 8 }}>AWS Transform uses generative AI. You may need to verify responses.</p>
      <div className="home-cards">
        {CARDS.map((c, i) => (
          <a key={i} className="home-card" href={c.href || '#'} onClick={c.href ? undefined : e => { e.preventDefault(); toast(`${typeof c.title === 'string' ? c.title : 'This'} isn't part of this prototype`); }}>
            <span className={`ico sm ${c.color || 'blue'}`} style={{ background: 'none' }}><Icon n={c.icon} s={26} /></span>
            <div><h3>{c.title}</h3><p>{c.lines.map((l, j) => <span key={j}>{l}<br /></span>)}</p></div>
          </a>
        ))}
      </div>
    </div>
  );
}
