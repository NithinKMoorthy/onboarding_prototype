import { useEffect, useRef, useState } from 'react';
import { setUi, ui } from '../lib/store';
import { askSend } from '../lib/assistant';
import { Icon, Spinner } from '../components/ui';

const SUGGESTIONS = ['How do I connect GitHub?', 'Which analysis type should I run?', "Why can't I create a remediation?"];

export default function AskPanel({ offset }) {
  const [text, setText] = useState('');
  const scroller = useRef(null);
  const n = ui.msgs.length;
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [n, ui.msgs[n - 1]?.typing]);

  if (!ui.ask) {
    return (
      <aside className="ask collapsed">
        <button className="btn icon link" style={{ margin: '10px auto' }} onClick={() => setUi({ ask: true })} aria-label="Open Ask AWS Transform"><span className="sparkle" style={{ fontSize: 22 }}>✦</span></button>
      </aside>
    );
  }

  const send = () => { askSend(text); setText(''); };
  return (
    <aside className="ask" style={{ height: `calc(100vh - ${offset}px)` }}>
      <div className="ask-head">
        <b>Ask AWS Transform</b>
        <span className="row" style={{ gap: 4 }}>
          {n > 0 && <button className="btn link small" onClick={() => setUi({ msgs: [] })}>Clear</button>}
          <button className="copy" onClick={() => setUi({ ask: false })} aria-label="Collapse panel"><Icon n="right" /></button>
        </span>
      </div>
      <div className="ask-scroll" ref={scroller}>
        {n ? ui.msgs.map((m, i) => <div key={i} className={`msg ${m.who}`}>{m.typing ? <Spinner /> : m.text}</div>) : (
          <div className="ask-empty">
            <div className="sparkle">✦</div>
            <h3>Ask AWS Transform</h3>
            <p className="muted">Ask a question below to get started.</p>
            <div className="chips">{SUGGESTIONS.map(q => <button key={q} className="chip" onClick={() => askSend(q)}>{q}</button>)}</div>
          </div>
        )}
      </div>
      <div className="ask-input">
        <div className="ask-box">
          <textarea placeholder="Ask a question, enter @ to mention, or / for commands" aria-label="Ask a question" value={text}
            onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <div className="row">
            <span className="row" style={{ gap: 10 }}><Icon n="slash" s={18} /><Icon n="at" s={18} /></span>
            <button className="copy" onClick={send} aria-label="Send"><Icon n="send" s={18} /></button>
          </div>
        </div>
        <div className="disclaimer">AWS Transform uses generative AI. You may need to verify responses.</div>
      </div>
    </aside>
  );
}
