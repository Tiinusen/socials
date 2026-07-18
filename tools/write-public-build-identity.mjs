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

function safeBuildToken(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-z0-9._-]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 120);
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

const out = argValue('--out', '.site-publish');
const reason = argValue('--reason', envValue('TIINEX_PUBLIC_BUILD_REASON', 'public-update'));
const existingPath = join(out, 'tiinex.build.json');
const existing = readJson(existingPath, {}) || {};
const generatedAt = new Date().toISOString();
const runId = envValue('GITHUB_RUN_ID');
const runAttempt = envValue('GITHUB_RUN_ATTEMPT');
const runKey = [runId, runAttempt].filter(Boolean).join('-');
const repo = envValue('GITHUB_REPOSITORY') || existing.repository || '';
const sha = envValue('GITHUB_SHA') || existing.commitSha || '';
const releaseCacheKey = safeBuildToken(envValue('TIINEX_RELEASE_CACHE_KEY') || [reason, repo || 'repo', sha.slice(0, 12) || 'sha', runKey || generatedAt].filter(Boolean).join('-'));
const identity = {
  type: 'tiinex.public.build.identity.v1',
  version: 1,
  reason,
  generatedAt,
  repository: repo,
  commitSha: sha,
  commitCreatedAt: existing.commitCreatedAt || '',
  builtAt: existing.builtAt || generatedAt,
  runId,
  runAttempt,
  buildId: existing.buildId || releaseCacheKey,
  releaseCacheKey,
  previousReleaseCacheKey: existing.releaseCacheKey || ''
};
writeJson(existingPath, identity);
console.log(`Public build identity ${reason}: ${releaseCacheKey}`);
