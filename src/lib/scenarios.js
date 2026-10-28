import { defaults } from './store';
import { DAY, genRepos } from './domain';
import { hex } from './format';

/* Starting points for the Reset prototype dialog. */

const ANALYZED = ['OktaRemote', 'Customer_Story_Application', 'Okta-Feature-Matrix-', 'Continuous_Modernization', 'SashaAI', 'SashaFlaskAPI-'];

// Returning user: connected acme-platform a month ago, ran Tech debt (comprehensive) once on 6 repositories and never scheduled it.
export function returningState() {
  const S = defaults();
  const t0 = Date.now() - 28 * DAY;
  S.cmBannerX = S.homeBannerX = true;
  S.service = { tenant: hex(16), profile: hex(12).toUpperCase(), createdAt: t0 - 2 * DAY, enc: 'default', kms: '', access: 'iam', idp: '', storage: 'managed', bucket: '' };
  const repos = [
    ...genRepos(true).slice(0, 71),
    { name: 'payments-gateway', branch: 'main', vis: 'Private', addedAt: Date.now() - 9 * DAY },
    { name: 'loyalty-points', branch: 'main', vis: 'Private', addedAt: Date.now() - 3 * DAY },
  ];
  S.sources.push({ id: 'src-0001', name: 'acme-platform-github', provider: 'github', org: 'acme-platform', url: '', includePublic: true, branch: '', commit: '', author: '', email: '', repos, createdAt: t0 - DAY });
  S.analyses.push({ id: 'an-0002', name: 'tech-debt-comprehensive-acme-platform', type: 'comprehensive', def: null, sourceId: 'src-0001', repos: ANALYZED, infra: 'AWS managed', startedAt: t0, scheduleId: null });
  S.seq = 3;
  return S;
}
