#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function envValue(name, fallback = '') {
  return String(process.env[name] || fallback || '').trim();
}

function readJson(path, fallback = null) {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function latestIso(values) {
  return values.map((value) => String(value || '').trim()).filter(Boolean).sort().slice(-1)[0] || '';
}

const out = argValue('--out', '.site-publish');
const mode = argValue('--mode', envValue('TIINEX_ISSUE_PUBLISH_MODE', 'issue-sync'));
const cooldownSeconds = Number(argValue('--cooldown', envValue('TIINEX_ISSUE_PUBLISH_GRACE_SECONDS', '120'))) || 120;
const statePath = join(out, '.tiinex', 'issue-publish-state.json');
const previous = readJson(statePath, {}) || {};
const index = readJson(join(out, 'issues', 'manifest.json'), {}) || {};
const repoSourceTimes = Array.isArray(index.repositories) ? index.repositories.map((repo) => repo.sourceUpdatedAt) : [];
const now = new Date().toISOString();
const eventName = envValue('GITHUB_EVENT_NAME');
const eventAction = envValue('GITHUB_EVENT_ACTION');
const generation = [envValue('GITHUB_RUN_ID'), envValue('GITHUB_RUN_ATTEMPT')].filter(Boolean).join('.') || now;
const snapshotSourceUpdatedAt = latestIso(repoSourceTimes);
const state = {
  type: 'tiinex.issue.publication.state.v1',
  version: 1,
  mode,
  last_published_at: now,
  cooldown_seconds: cooldownSeconds,
  pending_generation: generation,
  published_generation: generation,
  snapshot_generation: index.generatedAt || now,
  snapshot_source_updated_at: snapshotSourceUpdatedAt,
  repository_count: Array.isArray(index.repositories) ? index.repositories.length : 0,
  repositories: Array.isArray(index.repositories) ? index.repositories.map((repo) => ({ repo: repo.repo || '', sourceUpdatedAt: repo.sourceUpdatedAt || '', issueCount: repo.issueCount || 0, commentCount: repo.commentCount || 0 })) : [],
  event: {
    name: eventName,
    action: eventAction,
    issue: envValue('TIINEX_ISSUE_EVENT_NUMBER'),
    comment: envValue('TIINEX_ISSUE_COMMENT_ID')
  },
  previous: {
    last_published_at: previous.last_published_at || '',
    published_generation: previous.published_generation || '',
    snapshot_source_updated_at: previous.snapshot_source_updated_at || ''
  },
  follow_up_required: false
};
writeJson(statePath, state);
console.log(`Issue publish state: last_published_at=${state.last_published_at}`);
console.log(`Issue publish state: cooldown_seconds=${state.cooldown_seconds}`);
console.log(`Issue publish state: pending_generation=${state.pending_generation}`);
console.log(`Issue publish state: snapshot_generation=${state.snapshot_generation}`);
console.log(`Issue publish state: snapshot_source_updated_at=${state.snapshot_source_updated_at || 'none'}`);
console.log(`Issue publish state: follow-up required: ${state.follow_up_required ? 'yes' : 'no'}`);
