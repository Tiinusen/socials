#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

function read(path) {
  const full = join(root, path);
  if (!existsSync(full)) throw new Error(`Missing file: ${path}`);
  return readFileSync(full, 'utf8');
}

function walk(dir, output = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, output);
    else output.push(full);
  }
  return output;
}

function relativePackageFiles() {
  return walk(root).map((full) => relative(root, full).replace(/\\/g, '/')).sort();
}

function bytes(text) {
  return Buffer.byteLength(text, 'utf8');
}

function lines(text) {
  return text.length ? text.split(/\r\n|\n|\r/).length : 0;
}

function stripJsStringsAndComments(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      continue;
    }

    if (ch === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      if (i < source.length) {
        out += '  ';
        i += 2;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      out += ' ';
      i += 1;
      let escaped = false;
      while (i < source.length) {
        const c = source[i];
        out += c === '\n' ? '\n' : ' ';
        i += 1;
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === quote) break;
      }
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

function stripCssComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function countOccurrences(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function unique(values) {
  return [...new Set(values)];
}

function sortedEntriesByName(map) {
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function countFunctionDeclarationGroups(js) {
  const declarations = [...js.matchAll(/^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]);
  const counts = new Map();
  for (const name of declarations) counts.set(name, (counts.get(name) || 0) + 1);
  const duplicateDeclarations = sortedEntriesByName(counts)
    .filter(([, count]) => count > 1)
    .map(([name, count]) => ({ name, count }));
  return {
    declarations: declarations.length,
    duplicateGroups: duplicateDeclarations.length,
    duplicateDeclarations
  };
}

function countAssignmentStyleFunctionDefinitions(source) {
  const code = stripJsStringsAndComments(source);
  const variableAssignments = countOccurrences(code, /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g);
  const reassignedFunctions = countOccurrences(code, /(?:^|[;\n])\s*[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)?\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g);
  return variableAssignments + reassignedFunctions;
}

function countStorageAccesses(source, storageName) {
  const pattern = new RegExp(`\\b${storageName}\\s*\\.\\s*(?:getItem|setItem|removeItem|clear)\\s*\\(`, 'g');
  return countOccurrences(source, pattern);
}

function countCssBraceBalance(css) {
  const cleaned = stripCssComments(css);
  let balance = 0;
  for (const ch of cleaned) {
    if (ch === '{') balance += 1;
    if (ch === '}') balance -= 1;
  }
  return balance;
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

function countIdentifierOccurrences(code, identifier) {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return countOccurrences(code, new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`, 'g'));
}

function collectNamedRegistrations(source, registerName) {
  const pattern = new RegExp(`${registerName}\\s*\\(\\s*function\\s+([A-Za-z_$][\\w$]*)`, 'g');
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function collectFunctionReassignments(source) {
  return [...source.matchAll(/(?:^|\n)\s*([A-Za-z_$][\w$]*)\s*=\s*function\s+([A-Za-z_$][\w$]*)\s*\(/g)]
    .map((match) => ({
      target: match[1],
      replacement: match[2],
      line: source.slice(0, match.index).split(/\r\n|\n|\r/).length
    }));
}

function summarizeFunctionReassignmentTargets(entries) {
  const counts = new Map();
  for (const entry of entries) {
    if (!counts.has(entry.target)) counts.set(entry.target, []);
    counts.get(entry.target).push(entry);
  }
  return [...counts.entries()]
    .map(([target, targetEntries]) => ({
      target,
      count: targetEntries.length,
      replacements: targetEntries.map((entry) => `${entry.replacement}@${entry.line}`)
    }))
    .sort((a, b) => b.count - a.count || a.target.localeCompare(b.target));
}

function collectBeforeAliases(source) {
  return [...source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*Before[A-Za-z_$0-9]*)\s*=/g)]
    .map((match) => ({
      name: match[1],
      line: source.slice(0, match.index).split(/\r\n|\n|\r/).length
    }));
}

function collectIncompleteWrapperNames(registrationNames, directFunctionReassignments) {
  const names = Object.values(registrationNames).flat()
    .concat(directFunctionReassignments.map((entry) => entry.replacement));
  return unique(names.filter((name) => /With$/u.test(name)));
}

function countIdentifierReferences(source, identifier) {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return countOccurrences(source, new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`, 'g'));
}

function inventoryRenderPipeline(source) {
  const registrationNames = {
    render: collectNamedRegistrations(source, 'registerRenderWrapper'),
    modal: collectNamedRegistrations(source, 'registerRenderModalWrapper'),
    exportModal: collectNamedRegistrations(source, 'registerRenderExportModalWrapper'),
    workspace: collectNamedRegistrations(source, 'registerRenderWorkspaceWrapper'),
    workspaceFeed: collectNamedRegistrations(source, 'registerRenderWorkspaceFeedWrapper'),
    nodePost: collectNamedRegistrations(source, 'registerRenderNodePostWrapper'),
    nodeMaterialRefs: collectNamedRegistrations(source, 'registerNodeMaterialRefsWrapper'),
    filteredDiscoveryNodes: collectNamedRegistrations(source, 'registerFilteredDiscoveryNodesWrapper'),
    computeWorkspaceIndex: collectNamedRegistrations(source, 'registerComputeWorkspaceIndexWrapper'),
    openArtifactWizard: collectNamedRegistrations(source, 'registerOpenArtifactWizardWrapper'),
    wizardPathFor: collectNamedRegistrations(source, 'registerWizardPathForWrapper'),
    wizardDescribeStep: collectNamedRegistrations(source, 'registerWizardDescribeStepWrapper'),
    scheduleMobileDensity: collectNamedRegistrations(source, 'registerScheduleMobileDensityWrapper'),
    ensureMobileTopRail: collectNamedRegistrations(source, 'registerEnsureMobileTopRailWrapper'),
    syncMobileEmptyWorkspaceHints: collectNamedRegistrations(source, 'registerSyncMobileEmptyWorkspaceHintsWrapper'),
    compactMobilePostChips: collectNamedRegistrations(source, 'registerCompactMobilePostChipsWrapper'),
    scheduleMobileChromeStabilize: collectNamedRegistrations(source, 'registerScheduleMobileChromeStabilizeWrapper'),
    action: collectNamedRegistrations(source, 'registerActionHandler'),
    routeState: collectNamedRegistrations(source, 'registerRouteStateWrapper'),
    viewRouteState: collectNamedRegistrations(source, 'registerViewRouteStateWrapper'),
    applyViewStateToWorkspace: collectNamedRegistrations(source, 'registerApplyViewStateToWorkspaceWrapper'),
    applyViewRouteState: collectNamedRegistrations(source, 'registerApplyViewRouteStateWrapper'),
    setRouteState: collectNamedRegistrations(source, 'registerSetRouteStateWrapper'),
    applyLensSource: collectNamedRegistrations(source, 'registerApplyLensSourceWrapper'),
    copyShareLink: collectNamedRegistrations(source, 'registerCopyShareLinkWrapper')
  };
  const registrationCounts = Object.fromEntries(Object.entries(registrationNames).map(([key, value]) => [key, value.length]));
  const beforeAliases = collectBeforeAliases(source)
    .map((alias) => ({ ...alias, references: countIdentifierReferences(source, alias.name) }));
  const unreferencedBeforeAliases = beforeAliases.filter((alias) => alias.references <= 1);
  const bareBeforeAliases = beforeAliases.filter((alias) => /Before$/u.test(alias.name));
  const directFunctionReassignments = collectFunctionReassignments(source);
  const reassignmentTargets = summarizeFunctionReassignmentTargets(directFunctionReassignments);
  const ambiguousNames = collectIncompleteWrapperNames(registrationNames, directFunctionReassignments);
  return {
    registrationCounts,
    registrationNames,
    directFunctionReassignments,
    reassignmentTargets,
    multiReassignmentTargets: reassignmentTargets.filter((entry) => entry.count > 1),
    beforeAliasNames: beforeAliases.map((alias) => alias.name),
    beforeAliases,
    unreferencedBeforeAliasNames: unreferencedBeforeAliases.map((alias) => alias.name),
    unreferencedBeforeAliases,
    bareBeforeAliasNames: bareBeforeAliases.map((alias) => alias.name),
    bareBeforeAliases,
    ambiguousWrapperNames: ambiguousNames,
    structuralCleanup: inventoryStructuralCleanup(directFunctionReassignments)
  };
}


const ALLOWED_ORDINARY_FUNCTION_REASSIGNMENTS = Object.freeze({
  rememberLensScroll: 'rememberLensScrollWithDiscoverySignature',
  enhanceLensSource: 'enhanceLensSourceWithDiscoverySignature',
  applyCurrentOrCachedLens: 'applyCurrentOrCachedLensOnce',
  chaseScrollForWorkspace: 'chaseScrollForWorkspaceGuarded',
  persistLensState: 'persistLensStateWithHistoryDedupe',
});

function allowedOrdinaryReassignmentKey(entry) {
  return `${entry.target}->${entry.replacement}`;
}

function inventoryOrdinaryReassignmentAllowlist(ordinary) {
  const observed = new Set(ordinary.map(allowedOrdinaryReassignmentKey));
  const allowedEntries = Object.entries(ALLOWED_ORDINARY_FUNCTION_REASSIGNMENTS)
    .map(([target, replacement]) => ({ target, replacement, key: `${target}->${replacement}` }));
  const allowedKeys = new Set(allowedEntries.map((entry) => entry.key));
  return {
    allowedCount: ordinary.filter((entry) => allowedKeys.has(allowedOrdinaryReassignmentKey(entry))).length,
    unexpected: ordinary
      .filter((entry) => !allowedKeys.has(allowedOrdinaryReassignmentKey(entry)))
      .map((entry) => `${entry.target}->${entry.replacement}@${entry.line}`),
    staleAllowlistEntries: allowedEntries
      .filter((entry) => !observed.has(entry.key))
      .map((entry) => entry.key)
  };
}

function classifyReassignmentTarget(entry) {
  const value = `${entry.target} ${entry.replacement}`.toLowerCase();
  if (entry.replacement.startsWith('registered')) return 'canonical-wrapper-registration';
  if (value.includes('wizard')) return 'wizard-flow';
  if (value.includes('mobile')) return 'mobile-chrome';
  if (value.includes('export') || value.includes('download') || value.includes('archive') || value.includes('encryption')) return 'export-packaging';
  if (value.includes('route') || value.includes('viewstate') || value.includes('lens')) return 'route-viewstate-lens';
  if (value.includes('scroll')) return 'scroll';
  if (value.includes('material') || value.includes('attachment') || value.includes('evidence')) return 'material-evidence';
  if (value.includes('localstate') || value.includes('workspace')) return 'workspace-state';
  if (value.includes('discovery') || value.includes('node')) return 'discovery-lineage';
  return 'general';
}

function inventoryStructuralCleanup(directFunctionReassignments) {
  const ordinary = directFunctionReassignments.filter((entry) => !entry.replacement.startsWith('registered'));
  const registered = directFunctionReassignments.filter((entry) => entry.replacement.startsWith('registered'));
  const ordinaryTargetSummary = summarizeFunctionReassignmentTargets(ordinary);
  const categoryCounts = new Map();
  for (const entry of ordinary) {
    const category = classifyReassignmentTarget(entry);
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  }
  const ordinaryCategories = [...categoryCounts.keys()].sort();
  const parkedCategories = new Set(['route-viewstate-lens', 'scroll']);
  const nonParkedCategories = ordinaryCategories.filter((category) => !parkedCategories.has(category));
  const allowlist = inventoryOrdinaryReassignmentAllowlist(ordinary);
  const ordinaryMultiReassignmentTargets = ordinaryTargetSummary.filter((entry) => entry.count > 1);
  const cleanupReadyForProductWork = (
    allowlist.unexpected.length === 0
    && allowlist.staleAllowlistEntries.length === 0
    && ordinaryMultiReassignmentTargets.length === 0
    && nonParkedCategories.length === 0
  );
  return {
    registeredWrapperAssignments: registered.length,
    ordinaryFunctionReassignments: ordinary.length,
    ordinaryAllowlistedReassignments: allowlist.allowedCount,
    ordinaryUnexpectedReassignments: allowlist.unexpected,
    ordinaryStaleAllowlistEntries: allowlist.staleAllowlistEntries,
    ordinaryMultiReassignmentTargets,
    ordinaryCategoryCounts: Object.fromEntries([...categoryCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
    ordinaryNonParkedCategories: nonParkedCategories,
    parkedOrdinaryReassignmentTargets: ordinary
      .filter((entry) => parkedCategories.has(classifyReassignmentTarget(entry)))
      .map((entry) => `${entry.target}->${entry.replacement}@${entry.line}`),
    cleanupReadyForProductWork,
    highestRiskTargets: ordinaryMultiReassignmentTargets
      .slice(0, 12)
      .map((entry) => ({ target: entry.target, count: entry.count, replacements: entry.replacements }))
  };
}

function inventoryScrollSystems(source) {
  const families = [
    {
      name: 'visible-feed-snapshot',
      role: 'render-local scroll preservation',
      markers: ['snapshotVisibleFeedScrolls', 'restoreVisibleFeedScrolls']
    },
    {
      name: 'route-scroll-state',
      role: 'route/view state scroll fields',
      markers: ['routeScrollStateForWorkspace', 'applyRouteScrollStateToWorkspace', 'restoreRouteScrollForWorkspace', 'renderWithRouteScroll']
    },
    {
      name: 'route-scroll-cache',
      role: 'session cache for route scroll top',
      markers: ['scrollCacheKey', 'rememberWorkspaceScroll', 'restoreCachedWorkspaceScroll', 'restoreAllRouteScroll', 'renderWithRobustScrollAndFocus']
    },
    {
      name: 'durable-lens-scroll',
      role: 'lens/session scroll chase',
      markers: ['rememberLensScroll', 'persistLensState', 'chaseScrollForWorkspace', 'renderWithDurableLens']
    },
    {
      name: 'anchor-scroll',
      role: 'anchor/card based scroll restore',
      markers: ['anchorScrollKey', 'writeAnchorScroll', 'readAnchorScroll', 'chaseAnchorScrollForWorkspace', 'renderWithAnchorScroll']
    },
    {
      name: 'stored-browser-scroll',
      role: 'stored browser state scroll restore',
      markers: ['storedScrollKey', 'writeStoredScroll', 'readStoredScroll', 'chaseStoredScrollForWorkspace', 'renderWithStoredBrowserState']
    }
  ];
  return families.map((family) => {
    const markerCounts = Object.fromEntries(family.markers.map((marker) => [marker, countIdentifierOccurrences(source, marker)]));
    const hitCount = Object.values(markerCounts).reduce((sum, count) => sum + count, 0);
    return {
      name: family.name,
      role: family.role,
      active: hitCount > 0,
      hitCount,
      markerCounts
    };
  });
}

function inventoryStorageFamilies(source) {
  const constants = extractStorageKeyConstants(source);
  return constants.map((entry) => ({
    ...entry,
    constantReferences: countOccurrences(source, new RegExp(`\\bSTORAGE_KEYS\\s*\\.\\s*${entry.name}\\b`, 'g')),
    literalReferences: countOccurrences(source, new RegExp(entry.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))
  }));
}


function inventoryMarkdownContinuity() {
  const markdownFiles = relativePackageFiles().filter((path) => path.endsWith('.md'));
  const placeholderPattern = /^\s*-\s+Value:\s+(?:pending|test|placeholder|todo)\s*$/imu;
  const schemaLinkPattern = /https:\/\/github\.com\/Tiinex\/docs\/blob\/(?:master|main)\/\.topics\/\.schemas\/tiinex\.[^)\s]+\.schema\.md/gu;
  const filesWithIntegrity = [];
  const placeholderIntegrityValues = [];
  const unpinnedSchemaLinks = [];
  for (const path of markdownFiles) {
    const text = read(path);
    if (text.includes('# Continuity Integrity')) filesWithIntegrity.push(path);
    if (placeholderPattern.test(text)) placeholderIntegrityValues.push(path);
    for (const match of text.matchAll(schemaLinkPattern)) {
      unpinnedSchemaLinks.push({ path, target: match[0] });
    }
  }
  return {
    markdownFileCount: markdownFiles.length,
    markdownFiles,
    filesWithIntegrity,
    placeholderIntegrityValues,
    unpinnedSchemaLinks
  };
}

function inventoryPublicHygiene(sourceByPath) {
  const terms = ['TODO', 'FIXME', 'HACK', 'XXX', 'checkpoint', 'refactor', 'legacy', 'temporary', 'iteration'];
  const hits = [];
  for (const [path, text] of Object.entries(sourceByPath)) {
    const fileLines = text.split(/\r\n|\n|\r/);
    fileLines.forEach((line, index) => {
      for (const term of terms) {
        const pattern = new RegExp(`\\b${term}\\b`, 'i');
        if (pattern.test(line)) hits.push({ path, line: index + 1, term });
      }
    });
  }
  return {
    checkedFiles: Object.keys(sourceByPath),
    hitCount: hits.length,
    hits: hits.slice(0, 50)
  };
}

const js = read('app.js');
const css = read('styles.css');
const packageJson = read('package.json');
const readme = read('README.md');
const validationNotes = read('VALIDATION_NOTES.md');
const llms = read('llms.txt');
const appLlm = read('tiinex.app.llm.v1.md');
const code = stripJsStringsAndComments(js);
const functionGroups = countFunctionDeclarationGroups(js);
const renderPipeline = inventoryRenderPipeline(js);
const scrollSystems = inventoryScrollSystems(js);
const activeScrollSystems = scrollSystems.filter((family) => family.active);
const storageFamilies = inventoryStorageFamilies(js);

const metrics = {
  appJs: {
    bytes: bytes(js),
    lines: lines(js),
    functionDeclarations: functionGroups.declarations,
    duplicateFunctionDeclarationGroups: functionGroups.duplicateGroups,
    duplicateFunctionDeclarations: functionGroups.duplicateDeclarations,
    ordinaryVersionedIdentifierOccurrences: countOccurrences(code, /\b[A-Za-z_$][\w$]*(?:V\d{2,}|v\d{2,})\b/g),
    versionedFunctionDeclarations: countOccurrences(code, /^\s*function\s+[A-Za-z_$][\w$]*(?:V\d{2,}|v\d{2,})\s*\(/gm),
    stopImmediatePropagationCalls: countOccurrences(code, /\bstopImmediatePropagation\b/g),
    consoleCalls: countOccurrences(js, /\bconsole\s*\./g),
    consoleErrorCalls: countOccurrences(js, /\bconsole\s*\.\s*error\b/g),
    consoleWarnCalls: countOccurrences(js, /\bconsole\s*\.\s*warn\b/g),
    debuggerStatements: countOccurrences(code, /\bdebugger\b/g),
    evalCalls: countOccurrences(code, /\beval\s*\(/g),
    documentWriteCalls: countOccurrences(code, /\bdocument\s*\.\s*write\s*\(/g),
    dataImageOccurrences: countOccurrences(js, /data:image/gi),
    assignmentStyleFunctionDefinitionsApprox: countAssignmentStyleFunctionDefinitions(js),
    localStorageAccesses: countStorageAccesses(js, 'localStorage'),
    sessionStorageAccesses: countStorageAccesses(js, 'sessionStorage')
  },
  stylesCss: {
    bytes: bytes(css),
    lines: lines(css),
    braceBalance: countCssBraceBalance(css),
    versionedCssTokens: countOccurrences(css, /(?:^|[^A-Za-z0-9_-])(?:v\d{2,}[-_][A-Za-z0-9_-]+|[A-Za-z0-9_-]+[-_]v\d{2,})(?=$|[^A-Za-z0-9_-])/gi)
  },
  renderPipeline,
  scrollSystems: {
    activeFamilyCount: activeScrollSystems.length,
    activeFamilies: activeScrollSystems.map((family) => family.name),
    families: scrollSystems
  },
  storageFamilies,
  markdownContinuity: inventoryMarkdownContinuity(),
  publicHygiene: inventoryPublicHygiene({
    'app.js': js,
    'styles.css': css,
    'README.md': readme,
    'VALIDATION_NOTES.md': validationNotes,
    'llms.txt': llms,
    'tiinex.app.llm.v1.md': appLlm,
    'package.json': packageJson
  })
};

const asJson = process.argv.includes('--json');
if (asJson) {
  console.log(JSON.stringify(metrics, null, 2));
} else {
  console.log('Tiinex static metrics');
  console.log('');
  console.log('app.js');
  for (const [key, value] of Object.entries(metrics.appJs)) {
    if (Array.isArray(value)) console.log(`- ${key}: ${value.length}`);
    else console.log(`- ${key}: ${value}`);
  }
  console.log('');
  console.log('styles.css');
  for (const [key, value] of Object.entries(metrics.stylesCss)) console.log(`- ${key}: ${value}`);
  console.log('');
  console.log('render pipeline');
  for (const [key, value] of Object.entries(metrics.renderPipeline.registrationCounts)) console.log(`- ${key} wrappers: ${value}`);
  console.log(`- directFunctionReassignments: ${metrics.renderPipeline.directFunctionReassignments.length}`);
  console.log(`- multiReassignmentTargets: ${metrics.renderPipeline.multiReassignmentTargets.length ? metrics.renderPipeline.multiReassignmentTargets.map((entry) => `${entry.target}(${entry.count})`).join(', ') : 'none'}`);
  console.log(`- beforeAliasNames: ${metrics.renderPipeline.beforeAliasNames.length}`);
  console.log(`- unreferencedBeforeAliasNames: ${metrics.renderPipeline.unreferencedBeforeAliasNames.length ? metrics.renderPipeline.unreferencedBeforeAliasNames.join(', ') : 'none'}`);
  console.log(`- bareBeforeAliasNames: ${metrics.renderPipeline.bareBeforeAliasNames.length ? metrics.renderPipeline.bareBeforeAliasNames.join(', ') : 'none'}`);
  console.log(`- ambiguousWrapperNames: ${metrics.renderPipeline.ambiguousWrapperNames.length ? metrics.renderPipeline.ambiguousWrapperNames.join(', ') : 'none'}`);
  console.log('');
  console.log('structural cleanup');
  console.log(`- registeredWrapperAssignments: ${metrics.renderPipeline.structuralCleanup.registeredWrapperAssignments}`);
  console.log(`- ordinaryFunctionReassignments: ${metrics.renderPipeline.structuralCleanup.ordinaryFunctionReassignments}`);
  console.log(`- ordinaryAllowlistedReassignments: ${metrics.renderPipeline.structuralCleanup.ordinaryAllowlistedReassignments}/${metrics.renderPipeline.structuralCleanup.ordinaryFunctionReassignments}`);
  console.log(`- ordinaryUnexpectedReassignments: ${metrics.renderPipeline.structuralCleanup.ordinaryUnexpectedReassignments.length ? metrics.renderPipeline.structuralCleanup.ordinaryUnexpectedReassignments.join(', ') : 'none'}`);
  console.log(`- ordinaryStaleAllowlistEntries: ${metrics.renderPipeline.structuralCleanup.ordinaryStaleAllowlistEntries.length ? metrics.renderPipeline.structuralCleanup.ordinaryStaleAllowlistEntries.join(', ') : 'none'}`);
  const categoryText = Object.entries(metrics.renderPipeline.structuralCleanup.ordinaryCategoryCounts)
    .map(([category, count]) => `${category}(${count})`)
    .join(', ');
  console.log(`- ordinaryCategories: ${categoryText || 'none'}`);
  console.log(`- ordinaryNonParkedCategories: ${metrics.renderPipeline.structuralCleanup.ordinaryNonParkedCategories.length ? metrics.renderPipeline.structuralCleanup.ordinaryNonParkedCategories.join(', ') : 'none'}`);
  console.log(`- ordinaryMultiReassignmentTargets: ${metrics.renderPipeline.structuralCleanup.ordinaryMultiReassignmentTargets.length ? metrics.renderPipeline.structuralCleanup.ordinaryMultiReassignmentTargets.map((entry) => `${entry.target}(${entry.count})`).join(', ') : 'none'}`);
  console.log(`- cleanupReadyForProductWork: ${metrics.renderPipeline.structuralCleanup.cleanupReadyForProductWork ? 'yes' : 'no'}`);
  console.log('');
  console.log('scroll systems');
  console.log(`- activeFamilyCount: ${metrics.scrollSystems.activeFamilyCount}`);
  for (const family of metrics.scrollSystems.families) {
    console.log(`- ${family.name}: ${family.active ? 'active' : 'absent'} (${family.hitCount} marker hits)`);
  }
  console.log('');
  console.log('storage families');
  for (const item of metrics.storageFamilies) {
    console.log(`- ${item.name}: ${item.value} (constant refs ${item.constantReferences}, literal refs ${item.literalReferences})`);
  }
  console.log('');
  console.log('markdown continuity');
  console.log(`- markdownFiles: ${metrics.markdownContinuity.markdownFileCount}`);
  console.log(`- filesWithIntegrity: ${metrics.markdownContinuity.filesWithIntegrity.length}`);
  console.log(`- placeholderIntegrityValues: ${metrics.markdownContinuity.placeholderIntegrityValues.length ? metrics.markdownContinuity.placeholderIntegrityValues.join(', ') : 'none'}`);
  console.log(`- unpinnedSchemaLinks: ${metrics.markdownContinuity.unpinnedSchemaLinks.length ? metrics.markdownContinuity.unpinnedSchemaLinks.map((entry) => entry.path).join(', ') : 'none'}`);
  console.log('');
  console.log('public hygiene');
  console.log(`- checkedFiles: ${metrics.publicHygiene.checkedFiles.length}`);
  console.log(`- markerHits: ${metrics.publicHygiene.hitCount}`);
}
