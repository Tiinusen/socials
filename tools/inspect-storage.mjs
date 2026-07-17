#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const appPath = join(root, 'app.js');
if (!existsSync(appPath)) throw new Error('Missing app.js');
const source = readFileSync(appPath, 'utf8');
const lines = source.split(/\r\n|\n|\r/);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractStorageKeyConstants(text) {
  const block = text.match(/const\s+STORAGE_KEYS\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\);/);
  if (!block) return [];
  const entries = [];
  const pattern = /([A-Za-z_$][\w$]*)\s*:\s*(['"])(.*?)\2/g;
  let match;
  while ((match = pattern.exec(block[1]))) {
    entries.push({ name: match[1], value: match[3] });
  }
  return entries;
}

function collectNativeStorageEntries() {
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const pattern = /\b(localStorage|sessionStorage)\s*\.\s*(getItem|setItem|removeItem|clear)\s*\(([^)]*)\)/g;
    let match;
    while ((match = pattern.exec(line))) {
      const [, store, method, argText] = match;
      const firstArg = argText.split(',')[0]?.trim() || '';
      const literal = firstArg.match(/^(['"])(.*?)\1$/);
      entries.push({
        line: index + 1,
        store,
        method,
        key: literal ? literal[2] : firstArg || '(none)',
        keyType: literal ? 'literal' : 'dynamic',
        source: line.trim()
      });
    }
  }
  return entries;
}

function collectJsonHelperEntries() {
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const pattern = /\b(storageJsonGet|storageJsonSet|sessionStorageJsonGet|sessionStorageJsonSet)\s*\(([^)]*)\)/g;
    let match;
    while ((match = pattern.exec(line))) {
      const [, helper, argText] = match;
      const firstArg = argText.split(',')[0]?.trim() || '';
      const literal = firstArg.match(/^(['"])(.*?)\1$/);
      entries.push({
        line: index + 1,
        helper,
        key: literal ? literal[2] : firstArg || '(none)',
        keyType: literal ? 'literal' : 'dynamic',
        source: line.trim()
      });
    }
  }
  return entries;
}

function collectKeyBuilderFunctions() {
  return [...source.matchAll(/^\s*function\s+([A-Za-z_$][\w$]*(?:Key|StorageKey|CacheKey))\s*\(/gm)]
    .map((match) => ({ name: match[1], line: source.slice(0, match.index).split(/\r\n|\n|\r/).length }));
}

function countReferences(pattern) {
  return [...source.matchAll(pattern)].length;
}

const nativeEntries = collectNativeStorageEntries();
const jsonHelperEntries = collectJsonHelperEntries();
const storageKeys = extractStorageKeyConstants(source);
const keyBuilders = collectKeyBuilderFunctions();

const nativeCounts = nativeEntries.reduce((acc, item) => {
  const key = `${item.store}.${item.method}`;
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const helperCounts = jsonHelperEntries.reduce((acc, item) => {
  acc[item.helper] = (acc[item.helper] || 0) + 1;
  return acc;
}, {});

const storageFamilies = storageKeys.map((item) => ({
  ...item,
  constantReferences: countReferences(new RegExp(`\\bSTORAGE_KEYS\\s*\\.\\s*${item.name}\\b`, 'g')),
  literalReferences: countReferences(new RegExp(escapeRegExp(item.value), 'g'))
}));

const dynamicNativeKeys = nativeEntries.filter((item) => item.keyType === 'dynamic').length;
const dynamicHelperKeys = jsonHelperEntries.filter((item) => item.keyType === 'dynamic').length;

const report = {
  nativeCounts,
  helperCounts,
  storageKeys,
  storageFamilies,
  keyBuilders,
  dynamicNativeKeys,
  dynamicHelperKeys,
  nativeEntries,
  jsonHelperEntries
};

const asJson = process.argv.includes('--json');
if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Tiinex storage inventory');
  console.log('');
  console.log('Native storage calls');
  for (const [key, value] of Object.entries(nativeCounts).sort()) console.log(`- ${key}: ${value}`);
  if (!Object.keys(nativeCounts).length) console.log('- none');
  console.log('');
  console.log('JSON helper calls');
  for (const [key, value] of Object.entries(helperCounts).sort()) console.log(`- ${key}: ${value}`);
  if (!Object.keys(helperCounts).length) console.log('- none');
  console.log('');
  console.log('Storage key constants');
  if (storageFamilies.length) {
    for (const item of storageFamilies) {
      console.log(`- ${item.name}: ${item.value} (constant refs ${item.constantReferences}, literal refs ${item.literalReferences})`);
    }
  } else {
    console.log('- none');
  }
  console.log('');
  console.log('Key builder functions');
  if (keyBuilders.length) {
    for (const item of keyBuilders) console.log(`- app.js:${item.line} ${item.name}`);
  } else {
    console.log('- none');
  }
  console.log('');
  console.log(`Dynamic native storage keys: ${dynamicNativeKeys}`);
  console.log(`Dynamic JSON helper keys: ${dynamicHelperKeys}`);
  console.log('');
  console.log('Native entries');
  for (const item of nativeEntries) {
    console.log(`- app.js:${item.line} ${item.store}.${item.method} ${item.keyType}:${item.key}`);
  }
  console.log('');
  console.log('JSON helper entries');
  for (const item of jsonHelperEntries) {
    console.log(`- app.js:${item.line} ${item.helper} ${item.keyType}:${item.key}`);
  }
}
