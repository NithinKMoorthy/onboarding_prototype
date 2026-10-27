import { useEffect } from 'react';
import { emit, ui } from './lib/store';
import { useRoute } from './lib/router';
import { isBusy } from './lib/domain';
import ConsoleApp from './console/ConsoleApp';
import WebApp from './web/WebApp';
import Modals from './components/Modals';

export default function App() {
  const { parts } = useRoute();
  const isWeb = parts[0] === 'web';

  // Simulated work (analyses, remediations, stack deploys) is derived from timestamps; re-render each second while any is running.
  useEffect(() => {
    let wasBusy = false;
    const id = setInterval(() => { const b = isBusy(); if (b || wasBusy) { wasBusy = b; emit(); } }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { document.title = isWeb ? 'AWS Transform' : 'AWS Transform | AWS Console'; }, [isWeb]);

  return (
    <>
      {isWeb ? <WebApp parts={parts.slice(1)} /> : <ConsoleApp parts={parts} />}
      <Modals />
      {ui.toast && <div className="toast" role="status">{ui.toast}</div>}
    </>
  );
}
