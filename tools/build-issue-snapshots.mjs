#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const out = argValue('--out', join(root, '.site-publish'));
const githubApi = envValue('GITHUB_API_URL', 'https://api.github.com').replace(/\/+$/u, '');
const githubServer = envValue('GITHUB_SERVER_URL', 'https://github.com').replace(/\/+$/u, '');
const token = envValue('GITHUB_TOKEN') || envValue('GH_TOKEN');

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] || fallback);
}

function envValue(name, fallback = '') {
  return String(process.env[name] || fallback || '').trim();
}

function envInt(name, fallback) {
  const parsed = Number(envValue(name));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function envList(name) {
  const raw = envValue(name);
  if (!raw) return [];
  return raw.split(/[\n,]+/u).map((item) => item.trim()).filter(Boolean);
}

function enabledEnv(name, fallback = true) {
  const raw = envValue(name);
  if (!raw) return fallback;
  return !/^(0|false|no|off|disabled)$/iu.test(raw);
}

function normalizeRepo(value) {
  const raw = String(value || '').trim().replace(/^https?:\/\/github\.com\//iu, '').replace(/\.git$/iu, '').replace(/^\/+|\/+$/gu, '');
  const match = raw.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/u);
  if (!match) throw new Error(`Invalid issue snapshot repository: ${value}`);
  return `${match[1]}/${match[2]}`;
}

function snapshotRepos() {
  if (!enabledEnv('TIINEX_ISSUE_SNAPSHOTS', true)) return [];
  const configured = envList('TIINEX_ISSUE_SNAPSHOT_REPOSITORIES');
  const base = configured.length ? configured : [envValue('GITHUB_REPOSITORY')].filter(Boolean);
  return Array.from(new Set(base.map(normalizeRepo)));
}

function relSafe(value) {
  const rel = String(value || '').replace(/^\/+|\/+$/gu, '');
  if (!rel || rel.split('/').includes('..') || rel.includes('\\')) throw new Error(`Unsafe snapshot path: ${value}`);
  return rel;
}

function ensureParent(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function writeJson(path, value) {
  ensureParent(path);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(path, value) {
  ensureParent(path);
  writeFileSync(path, String(value || ''), 'utf8');
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function headers() {
  const h = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Tiinex-Issue-Snapshot-Publisher'
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function githubJson(url) {
  const response = await fetch(url, { headers: headers() });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub issue snapshot fetch failed ${response.status} ${response.statusText}: ${url}\n${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

function nextLink(linkHeader = '') {
  for (const part of String(linkHeader || '').split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/u);
    if (match) return match[1];
  }
  return '';
}

async function githubJsonPages(url, limit = 1000) {
  const rows = [];
  let next = url;
  while (next && rows.length < limit) {
    const response = await fetch(next, { headers: headers() });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`GitHub issue snapshot fetch failed ${response.status} ${response.statusText}: ${next}\n${text.slice(0, 500)}`);
    }
    const data = text ? JSON.parse(text) : [];
    if (Array.isArray(data)) rows.push(...data.slice(0, Math.max(0, limit - rows.length)));
    next = rows.length >= limit ? '' : nextLink(response.headers.get('link') || '');
  }
  return { rows, truncated: Boolean(next) };
}

function publicIdentity(repo) {
  return `github.com/${repo}`;
}

function issuePublicUrl(repo, number) {
  return `${githubServer}/${repo}/issues/${number}`;
}

function commentPublicUrl(repo, issueNumber, commentId) {
  return `${githubServer}/${repo}/issues/${issueNumber}#issuecomment-${commentId}`;
}

function minimalUser(user) {
  return user ? { login: user.login || '', id: user.id || null, html_url: user.html_url || '' } : null;
}

function issueJsonRecord(repo, issue, comments, truncatedComments) {
  return {
    type: 'tiinex.github.issue.snapshot.issue.v1',
    repository: repo,
    number: issue.number,
    id: issue.id,
    node_id: issue.node_id || '',
    html_url: issue.html_url || issuePublicUrl(repo, issue.number),
    title: issue.title || '',
    state: issue.state || '',
    state_reason: issue.state_reason || '',
    locked: Boolean(issue.locked),
    author_association: issue.author_association || '',
    user: minimalUser(issue.user),
    labels: (issue.labels || []).map((label) => typeof label === 'string' ? { name: label } : { name: label.name || '', color: label.color || '', description: label.description || '' }),
    assignees: (issue.assignees || []).map(minimalUser).filter(Boolean),
    created_at: issue.created_at || '',
    updated_at: issue.updated_at || '',
    closed_at: issue.closed_at || '',
    comments: comments.map((comment) => ({
      id: comment.id,
      node_id: comment.node_id || '',
      html_url: comment.html_url || commentPublicUrl(repo, issue.number, comment.id),
      path: `comments/${comment.id}.md`,
      json: `comments/${comment.id}.json`,
      user: minimalUser(comment.user),
      author_association: comment.author_association || '',
      created_at: comment.created_at || '',
      updated_at: comment.updated_at || ''
    })),
    truncated_comments: Boolean(truncatedComments),
    body_path: 'issue.md'
  };
}

function commentJsonRecord(repo, issueNumber, comment) {
  return {
    type: 'tiinex.github.issue.snapshot.comment.v1',
    repository: repo,
    issue_number: issueNumber,
    id: comment.id,
    node_id: comment.node_id || '',
    html_url: comment.html_url || commentPublicUrl(repo, issueNumber, comment.id),
    user: minimalUser(comment.user),
    author_association: comment.author_association || '',
    created_at: comment.created_at || '',
    updated_at: comment.updated_at || '',
    body_path: `${comment.id}.md`
  };
}

function zipDirectory(parent, directoryName, archivePath) {
  try {
    rmSync(archivePath, { force: true });
    execFileSync('zip', ['-qr', archivePath, directoryName], { cwd: parent, stdio: 'inherit' });
    return true;
  } catch (error) {
    console.warn(`Issue snapshot archive could not be written: ${error.message}`);
    return false;
  }
}

async function publishRepoSnapshot(repo) {
  const [owner, name] = repo.split('/');
  const identity = publicIdentity(repo);
  const outputParent = join(out, 'issues', 'github.com', owner);
  const repoDir = join(outputParent, name);
  const metadataPath = join(outputParent, `${name}.json`);
  const archivePath = join(outputParent, `${name}.zip`);
  const maxIssues = envInt('TIINEX_ISSUE_SNAPSHOT_MAX_ISSUES', 500);
  const maxComments = envInt('TIINEX_ISSUE_SNAPSHOT_MAX_COMMENTS_PER_ISSUE', 200);
  const generatedAt = new Date().toISOString();

  rmSync(repoDir, { recursive: true, force: true });
  mkdirSync(repoDir, { recursive: true });

  const issuesUrl = `${githubApi}/repos/${repo}/issues?state=all&per_page=100`;
  const { rows: rawIssues, truncated: truncatedIssues } = await githubJsonPages(issuesUrl, maxIssues);
  const issues = rawIssues.filter((issue) => !issue.pull_request).sort((a, b) => Number(a.number) - Number(b.number));
  const manifestIssues = [];
  let commentCount = 0;
  let sourceUpdatedAt = '';

  for (const issue of issues) {
    const issueDir = join(repoDir, 'issues', String(issue.number));
    const commentsDir = join(issueDir, 'comments');
    mkdirSync(commentsDir, { recursive: true });
    const commentsUrl = `${githubApi}/repos/${repo}/issues/${issue.number}/comments?per_page=100`;
    const { rows: comments, truncated: truncatedComments } = await githubJsonPages(commentsUrl, maxComments);
    commentCount += comments.length;
    sourceUpdatedAt = [sourceUpdatedAt, issue.updated_at || '', ...comments.map((comment) => comment.updated_at || '')].filter(Boolean).sort().slice(-1)[0] || sourceUpdatedAt;

    writeText(join(issueDir, 'issue.md'), issue.body || '');
    writeJson(join(issueDir, 'issue.json'), issueJsonRecord(repo, issue, comments, truncatedComments));
    for (const comment of comments) {
      writeText(join(commentsDir, `${comment.id}.md`), comment.body || '');
      writeJson(join(commentsDir, `${comment.id}.json`), commentJsonRecord(repo, issue.number, comment));
    }
    manifestIssues.push({
      number: issue.number,
      title: issue.title || '',
      state: issue.state || '',
      updated_at: issue.updated_at || '',
      issue: `issues/${issue.number}/issue.json`,
      body: `issues/${issue.number}/issue.md`,
      comment_count: comments.length,
      truncated_comments: Boolean(truncatedComments)
    });
  }

  const manifest = {
    type: 'tiinex.github.issues.snapshot.manifest.v1',
    repository: repo,
    generatedAt,
    sourceUpdatedAt,
    issueCount: manifestIssues.length,
    commentCount,
    truncatedIssues: Boolean(truncatedIssues),
    issues: manifestIssues
  };
  writeJson(join(repoDir, 'manifest.json'), manifest);

  const archiveOk = zipDirectory(outputParent, name, archivePath);
  const metadata = {
    type: 'tiinex.github.issues.snapshot',
    version: 1,
    repository: `${githubServer}/${repo}`,
    repo,
    identity,
    directory: `${name}/`,
    manifest: `${name}/manifest.json`,
    archive: archiveOk ? `${name}.zip` : '',
    sha256: archiveOk ? sha256File(archivePath) : '',
    generatedAt,
    sourceUpdatedAt,
    issueCount: manifest.issueCount,
    commentCount: manifest.commentCount,
    truncatedIssues: manifest.truncatedIssues,
    publicationCommit: envValue('GITHUB_SHA') || ''
  };
  writeJson(metadataPath, metadata);
  console.log(`Published issue snapshot ${identity}: ${manifest.issueCount} issue(s), ${manifest.commentCount} comment(s).`);
  return metadata;
}

async function main() {
  const repos = snapshotRepos();
  if (!repos.length) {
    console.log('Issue snapshots disabled or no repositories configured.');
    return;
  }
  mkdirSync(out, { recursive: true });
  const all = [];
  for (const repo of repos) all.push(await publishRepoSnapshot(repo));
  writeJson(join(out, 'issues', 'manifest.json'), {
    type: 'tiinex.github.issues.snapshot.index.v1',
    generatedAt: new Date().toISOString(),
    repositories: all.map((item) => ({ repo: item.repo, metadata: `github.com/${item.repo}.json`, issueCount: item.issueCount, commentCount: item.commentCount, sourceUpdatedAt: item.sourceUpdatedAt }))
  });
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
