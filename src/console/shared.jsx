import { setUi, ui } from '../lib/store';
import { Alert, Icon } from '../components/ui';

export const RegionNote = () => (
  <Alert type="info">AWS Transform may securely transmit data across AWS Regions within your geography for processing. For more information, access <a href="#" onClick={e => e.preventDefault()}>AWS Transform documentation <Icon n="ext" s={14} /></a>.</Alert>
);

export function ConsoleFlash({ style }) {
  if (!ui.flash) return null;
  return <Alert type={ui.flash.type} style={style} onDismiss={() => setUi({ flash: null })}>{ui.flash.text}</Alert>;
}
