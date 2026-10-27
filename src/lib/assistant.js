import { db, setUi, ui } from './store';
import { plural } from './format';
import { aDone, aStatus, allFindings, fTrans, isActive, remReady } from './domain';

// Canned, state-aware replies for the "Ask AWS Transform" panel.
export function botReply(q) {
  const S = db();
  const s = q.toLowerCase();
  const F = allFindings().filter(isActive);
  const running = S.analyses.filter(a => aStatus(a) === 'In progress');
  if (/github|gitlab|bitbucket|connect|source|token/.test(s)) return `To connect source code, open Run new analysis and fill in Connected source. Choose GitHub, GitLab, or Bitbucket, then paste a personal access token.\n\nGitHub tokens need the repo and read:org scopes. AWS Transform uses the token to list repositories and, for remediations, to push branches and open pull requests.\n\nYou have ${plural(S.sources.length, 'source')} connected.`;
  if (/remediat|pull request|\bpr\b/.test(s)) return remReady() ? 'Remediation infrastructure is ready. On the Findings tab, select open findings with an automated fix and choose Create remediation. AWS Transform opens one pull request per repository.' : 'Remediations run in your account, so they need AtxInfrastructureStack (Batch) and AtxDispatcherStack deployed. Go to Continuous modernization > Settings and choose Deploy infrastructure. Once both stacks show Deployed, Create remediation is enabled.';
  if (/which|type|quick|comprehensive|start/.test(s)) return 'Start with Tech debt (quick). It only reads package manifests and returns in minutes.\n\nRun Tech debt (comprehensive) when you want a code-level review, Security for CVEs and secrets, and Agentic readiness before you let AI agents work in a repository.';
  if (/infra|vpc|customer owned|stack/.test(s)) return 'AWS-managed infrastructure needs no setup. Choose Customer owned only when source code must stay in your VPC. You then deploy the CloudFormation stacks from Settings, and you own and pay for them.';
  if (/schedul|recurring|daily/.test(s)) return 'In step 2 of Run new analysis, choose Recurring, name the schedule, and pick Daily, Weekly, or Monthly. AWS-managed schedules need an execution role ARN that trusts transform.amazonaws.com.';
  if (/finding|debt|high|severity|summar/.test(s)) {
    if (!F.length) return running.length ? `${running[0].name} is still running (${aDone(running[0])} of ${running[0].repos.length} repos analyzed). Findings appear as each repository completes.` : 'No findings yet. Run an analysis to discover tech debt.';
    const hi = F.filter(f => f.sev === 'High');
    const byRepo = {};
    F.forEach(f => { byRepo[f.repo] = (byRepo[f.repo] || 0) + 1; });
    const top = Object.entries(byRepo).sort((a, b) => b[1] - a[1])[0];
    return `You have ${plural(F.length, 'open finding')}, ${hi.length} of them high severity. ${top[0]} has the most (${top[1]}).${hi[0] ? `\n\nStart with "${hi[0].title}" in ${hi[0].repo}. Its suggested fix is ${fTrans(hi[0])}.` : ''}`;
  }
  return 'I can help with connecting sources, choosing an analysis type, reading findings, scheduling analyses, and setting up remediation infrastructure. What are you working on?';
}

export function askSend(q) {
  q = (q || '').trim();
  if (!q) return;
  setUi({ ask: true, msgs: [...ui.msgs, { who: 'user', text: q }, { who: 'bot', typing: true }] });
  setTimeout(() => setUi({ msgs: [...ui.msgs.slice(0, -1), { who: 'bot', text: botReply(q) }] }), 700);
}
