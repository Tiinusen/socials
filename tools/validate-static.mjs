#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function note(message) {
  notes.push(message);
}

function file(path) {
  const full = join(root, path);
  if (!existsSync(full)) fail(`Missing required file: ${path}`);
  return full;
}

function read(path) {
  return readFileSync(file(path), 'utf8');
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

function packagedMarkdownFiles() {
  return relativePackageFiles().filter((path) => path.endsWith('.md'));
}

function parseEmbeddedDoubleQuotedString(source, constName) {
  const escapedName = constName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`const\\s+${escapedName}\\s*=\\s*("(?:\\\\.|[^"\\\\])*")\\s*;`);
  const match = source.match(pattern);
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]);
  } catch (_) {
    return undefined;
  }
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
        if (escaped) {
          escaped = false;
        } else if (c === '\\') {
          escaped = true;
        } else if (c === quote) {
          break;
        }
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

function countCssBraceBalance(source) {
  const cleaned = stripCssComments(source);
  let balance = 0;
  for (const ch of cleaned) {
    if (ch === '{') balance += 1;
    if (ch === '}') balance -= 1;
    if (balance < 0) return balance;
  }
  return balance;
}

const ALLOWED_ORDINARY_FUNCTION_REASSIGNMENTS = Object.freeze({
  rememberLensScroll: 'rememberLensScrollWithDiscoverySignature',
  enhanceLensSource: 'enhanceLensSourceWithDiscoverySignature',
  applyCurrentOrCachedLens: 'applyCurrentOrCachedLensOnce',
  chaseScrollForWorkspace: 'chaseScrollForWorkspaceGuarded',
  persistLensState: 'persistLensStateWithHistoryDedupe',
});

function functionReassignmentKey(entry) {
  return `${entry.target}->${entry.replacement}`;
}

function collectFunctionReassignments(source) {
  return [...source.matchAll(/(?:^|\n)\s*([A-Za-z_$][\w$]*)\s*=\s*function\s+([A-Za-z_$][\w$]*)\s*\(/g)]
    .map((match) => ({
      target: match[1],
      replacement: match[2],
      line: source.slice(0, match.index).split(/\r\n|\n|\r/).length
    }));
}

function validateRequiredFiles() {
  [
    'index.html',
    'app.js',
    'styles.css',
    'README.md',
    'llms.txt',
    'tiinex.app.llm.v1.md',
    'VALIDATION_NOTES.md',
    'assets/tiinex-logo-white-transparent.png',
    'package.json',
    '.editorconfig',
    '.gitignore'
  ].forEach(file);
}

function validateRootMarkdown() {
  const expected = new Set(['README.md', 'tiinex.app.llm.v1.md', 'VALIDATION_NOTES.md']);
  const rootMarkdown = readdirSync(root)
    .filter((entry) => entry.endsWith('.md'))
    .sort();
  const unexpected = rootMarkdown.filter((entry) => !expected.has(entry));
  if (unexpected.length) fail(`Unexpected markdown files in package root: ${unexpected.join(', ')}`);
  note(`root markdown files: ${rootMarkdown.join(', ') || 'none'}`);
}

function validateNoAuditReports() {
  const bad = walk(root)
    .map((full) => relative(root, full))
    .filter((path) => new RegExp('(^|/).*(AUDIT|CHECK' + 'POINT|REFACTOR).*\\.md$', 'i').test(path));
  if (bad.length) fail(`Package-local audit reports should not ship: ${bad.join(', ')}`);
}


function countTokenReferences(source, token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...source.matchAll(new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`, 'g'))].length;
}

function validateToolSyntax() {
  const toolPaths = readdirSync(file('tools'))
    .filter((entry) => entry.endsWith('.mjs'))
    .map((entry) => `tools/${entry}`)
    .sort();
  for (const path of toolPaths) {
    const result = spawnSync(process.execPath, ['--check', file(path)], { encoding: 'utf8' });
    if (result.status !== 0) fail(`node --check ${path} failed:\n${result.stderr || result.stdout}`.trim());
  }
  note(`tool syntax checked: ${toolPaths.join(', ')}`);
}

function validateWrapperHygiene() {
  const js = read('app.js');
  const incompleteWrapperNames = new Set();
  for (const match of js.matchAll(/register[A-Za-z]*Wrapper\(\s*function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (/With$/u.test(match[1])) incompleteWrapperNames.add(match[1]);
  }
  for (const match of js.matchAll(/(?:^|\n)\s*[A-Za-z_$][\w$]*\s*=\s*function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (/With$/u.test(match[1])) incompleteWrapperNames.add(match[1]);
  }
  if (incompleteWrapperNames.size) {
    fail(`Incomplete wrapper/function names found: ${[...incompleteWrapperNames].sort().join(', ')}. Names ending in bare "With" must say what behavior they add.`);
  }

  const staleBeforeAliases = [];
  const bareBeforeAliases = [];
  for (const match of js.matchAll(/\bconst\s+([A-Za-z_$][\w$]*Before[A-Za-z_$0-9]*)\s*=/g)) {
    const name = match[1];
    const line = js.slice(0, match.index).split(/\r\n|\n|\r/).length;
    if (countTokenReferences(js, name) <= 1) staleBeforeAliases.push(`${name}@${line}`);
    if (/Before$/u.test(name)) bareBeforeAliases.push(`${name}@${line}`);
  }
  if (staleBeforeAliases.length) {
    fail(`Unreferenced Before-alias declarations found: ${staleBeforeAliases.slice(0, 20).join(', ')}`);
  }
  if (bareBeforeAliases.length) {
    fail(`Bare Before-alias names found: ${bareBeforeAliases.slice(0, 20).join(', ')}. Aliases must name the behavior boundary they preserve.`);
  }
}

function validateCanonicalRenderAssignments() {
  const js = read('app.js');
  const compactJs = js.replace(/\s+/gu, ' ');
  const exportModalWrapperShape = 'function registerRenderExportModalWrapper(wrapper) { const next = renderExportModal; renderExportModal = function registeredRenderExportModalWrapper(modal) { return wrapper(modal, next); }; }';
  const workspaceWrapperShape = 'function registerRenderWorkspaceWrapper(wrapper) { const next = renderWorkspace; renderWorkspace = function registeredRenderWorkspaceWrapper(ws) { return wrapper(ws, next); }; }';
  const workspaceFeedWrapperShape = 'function registerRenderWorkspaceFeedWrapper(wrapper) { const next = renderWorkspaceFeed; renderWorkspaceFeed = function registeredRenderWorkspaceFeedWrapper(ws, selected) { return wrapper(ws, selected, next); }; }';
  const nodeMaterialRefsWrapperShape = 'function registerNodeMaterialRefsWrapper(wrapper) { const next = nodeMaterialRefs; nodeMaterialRefs = function registeredNodeMaterialRefsWrapper(ws, node) { return wrapper(ws, node, next); }; }';
  const filteredDiscoveryNodesWrapperShape = 'function registerFilteredDiscoveryNodesWrapper(wrapper) { const next = filteredDiscoveryNodes; filteredDiscoveryNodes = function registeredFilteredDiscoveryNodesWrapper(ws) { return wrapper(ws, next); }; }';
  const computeWorkspaceIndexWrapperShape = 'function registerComputeWorkspaceIndexWrapper(wrapper) { const next = computeWorkspaceIndex; computeWorkspaceIndex = function registeredComputeWorkspaceIndexWrapper(ws) { return wrapper(ws, next); }; }';
  const openArtifactWizardWrapperShape = 'function registerOpenArtifactWizardWrapper(wrapper) { const next = openArtifactWizard; openArtifactWizard = function registeredOpenArtifactWizardWrapper(ws, options = {}) { return wrapper(ws, options, next); }; }';
  const wizardPathForWrapperShape = 'function registerWizardPathForWrapper(wrapper) { const next = wizardPathFor; wizardPathFor = function registeredWizardPathForWrapper(ws, modal, option, title) { return wrapper(ws, modal, option, title, next); }; }';
  const wizardDescribeStepWrapperShape = 'function registerWizardDescribeStepWrapper(wrapper) { const next = wizardDescribeStep; wizardDescribeStep = function registeredWizardDescribeStepWrapper(ws, modal, selected, title, summary, body) { return wrapper(ws, modal, selected, title, summary, body, next); }; }';
  const scheduleMobileDensityWrapperShape = 'function registerScheduleMobileDensityWrapper(wrapper) { const next = scheduleMobileDensity; scheduleMobileDensity = function registeredScheduleMobileDensityWrapper() { return wrapper(next); }; }';
  const ensureMobileTopRailWrapperShape = 'function registerEnsureMobileTopRailWrapper(wrapper) { const next = ensureMobileTopRail; ensureMobileTopRail = function registeredEnsureMobileTopRailWrapper() { return wrapper(next); }; }';
  const syncMobileEmptyWorkspaceHintsWrapperShape = 'function registerSyncMobileEmptyWorkspaceHintsWrapper(wrapper) { const next = syncMobileEmptyWorkspaceHintsInitial; syncMobileEmptyWorkspaceHintsInitial = function registeredSyncMobileEmptyWorkspaceHintsWrapper() { return wrapper(next); }; }';
  const compactMobilePostChipsWrapperShape = 'function registerCompactMobilePostChipsWrapper(wrapper) { const next = compactMobilePostChips; compactMobilePostChips = function registeredCompactMobilePostChipsWrapper() { return wrapper(next); }; }';
  const scheduleMobileChromeStabilizeWrapperShape = 'function registerScheduleMobileChromeStabilizeWrapper(wrapper) { const next = scheduleMobileChromeStabilizeInitial; scheduleMobileChromeStabilizeInitial = function registeredScheduleMobileChromeStabilizeWrapper() { return wrapper(next); }; }';
  if (!compactJs.includes(exportModalWrapperShape)) {
    fail('registerRenderExportModalWrapper must pass only the export modal and next render function.');
  }
  if (!compactJs.includes(workspaceWrapperShape)) {
    fail('registerRenderWorkspaceWrapper must pass only the workspace and next render function. Do not forward Array.map callback arguments into wrappers.');
  }
  if (!compactJs.includes(workspaceFeedWrapperShape)) {
    fail('registerRenderWorkspaceFeedWrapper must pass only workspace, selected node, and next render function. Do not forward incidental caller arguments into wrappers.');
  }
  if (!compactJs.includes(nodeMaterialRefsWrapperShape)) {
    fail('registerNodeMaterialRefsWrapper must pass only workspace, node, and next refs function.');
  }
  if (!compactJs.includes(filteredDiscoveryNodesWrapperShape)) {
    fail('registerFilteredDiscoveryNodesWrapper must pass only workspace and next discovery filter function.');
  }
  if (!compactJs.includes(computeWorkspaceIndexWrapperShape)) {
    fail('registerComputeWorkspaceIndexWrapper must pass only workspace and next index function. Do not forward incidental caller arguments into workspace indexing wrappers.');
  }
  if (!compactJs.includes(openArtifactWizardWrapperShape)) {
    fail('registerOpenArtifactWizardWrapper must pass only workspace, options, and next wizard opener. Do not forward incidental caller arguments into wizard opener wrappers.');
  }
  if (!compactJs.includes(wizardPathForWrapperShape)) {
    fail('registerWizardPathForWrapper must pass only workspace, modal, option, title, and next path function. Do not forward incidental caller arguments into wizard path wrappers.');
  }
  if (!compactJs.includes(wizardDescribeStepWrapperShape)) {
    fail('registerWizardDescribeStepWrapper must pass only workspace, modal, selected option, title, summary, body, and next describe-step function. Do not forward incidental caller arguments into wizard describe wrappers.');
  }
  if (!compactJs.includes(scheduleMobileDensityWrapperShape)) {
    fail('registerScheduleMobileDensityWrapper must pass only next density scheduler. Do not forward incidental caller arguments into mobile density wrappers.');
  }
  if (!compactJs.includes(ensureMobileTopRailWrapperShape)) {
    fail('registerEnsureMobileTopRailWrapper must pass only next top rail function. Do not forward incidental caller arguments into mobile rail wrappers.');
  }
  if (!compactJs.includes(syncMobileEmptyWorkspaceHintsWrapperShape)) {
    fail('registerSyncMobileEmptyWorkspaceHintsWrapper must pass only next empty-workspace hint function. Do not forward incidental caller arguments into mobile hint wrappers.');
  }
  if (!compactJs.includes(compactMobilePostChipsWrapperShape)) {
    fail('registerCompactMobilePostChipsWrapper must pass only next compact mobile chips function. Do not forward incidental caller arguments into mobile chip wrappers.');
  }
  if (!compactJs.includes(scheduleMobileChromeStabilizeWrapperShape)) {
    fail('registerScheduleMobileChromeStabilizeWrapper must pass only next chrome stabilize function. Do not forward incidental caller arguments into mobile chrome stabilize wrappers.');
  }
  const assignments = collectFunctionReassignments(js);
  const allowedCoreAssignments = new Map([
    ['handleAction', 'registeredActionHandler'],
    ['render', 'registeredRenderWrapper'],
    ['renderModal', 'registeredRenderModalWrapper'],
    ['renderExportModal', 'registeredRenderExportModalWrapper'],
    ['renderWorkspace', 'registeredRenderWorkspaceWrapper'],
    ['renderWorkspaceFeed', 'registeredRenderWorkspaceFeedWrapper'],
    ['renderNodePost', 'registeredRenderNodePostWrapper'],
    ['nodeMaterialRefs', 'registeredNodeMaterialRefsWrapper'],
    ['filteredDiscoveryNodes', 'registeredFilteredDiscoveryNodesWrapper'],
    ['computeWorkspaceIndex', 'registeredComputeWorkspaceIndexWrapper'],
    ['openArtifactWizard', 'registeredOpenArtifactWizardWrapper'],
    ['wizardPathFor', 'registeredWizardPathForWrapper'],
    ['wizardDescribeStep', 'registeredWizardDescribeStepWrapper'],
    ['scheduleMobileDensity', 'registeredScheduleMobileDensityWrapper'],
    ['ensureMobileTopRail', 'registeredEnsureMobileTopRailWrapper'],
    ['syncMobileEmptyWorkspaceHintsInitial', 'registeredSyncMobileEmptyWorkspaceHintsWrapper'],
    ['compactMobilePostChips', 'registeredCompactMobilePostChipsWrapper'],
    ['scheduleMobileChromeStabilizeInitial', 'registeredScheduleMobileChromeStabilizeWrapper'],
    ['routeState', 'registeredRouteStateWrapper'],
    ['viewRouteState', 'registeredViewRouteStateWrapper'],
    ['applyViewStateToWorkspace', 'registeredApplyViewStateToWorkspaceWrapper'],
    ['applyViewRouteState', 'registeredApplyViewRouteStateWrapper'],
    ['setRouteState', 'registeredSetRouteStateWrapper'],
    ['applyLensSource', 'registeredApplyLensSourceWrapper'],
    ['copyShareLink', 'registeredCopyShareLinkWrapper']
  ]);
  const disallowed = assignments.filter((entry) => {
    const expected = allowedCoreAssignments.get(entry.target);
    return expected && entry.replacement !== expected;
  });
  if (disallowed.length) {
    fail(`Core render/state assignments must go through canonical wrapper registration: ${disallowed.map((entry) => `${entry.target}->${entry.replacement}@${entry.line}`).join(', ')}`);
  }
}

function validateOrdinaryFunctionReassignments() {
  const js = read('app.js');
  const assignments = collectFunctionReassignments(js);
  const ordinary = assignments.filter((entry) => !entry.replacement.startsWith('registered'));
  const countsByTarget = new Map();
  for (const entry of ordinary) {
    if (!countsByTarget.has(entry.target)) countsByTarget.set(entry.target, []);
    countsByTarget.get(entry.target).push(entry);
  }
  const repeatedTargets = [...countsByTarget.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([target, entries]) => `${target}(${entries.map((entry) => `${entry.replacement}@${entry.line}`).join(', ')})`);
  if (repeatedTargets.length) {
    fail(`Ordinary function reassignment targets must not stack multiple overrides: ${repeatedTargets.join(', ')}`);
  }

  const allowedKeys = new Set(Object.entries(ALLOWED_ORDINARY_FUNCTION_REASSIGNMENTS).map(([target, replacement]) => `${target}->${replacement}`));
  const observedKeys = new Set(ordinary.map(functionReassignmentKey));
  const unexpected = ordinary
    .filter((entry) => !allowedKeys.has(functionReassignmentKey(entry)))
    .map((entry) => `${entry.target}->${entry.replacement}@${entry.line}`);
  const stale = [...allowedKeys].filter((key) => !observedKeys.has(key));
  if (unexpected.length) {
    fail(`Unexpected ordinary function reassignments found: ${unexpected.join(', ')}`);
  }
  if (stale.length) {
    fail(`Ordinary function reassignment inventory is stale: ${stale.join(', ')}`);
  }
  const parkedTargets = new Set(['rememberLensScroll', 'enhanceLensSource', 'applyCurrentOrCachedLens', 'chaseScrollForWorkspace', 'persistLensState']);
  const nonParked = ordinary
    .filter((entry) => !parkedTargets.has(entry.target))
    .map((entry) => `${entry.target}->${entry.replacement}@${entry.line}`);
  if (nonParked.length) {
    fail(`Ordinary reassignments outside parked scroll/viewState surface found: ${nonParked.join(', ')}`);
  }
  note(`ordinary function reassignment inventory: ${ordinary.length}/${allowedKeys.size}; parked scroll/viewState only`);
}

function validateJavascriptSyntax() {
  const result = spawnSync(process.execPath, ['--check', file('app.js')], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    fail(`node --check app.js failed:\n${result.stderr || result.stdout}`.trim());
  }
}

function validateJavascriptSurface() {
  const js = read('app.js');
  const code = stripJsStringsAndComments(js);
  const ordinaryVersionedIdentifiers = [...code.matchAll(/\b[A-Za-z_$][\w$]*(?:V\d{2,}|v\d{2,})\b/g)].map((m) => m[0]);
  if (ordinaryVersionedIdentifiers.length) {
    fail(`Ordinary version-stamped JavaScript identifiers found: ${[...new Set(ordinaryVersionedIdentifiers)].slice(0, 20).join(', ')}`);
  }

  const forbiddenCalls = ['stopImmediatePropagation', 'onActionV645'];
  for (const token of forbiddenCalls) {
    if (code.includes(token)) fail(`Forbidden historical runtime token found in code: ${token}`);
  }

  const blockedConsoleCalls = [...js.matchAll(/\bconsole\s*\.\s*([A-Za-z_$][\w$]*)/g)]
    .map((match) => match[1])
    .filter((method) => !['error', 'warn'].includes(method));
  if (blockedConsoleCalls.length) {
    fail(`Debug console calls should not ship in app.js: ${[...new Set(blockedConsoleCalls)].join(', ')}`);
  }

  const forbiddenDebugPatterns = [
    [/\bdebugger\b/, 'debugger statement'],
    [/\beval\s*\(/, 'eval(...) call'],
    [/\bnew\s+Function\s*\(/, 'new Function(...) call'],
    [/\bdocument\s*\.\s*write\s*\(/, 'document.write(...) call']
  ];
  for (const [pattern, label] of forbiddenDebugPatterns) {
    if (pattern.test(code)) fail(`Debug/dynamic-code surface should not ship in app.js: ${label}`);
  }

  if (/data:image/i.test(js)) fail('Inline data:image payload found in app.js. Logo should resolve through workspace Icon or packaged asset.');

  const retiredStorageTokens = [
    'tiinex-viewer-authors',
    'tiinex.localWorkspace.registry.v1',
    'tiinex.localWorkspace.state.v1',
    'tiinex-scroll:',
    'tiinex-lens:'
  ];
  const retiredStorageHits = retiredStorageTokens.filter((token) => js.includes(token));
  if (retiredStorageHits.length) {
    fail(`Retired browser storage key tokens found: ${retiredStorageHits.join(', ')}`);
  }

  const retiredRouteScrollStateTokens = [
    'routeScrollStateForWorkspace',
    'applyRouteScrollStateToWorkspace',
    'restoreRouteScrollForWorkspace',
    'renderWithRouteScroll',
    'rememberFeedScroll',
    'onFeedScrollRouteState',
    'copyShareLinkWithLatestScroll',
    'applyRouteScrollStateRobust',
    'scrollCacheKey',
    'routeScrollContainerCandidates',
    'bestScrollContainerForWorkspace',
    'currentScrollTopForWorkspace',
    'rememberWorkspaceScroll',
    'restoreCachedWorkspaceScroll',
    'applyScrollTopToWorkspace',
    'restoreAllRouteScroll',
    'renderWithRobustScrollAndFocus',
    'onAnyWorkspaceScroll',
    'copyShareLinkWithRobustScroll',
    'routeScrollStatePrefix',
    'prunePersistentRouteScrollStorage',
    'retiredPersistentRouteScrollPrefix'
  ];
  const retiredRouteScrollHits = retiredRouteScrollStateTokens.filter((token) => countTokenReferences(js, token) > 0);
  if (retiredRouteScrollHits.length) {
    fail(`Retired route-scroll-state tokens found: ${retiredRouteScrollHits.join(', ')}`);
  }

  const requiredRuntimeHelpers = [
    'collapseMobileBadgeRows',
    'scheduleLocalStateSaveAfterWorkspaceMutation'
  ];
  for (const name of requiredRuntimeHelpers) {
    const declarationPattern = new RegExp(`^\\s*function\\s+${name}\\s*\\(`, 'm');
    if (countTokenReferences(code, name) > 0 && !declarationPattern.test(js)) {
      fail(`Referenced runtime helper is missing a function declaration: ${name}`);
    }
  }

  const forbiddenExportInterceptionAssignments = [...js.matchAll(/(?:^|\n)\s*(downloadBlob|toast)\s*=\s*function\s+([A-Za-z_$][\w$]*)\s*\(/g)]
    .map((match) => `${match[1]}->${match[2]}@${js.slice(0, match.index).split(/\r\n|\n|\r/).length}`);
  if (forbiddenExportInterceptionAssignments.length) {
    fail(`Export flow should use explicit hooks instead of reassigning shared helpers: ${forbiddenExportInterceptionAssignments.join(', ')}`);
  }

  const declarationNames = [...js.matchAll(/^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]);
  const declarationCounts = new Map();
  for (const name of declarationNames) declarationCounts.set(name, (declarationCounts.get(name) || 0) + 1);
  const duplicateDeclarations = [...declarationCounts.entries()].filter(([, count]) => count > 1).map(([name, count]) => `${name} (${count})`);
  if (duplicateDeclarations.length) fail(`Duplicate function declarations found: ${duplicateDeclarations.slice(0, 20).join(', ')}`);

  note(`function declarations: ${declarationNames.length}`);
}

function validateCssSurface() {
  const css = read('styles.css');
  const balance = countCssBraceBalance(css);
  if (balance !== 0) fail(`CSS brace balance failed: ${balance}`);

  const versionedCss = [...css.matchAll(/(?:^|[^A-Za-z0-9_-])(?:v\d{2,}[-_][A-Za-z0-9_-]+|[A-Za-z0-9_-]+[-_]v\d{2,})(?=$|[^A-Za-z0-9_-])/gi)].map((m) => m[0].trim());
  if (versionedCss.length) fail(`Version-stamped CSS tokens found: ${[...new Set(versionedCss)].slice(0, 20).join(', ')}`);
}


function validateNoScaffoldMarkers() {
  const checkedFiles = [
    'app.js',
    'styles.css',
    'README.md',
    'llms.txt',
    'tiinex.app.llm.v1.md',
    'VALIDATION_NOTES.md',
    'package.json'
  ];
  const markerPattern = /\b(?:TODO|FIXME|HACK|XXX|checkpoint|refactor|legacy|temporary|iteration)\b/i;
  const hits = [];
  for (const path of checkedFiles) {
    const text = read(path);
    const lines = text.split(/\r\n|\n|\r/);
    lines.forEach((line, index) => {
      if (markerPattern.test(line)) hits.push(`${path}:${index + 1}`);
    });
  }
  if (hits.length) fail(`Scaffold/debug wording should not ship in public package: ${hits.slice(0, 20).join(', ')}`);
}


function validateMarkdownContinuityHygiene() {
  const markdownFiles = packagedMarkdownFiles();
  const placeholderHits = [];
  const unpinnedSchemaHits = [];
  const schemaLinkPattern = /https:\/\/github\.com\/Tiinex\/docs\/blob\/(?:master|main)\/\.topics\/\.schemas\/tiinex\.[^)\s]+\.schema\.md/gu;
  const placeholderPattern = /^\s*-\s+Value:\s+(?:pending|test|placeholder|todo)\s*$/imu;
  for (const path of markdownFiles) {
    const text = read(path);
    if (placeholderPattern.test(text)) placeholderHits.push(path);
    const matches = [...text.matchAll(schemaLinkPattern)].map((match) => match[0]);
    for (const target of matches) unpinnedSchemaHits.push(`${path} -> ${target}`);
  }
  if (placeholderHits.length) {
    fail(`Packaged continuity markdown contains placeholder integrity values: ${placeholderHits.join(', ')}`);
  }
  if (unpinnedSchemaHits.length) {
    fail(`Packaged schema links must be commit-pinned, not master/main: ${unpinnedSchemaHits.slice(0, 20).join(', ')}`);
  }
}

function validateEmbeddedWorkspaceMirror() {
  const js = read('app.js');
  const embedded = parseEmbeddedDoubleQuotedString(js, 'EMBEDDED_DEFAULT_WORKSPACE_MD');
  if (embedded === undefined) {
    fail('Could not parse EMBEDDED_DEFAULT_WORKSPACE_MD from app.js');
    return;
  }
  const workspace = read('.topics/.workspaces/viewer.workspace.md');
  if (embedded !== workspace) {
    fail('EMBEDDED_DEFAULT_WORKSPACE_MD must exactly mirror .topics/.workspaces/viewer.workspace.md');
  }
}

function validateRootPackageShape() {
  const allowedRootEntries = new Set([
    '.editorconfig',
    '.gitignore',
    '.topics',
    'assets',
    'app.js',
    'index.html',
    'llms.txt',
    'package.json',
    'README.md',
    'samples',
    'styles.css',
    'tiinex.app.llm.v1.md',
    'tools',
    'VALIDATION_NOTES.md'
  ]);

  const rootEntries = readdirSync(root).sort();
  const unexpected = rootEntries.filter((entry) => !allowedRootEntries.has(entry));
  if (unexpected.length) fail(`Unexpected root package entries: ${unexpected.join(', ')}`);

  const forbiddenPackageFiles = walk(root)
    .map((full) => relative(root, full))
    .filter((path) => /(^|\/)(?:.*\.(?:zip|bak|tmp|log)|node_modules\/|\.DS_Store$|Thumbs\.db$)/i.test(path));
  if (forbiddenPackageFiles.length) fail(`Local artifacts should not ship: ${forbiddenPackageFiles.join(', ')}`);

  const packageJson = JSON.parse(read('package.json'));
  if (packageJson.private !== true) {
    fail('package.json must set private: true so the static frontend is not presented as an npm-published package');
  }
  const validateScript = packageJson.scripts && packageJson.scripts.validate;
  const metricsScript = packageJson.scripts && packageJson.scripts.metrics;
  const storageScanScript = packageJson.scripts && packageJson.scripts['storage:scan'];
  if (validateScript !== 'node tools/validate-static.mjs') {
    fail('package.json must expose "validate": "node tools/validate-static.mjs"');
  }
  if (metricsScript !== 'node tools/collect-metrics.mjs') {
    fail('package.json must expose "metrics": "node tools/collect-metrics.mjs"');
  }
  if (storageScanScript !== 'node tools/inspect-storage.mjs') {
    fail('package.json must expose "storage:scan": "node tools/inspect-storage.mjs"');
  }
  note(`root package entries: ${rootEntries.join(', ')}`);
}

function main() {
  validateRequiredFiles();
  validateRootPackageShape();
  validateRootMarkdown();
  validateNoAuditReports();
  validateMarkdownContinuityHygiene();
  validateEmbeddedWorkspaceMirror();
  validateNoScaffoldMarkers();
  validateToolSyntax();
  validateJavascriptSyntax();
  validateJavascriptSurface();
  validateWrapperHygiene();
  validateCanonicalRenderAssignments();
  validateOrdinaryFunctionReassignments();
  validateCssSurface();

  for (const message of notes) console.log(`✓ ${message}`);
  if (failures.length) {
    console.error('\nStatic validation failed:');
    for (const message of failures) console.error(`- ${message}`);
    process.exit(1);
  }
  console.log('✓ node --check app.js and tools');
  console.log('✓ CSS brace balance');
  console.log('✓ no ordinary app-level version-stamped identifiers/classes detected');
  console.log('✓ no public scaffold/debug markers detected');
  console.log('✓ root package markdown is intentional');
  console.log('✓ packaged continuity markdown has pinned schema links and non-placeholder integrity values');
  console.log('✓ embedded default workspace mirrors packaged workspace markdown');
  console.log('\nStatic validation passed. Browser golden-flow validation is still required for UI behavior.');
}

main();
