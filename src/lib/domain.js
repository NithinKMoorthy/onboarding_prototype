import { db, getVersion } from './store';
import { hash, rng, pick } from './format';

export const ACCOUNT = '780601577939';
export const REGION = 'us-east-1';
export const USER_ARN = `arn:aws:sts::${ACCOUNT}:assumed-role/Admin/nkmoorth-Isengard`;

const now = () => Date.now();

/* ---------- catalog ---------- */
export const TYPES = [
  { id: 'quick', name: 'Tech debt (quick)', icon: 'timer', ico: 'orange', desc: 'Scans package manifests to identify outdated dependencies and stale versions, returning results in minutes.' },
  { id: 'comprehensive', name: 'Tech debt (comprehensive)', icon: 'chart', ico: 'blue', desc: 'Performs a deep, code-level review of your repositories to surface technical debt across dependencies, code quality, architecture, performance, and infrastructure.' },
  { id: 'security', name: 'Security', icon: 'shield', ico: 'red', desc: 'Detects CVEs, exposed secrets, and insecure configurations in your source code and dependencies, using the AWS Security Agent.' },
  { id: 'agentic', name: 'Agentic readiness', icon: 'bot', ico: 'purple', desc: 'Assesses how ready your repositories are for AI agents to work in, evaluating API design, authentication patterns, and documentation across a defined set of criteria.' },
  { id: 'modernization', name: 'Modernization readiness', icon: 'trend', ico: 'green', desc: 'Evaluates your applications for containerization, serverless migration, and platform-upgrade opportunities.' },
  { id: 'custom', name: 'Custom', icon: 'term', ico: 'violet', desc: 'Runs a transformation definition of your choice as an analysis, including organization-specific policies your platform team maintains.' },
];
export const typeName = id => (TYPES.find(t => t.id === id) || {}).name || id;
export const CUSTOM_DEFS = ['org/logging-policy', 'org/codeowners-required', 'org/approved-licenses'];
export const TRANSFORMS = ['AWS/dependency-upgrade', 'AWS/java-version-upgrade', 'AWS/nodejs-version-upgrade', 'AWS/python-version-upgrade', 'AWS/go-version-upgrade', 'AWS/sdk-migration', 'AWS/api-migration', 'AWS/secrets-remediation', 'AWS/config-hardening', 'AWS/containerize', 'AWS/docs-generation', 'Manual'];

export const PROVIDERS = {
  github: { name: 'GitHub', desc: 'Repositories in a GitHub organization or user at github.com.', short: 'An organization or user on github.com.', org: 'Organization', orgPh: 'my-org', scopes: ['repo', 'read:org'], url: null,
    scopeWhy: [['read:org', 'lists the repositories in your organization.'], ['repo', 'reads code for analysis, and opens pull requests only for remediations you start.']] },
  gitlab: { name: 'GitLab', desc: 'Repositories in a GitLab group or user, on GitLab.com or a self-managed instance.', short: 'A group or user on GitLab.com or self-managed.', org: 'Group', orgPh: 'my-group', scopes: ['read_api', 'write_repository'], url: 'GitLab URL',
    scopeWhy: [['read_api', 'lists the projects in your group.'], ['write_repository', 'reads code for analysis, and pushes branches only for remediations you start.']] },
  bitbucket: { name: 'Bitbucket', desc: 'Repositories in a Bitbucket Cloud workspace, or a Data Center project on a self-managed instance.', short: 'A Cloud workspace or Data Center project.', org: 'Workspace or project', orgPh: 'my-workspace', scopes: ['repository:write', 'pullrequest:write'], url: 'Server URL - optional',
    scopeWhy: [['repository:write', 'reads code for analysis, and pushes branches only for remediations you start.'], ['pullrequest:write', 'opens pull requests only for remediations you start.']] },
};
export function providerHost(src) {
  if (src.provider === 'github') return 'github.com';
  if (src.url) return src.url.replace(/^https:\/\//, '').replace(/\/$/, '');
  return src.provider === 'gitlab' ? 'gitlab.com' : 'bitbucket.org';
}

// Per-analysis copy used by the Get started flow.
export const ANALYSIS_META = {
  quick: { short: 'quick scan', freq: 'Weekly', why: 'Fast and low cost. Catches newly outdated dependencies.' },
  comprehensive: { short: 'comprehensive', freq: 'Monthly', why: 'A deeper review. Code quality and architecture change more slowly.',
    learn: 'What upgrading involves in the code, across dependencies, code quality, architecture, performance and infrastructure.', get: 'Code-level tech debt findings for each repository' },
  modernization: { short: 'modernization', freq: 'Monthly', why: 'Opportunities shift as remediations merge and repositories change.',
    learn: 'Which of them can also move to containers, serverless or a newer platform, so you modernize once instead of upgrading twice.', get: 'Modernization readiness for each repository' },
  agentic: { short: 'agentic', freq: 'Monthly', why: 'Tracks readiness as APIs, authentication and documentation improve.',
    learn: 'How well agents can work in each repository, based on API design, authentication patterns and documentation, so you know where remediation will go smoothly.', get: 'Agentic readiness for each repository' },
  security: { short: 'security', freq: 'Weekly', why: 'New CVEs are published every day, so weekly keeps exposure windows short.', get: 'Security findings: CVEs, exposed secrets and insecure configuration' },
  custom: { short: 'custom', freq: 'Monthly', why: "Re-checks your organization's policies as code changes.", get: 'Policy findings from your transformation definition' },
};

const BASE_REPOS = ['Careeer_Repo', 'Continuous_Modernization', 'Curate', 'Customer_Story_Application', 'Okta-Feature-Matrix-', 'OktaRemote', 'SashaAI', 'SashaExpress', 'SashaFlaskAPI-', 'SashaMobile'];
const PREFIX = ['payments', 'orders', 'catalog', 'search', 'identity', 'notifications', 'reporting', 'shipping', 'pricing'];
const SUFFIX = ['api', 'service', 'web', 'worker', 'lambda', 'infra', 'sdk'];
export function genRepos(includePublic) {
  const list = BASE_REPOS.map(n => ({ name: n, branch: n === 'OktaRemote' ? 'trunk' : 'main', vis: 'Private' }));
  PREFIX.forEach(p => SUFFIX.forEach(s => list.push({ name: `${p}-${s}`, branch: s === 'infra' ? 'develop' : 'main', vis: s === 'sdk' ? 'Public' : 'Private' })));
  return includePublic ? list : list.filter(r => r.vis === 'Private');
}

const LANG = {
  Java: { file: 'pom.xml', src: 'src/main/java/com/example/App.java', runtime: ['Java 8', 'Java 21'], trans: 'AWS/java-version-upgrade',
    deps: [['spring-core', '5.2.9', '6.1.14'], ['jackson-databind', '2.9.10', '2.17.2'], ['guava', '20.0', '33.3.1-jre'], ['junit', '4.12', '5.11.3'], ['commons-text', '1.9', '1.12.0']],
    api: ['javax.servlet → jakarta.servlet', 'java.util.Date → java.time', 'new Integer() constructor'],
    cve: [['CVE-2022-42889', 'commons-text'], ['CVE-2020-36518', 'jackson-databind'], ['CVE-2023-20863', 'spring-expression']],
    platform: 'Spring Boot 2.7 → 3.3 upgrade available' },
  'Node.js': { file: 'package.json', src: 'src/server.js', runtime: ['Node.js 14', 'Node.js 22'], trans: 'AWS/nodejs-version-upgrade',
    deps: [['lodash', '4.17.15', '4.17.21'], ['express', '4.16.0', '4.21.1'], ['axios', '0.21.1', '1.7.7'], ['moment', '2.24.0', '2.30.1'], ['jsonwebtoken', '8.5.1', '9.0.2']],
    api: ['new Buffer() → Buffer.from()', 'url.parse() → new URL()', 'request → fetch'],
    cve: [['CVE-2021-23337', 'lodash'], ['CVE-2022-23529', 'jsonwebtoken'], ['CVE-2023-45857', 'axios']],
    platform: 'Express 4 → 5 upgrade available' },
  Python: { file: 'requirements.txt', src: 'app/main.py', runtime: ['Python 3.7', 'Python 3.12'], trans: 'AWS/python-version-upgrade',
    deps: [['requests', '2.22.0', '2.32.3'], ['flask', '1.1.2', '3.0.3'], ['urllib3', '1.25.8', '2.2.3'], ['pyyaml', '5.1', '6.0.2'], ['boto3', '1.9.0', '1.35.49']],
    api: ['asyncio.get_event_loop()', 'distutils → setuptools', 'datetime.utcnow()'],
    cve: [['CVE-2023-32681', 'requests'], ['CVE-2020-14343', 'pyyaml'], ['CVE-2023-43804', 'urllib3']],
    platform: 'Flask 1.x → 3.x upgrade available' },
  Go: { file: 'go.mod', src: 'cmd/server/main.go', runtime: ['Go 1.19', 'Go 1.23'], trans: 'AWS/go-version-upgrade',
    deps: [['golang.org/x/net', 'v0.7.0', 'v0.30.0'], ['github.com/gin-gonic/gin', 'v1.6.3', 'v1.10.0'], ['github.com/aws/aws-sdk-go', 'v1.44.0', 'aws-sdk-go-v2 v1.32.2'], ['google.golang.org/grpc', 'v1.50.0', 'v1.67.1'], ['github.com/stretchr/testify', 'v1.7.0', 'v1.9.0']],
    api: ['ioutil.ReadFile → os.ReadFile', 'rand.Seed()', 'strings.Title()'],
    cve: [['CVE-2023-39325', 'golang.org/x/net'], ['CVE-2023-44487', 'google.golang.org/grpc'], ['CVE-2023-29401', 'gin']],
    platform: 'Gin 1.6 → 1.10 upgrade available' },
};
const LANG_WEIGHTS = [['Java', 0.5], ['Node.js', 0.31], ['Python', 0.14], ['Go', 0.05]];
export function langOf(repo) {
  if (/flask|ai$|python/i.test(repo)) return 'Python';
  if (/express|mobile|web|okta/i.test(repo)) return 'Node.js';
  const x = (hash('lang|' + repo) % 1000) / 1000;
  let acc = 0;
  for (const [lang, w] of LANG_WEIGHTS) { acc += w; if (x < acc) return lang; }
  return 'Go';
}

/* ---------- repository profile: what a manifest scan "sees" in each repo ---------- */
const EOS_RUNTIME = { Java: 'Java 8', 'Node.js': 'Node.js 14', Python: 'Python 3.7', Go: null };
export function repoProfile(name) {
  const r = rng('profile|' + name);
  const lang = langOf(name);
  const eos = r() < ({ Java: 0.85, 'Node.js': 0.85, Python: 0.8, Go: 0 }[lang]);
  return {
    name, lang, eos, runtime: eos ? EOS_RUNTIME[lang] : null,
    sdkV1: lang === 'Java' && r() < 0.65,
    spring27: lang === 'Java' && r() < 0.45,
    deps: 1 + Math.floor(r() * 5),
    shared: /-sdk$|common|shared|lib/i.test(name) || r() < 0.1,
  };
}

const LANG_LABEL = { Java: 'Java', 'Node.js': 'TypeScript / JavaScript', Python: 'Python', Go: 'Go' };
export function estate(repoNames) {
  const P = repoNames.map(repoProfile);
  const shared = P.filter(p => p.shared);
  const count = fn => P.filter(fn).length;
  const exposures = [
    ['Java 8 runtime', 'Runtime', p => p.runtime === 'Java 8'],
    ['AWS SDK for Java v1', 'Library', p => p.sdkV1],
    ['Node.js 14', 'Runtime', p => p.runtime === 'Node.js 14'],
    ['Spring Boot 2.7', 'Framework', p => p.spring27],
    ['Python 3.7', 'Runtime', p => p.runtime === 'Python 3.7'],
  ].map(([name, type, fn]) => ({ name, type, repos: count(fn), shared: shared.filter(fn).length })).filter(x => x.repos).sort((a, b) => b.repos - a.repos);
  const langs = Object.keys(LANG_LABEL).map(l => ({ lang: l, label: LANG_LABEL[l], count: count(p => p.lang === l), eos: count(p => p.lang === l && p.eos), runtime: EOS_RUNTIME[l] })).filter(x => x.count);
  const eos = count(p => p.eos);
  return {
    repos: P.length, deps: P.reduce((n, p) => n + p.deps, 0), eos, eosPct: P.length ? Math.round(eos / P.length * 100) : 0,
    shared: shared.length, sharedEos: shared.filter(p => p.eos).length,
    java8: count(p => p.runtime === 'Java 8'), spring27: count(p => p.spring27),
    exposures, langs,
  };
}

const sevR = r => { const x = r(); return x < 0.25 ? 'High' : x < 0.65 ? 'Medium' : 'Low'; };
const depFinding = (L, d, sev) => ({ title: `Outdated dependency: ${d[0]} ${d[1]} → ${d[2]}`, sev, fix: 'Automated', trans: 'AWS/dependency-upgrade', file: L.file, desc: `${d[0]} ${d[1]} is behind the latest supported release (${d[2]}). Older versions miss bug fixes and may block runtime upgrades.`, rec: `Upgrade ${d[0]} to ${d[2]} and run the test suite.` });
const T = {
  dep: (L, r) => depFinding(L, pick(r, L.deps), sevR(r)),
  runtime: (L, r, repo) => !repoProfile(repo).eos ? null : ({ title: `${L.runtime[0]} runtime is end of life`, sev: 'High', fix: 'Automated', trans: L.trans, file: L.file, desc: `${L.runtime[0]} no longer receives security patches from its maintainers.`, rec: `Upgrade the runtime to ${L.runtime[1]}. AWS Transform updates build files, APIs, and dependencies that change between versions.` }),
  api: (L, r) => { const a = pick(r, L.api); return { title: `Deprecated API usage: ${a}`, sev: 'Medium', fix: 'Automated', trans: 'AWS/api-migration', file: L.src, desc: `The code calls an API that is deprecated and scheduled for removal: ${a}.`, rec: 'Migrate call sites to the supported replacement.' }; },
  dup: L => ({ title: 'Duplicated code blocks across modules', sev: 'Low', fix: 'Manual', trans: 'Manual', file: L.src, desc: 'Several functions share near-identical logic, which increases maintenance cost.', rec: 'Extract the shared logic into a common module.' }),
  sync: L => ({ title: 'Blocking I/O in request path', sev: 'Medium', fix: 'Manual', trans: 'Manual', file: L.src, desc: 'Synchronous file and network calls run on the request thread and limit throughput.', rec: 'Move the calls to async APIs or a background worker.' }),
  config: L => ({ title: 'Hard-coded configuration values', sev: 'Low', fix: 'Automated', trans: 'AWS/config-hardening', file: L.src, desc: 'Endpoints and timeouts are hard-coded instead of read from configuration.', rec: 'Externalize values to environment variables or AWS AppConfig.' }),
  tests: L => ({ title: 'Low unit test coverage (< 30%)', sev: 'Low', fix: 'Manual', trans: 'Manual', file: L.src, desc: 'Core modules have little automated test coverage, which makes upgrades risky.', rec: 'Add tests for the modules flagged in the report before large upgrades.' }),
  cve: (L, r) => { const c = pick(r, L.cve); return { title: `${c[0]} in ${c[1]}`, sev: 'High', fix: 'Automated', trans: 'AWS/dependency-upgrade', file: L.file, desc: `A known vulnerability (${c[0]}) affects the version of ${c[1]} in use.`, rec: `Upgrade ${c[1]} to a patched version.` }; },
  secret: L => ({ title: 'Exposed secret: AWS access key in source', sev: 'High', fix: 'Automated', trans: 'AWS/secrets-remediation', file: L.src, desc: 'A string matching an AWS access key ID was found in committed source.', rec: 'Rotate the key, then move the value to AWS Secrets Manager.' }),
  tls: L => ({ title: 'Insecure TLS configuration (TLS 1.0 allowed)', sev: 'Medium', fix: 'Automated', trans: 'AWS/config-hardening', file: L.src, desc: 'The HTTP client accepts TLS 1.0 and 1.1.', rec: 'Require TLS 1.2 or later.' }),
  cors: L => ({ title: 'Overly permissive CORS policy (*)', sev: 'Medium', fix: 'Automated', trans: 'AWS/config-hardening', file: L.src, desc: 'The server allows any origin to make credentialed requests.', rec: 'Restrict allowed origins to known domains.' }),
  openapi: L => ({ title: 'No OpenAPI specification for HTTP endpoints', sev: 'Medium', fix: 'Automated', trans: 'AWS/docs-generation', file: L.src, desc: 'Agents cannot discover the API surface without a machine-readable spec.', rec: 'Generate and commit an OpenAPI 3 specification.' }),
  auth: L => ({ title: 'Static long-lived API tokens used for auth', sev: 'High', fix: 'Manual', trans: 'Manual', file: L.src, desc: 'Endpoints authenticate with shared static tokens, which agents cannot scope or rotate safely.', rec: 'Adopt short-lived, scoped credentials such as OAuth 2.0 or SigV4.' }),
  docs: () => ({ title: 'Missing README and contributor documentation', sev: 'Low', fix: 'Automated', trans: 'AWS/docs-generation', file: 'README.md', desc: 'The repository lacks build, test, and architecture documentation.', rec: 'Generate a README with build and test instructions.' }),
  errors: L => ({ title: 'Inconsistent error response format', sev: 'Low', fix: 'Manual', trans: 'Manual', file: L.src, desc: 'Endpoints return errors in at least three different shapes.', rec: 'Standardize on a single error schema.' }),
  docker: L => ({ title: 'Containerization candidate: no Dockerfile', sev: 'Low', fix: 'Automated', trans: 'AWS/containerize', file: L.file, desc: 'The application is stateless and suitable for containers, but has no container definition.', rec: 'Generate a Dockerfile and an Amazon ECS task definition.' }),
  serverless: L => ({ title: 'Serverless candidate: stateless request handlers', sev: 'Low', fix: 'Manual', trans: 'Manual', file: L.src, desc: 'Handlers are short-lived and stateless, a good fit for AWS Lambda.', rec: 'Evaluate moving handlers to Lambda behind API Gateway.' }),
  platform: L => ({ title: L.platform, sev: 'Medium', fix: 'Automated', trans: L.trans, file: L.file, desc: 'A newer major version of the application framework is available.', rec: 'Upgrade the framework; AWS Transform handles API changes between versions.' }),
  policyLog: L => ({ title: 'Policy: logging library not on approved list', sev: 'Medium', fix: 'Automated', trans: 'AWS/dependency-upgrade', file: L.file, desc: 'Your platform team requires the approved structured logging library.', rec: 'Replace the logging library with the approved one.' }),
  policyOwners: () => ({ title: 'Policy: CODEOWNERS file missing', sev: 'Low', fix: 'Automated', trans: 'AWS/docs-generation', file: 'CODEOWNERS', desc: 'Every repository must declare code owners.', rec: 'Add a CODEOWNERS file.' }),
  policyLic: L => ({ title: 'Policy: dependency with unapproved license (GPL-3.0)', sev: 'Medium', fix: 'Manual', trans: 'Manual', file: L.file, desc: 'A dependency uses a license that is not on the approved list.', rec: 'Replace the dependency or request a license exception.' }),
};
const BY_TYPE = { quick: ['dep', 'dep', 'dep', 'runtime'], comprehensive: ['dep', 'dep', 'runtime', 'api', 'dup', 'sync', 'config', 'tests'], security: ['cve', 'cve', 'secret', 'tls', 'cors'], agentic: ['openapi', 'auth', 'docs', 'errors'], modernization: ['docker', 'serverless', 'platform', 'runtime'], custom: ['policyLog', 'policyOwners', 'policyLic'] };
const COUNT = { quick: [1, 3], comprehensive: [2, 6], security: [0, 3], agentic: [1, 3], modernization: [1, 3], custom: [0, 2] };

function shuffle(arr, r) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// The quick scan reports exactly what the repo profile contains, so the Get started estate numbers match the findings.
function quickFindings(repo) {
  const p = repoProfile(repo), L = LANG[p.lang], r = rng('quick|' + repo);
  const out = shuffle(L.deps, r).slice(0, p.deps).map(d => depFinding(L, d, sevR(r)));
  if (p.eos) out.push(T.runtime(L, r, repo));
  if (p.sdkV1) out.push({ title: 'AWS SDK for Java v1 is end of support', sev: 'High', fix: 'Automated', trans: 'AWS/sdk-migration', file: L.file, desc: 'AWS SDK for Java 1.x reached end of support and no longer receives updates.', rec: 'Migrate to AWS SDK for Java 2.x.' });
  if (p.spring27) out.push({ title: 'Spring Boot 2.7 is end of support', sev: 'High', fix: 'Automated', trans: 'AWS/java-version-upgrade', file: L.file, desc: 'Spring Boot 2.7 no longer receives open-source security fixes.', rec: 'Upgrade to Spring Boot 3.3 together with the Java 21 upgrade.' });
  return out;
}

function genFindings(a, repo, at) {
  if (a.type === 'quick') return quickFindings(repo).map(f => ({ ...f, key: `${repo}|${f.title}`, repo, aId: a.id, type: a.type, at, line: 1 }));
  const r = rng(a.type + '|' + repo);
  const L = LANG[langOf(repo)];
  const [mn, mx] = COUNT[a.type];
  const n = mn + Math.floor(r() * (mx - mn + 1));
  const out = [], seen = new Set();
  for (let g = 0; out.length < n && g < 30; g++) {
    const f = T[pick(r, BY_TYPE[a.type])](L, r, repo);
    if (!f || seen.has(f.title)) continue;
    seen.add(f.title);
    out.push({ ...f, key: `${repo}|${f.title}`, repo, aId: a.id, type: a.type, at, line: 10 + Math.floor(r() * 300) });
  }
  return out;
}

/* ---------- analysis simulation (derived from timestamps, so it survives reloads) ---------- */
export function timeline(a, i) {
  const r = rng(a.id + a.repos[i]);
  if (a.fast) { const start = a.startedAt + i * 120; return { start, end: start + 1500 + r() * 2500 }; }
  const speed = a.type === 'quick' ? 0.35 : 1;
  const start = a.startedAt + i * 2500 * speed;
  return { start, end: start + (7000 + r() * 7000) * speed };
}
export function repoStatus(a, i, t = now()) {
  const { start, end } = timeline(a, i);
  if (a.stoppedAt && a.stoppedAt < end) return 'Stopped';
  if (t < start) return 'Pending';
  if (t < end) return 'In progress';
  return 'Completed';
}
export const repoStates = a => a.repos.map((_, i) => repoStatus(a, i));
export function aStatus(a) {
  const st = repoStates(a);
  if (st.every(s => s === 'Completed')) return 'Completed';
  if (st.includes('Stopped')) return 'Stopped';
  return 'In progress';
}
export const aEnd = a => a.stoppedAt || Math.max(...a.repos.map((_, i) => timeline(a, i).end));
export const aDone = a => repoStates(a).filter(s => s === 'Completed').length;
export const aFindings = a => a.repos.flatMap((repo, i) => repoStatus(a, i) === 'Completed' ? genFindings(a, repo, timeline(a, i).end) : []);

export function createAnalysis(S, id, w, src, scheduleId) {
  const a = {
    id,
    name: w.name.trim() || `${typeName(w.type).replace(/[()]/g, '')} ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    type: w.type, def: w.type === 'custom' ? w.def : null, sourceId: src.id,
    repos: src.repos.filter(r => w.selected.includes(r.name)).map(r => r.name),
    infra: w.infra === 'managed' ? 'AWS managed' : w.stack,
    startedAt: now(), scheduleId: scheduleId || null,
  };
  S.analyses.push(a);
  return a;
}

/* ---------- findings ---------- */
export const sevRank = s => ({ High: 0, Medium: 1, Low: 2 }[s]);
let cache = { key: null, val: [] };
// Latest result per repo+title across all analyses. Cached per store version and second.
export function allFindings() {
  const key = `${getVersion()}:${Math.floor(now() / 1000)}`;
  if (cache.key === key) return cache.val;
  const m = new Map();
  for (const a of db().analyses) for (const f of aFindings(a)) { const prev = m.get(f.key); if (!prev || prev.at < f.at) m.set(f.key, f); }
  const val = [...m.values()].sort((x, y) => y.at - x.at || sevRank(x.sev) - sevRank(y.sev));
  cache = { key, val };
  return val;
}
export const fTrans = f => db().ftrans[f.key] || f.trans;
export function remStatus(r) {
  if (r.cancelled) return 'Cancelled';
  return now() - r.createdAt < 10000 + r.repos.length * 1500 ? 'In progress' : 'Completed';
}
export function fStatus(f) {
  const S = db();
  if (S.fstate[f.key] === 'Dismissed') return 'Dismissed';
  const r = S.remediations.find(x => !x.cancelled && x.findingIds.includes(f.key));
  if (r) return remStatus(r) === 'Completed' ? 'Remediated' : 'In remediation';
  return 'Open';
}
export const isActive = f => ['Open', 'In remediation'].includes(fStatus(f));

/* ---------- customer-owned infrastructure ---------- */
export const STACKS = [
  { name: 'atx-runner', type: 'EC2' },
  { name: 'atx-scheduler', type: 'Scheduler' },
  { name: 'AtxDispatcherStack', type: 'Dispatcher' },
  { name: 'AtxInfrastructureStack', type: 'Batch' },
  { name: 'AtxSecurityAgentStack-us-east-1', type: 'Security agent' },
];
export function stackStatus(name) {
  const rec = db().infra[name];
  if (!rec) return 'Not deployed';
  if (now() - rec.startedAt < 6000) return rec.op === 'update' ? 'Updating' : 'Deploying';
  return 'Deployed';
}
export const remReady = () => stackStatus('AtxInfrastructureStack') === 'Deployed' && stackStatus('AtxDispatcherStack') === 'Deployed';
export const runStacks = () => STACKS.filter(s => ['EC2', 'Batch'].includes(s.type) && stackStatus(s.name) === 'Deployed');

export function isBusy() {
  const S = db();
  return S.analyses.some(a => aStatus(a) === 'In progress')
    || S.remediations.some(r => remStatus(r) === 'In progress')
    || STACKS.some(s => /ing$/.test(stackStatus(s.name)));
}

export const srcName = id => (db().sources.find(s => s.id === id) || {}).name || '(removed)';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function nextWeekday(day, time) {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  const diff = (DAYS.indexOf(day) - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + (diff === 0 && d.getTime() <= now() ? 7 : diff));
  return d.getTime();
}

export function nextRun(x) {
  const d = new Date(x.startAt || x.createdAt);
  const step = { Daily: 1, Weekly: 7, Monthly: 30 }[x.frequency];
  while (d.getTime() <= now()) d.setDate(d.getDate() + step);
  return d.getTime();
}
