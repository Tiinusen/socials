#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ARCHITECTURE_BOUNDARIES, architectureLayerForPath } from '../src/architecture/boundaries.mjs';
import { normalizeLineEndings, shortText, splitNonEmptyLines, trimOuterBlankLines } from '../src/core/text.mjs';
import { canonicalWorkspacePath, dirname, fileNameFromPath, joinPath, normalizeAssetPath, relativePath, slugify } from '../src/core/path.mjs';
import { extractBodySections, parseMarkdownLink, plainBlock, sectionMap, singleFieldFromBullet, stripBodyTitle, stripMarkdownInline, stripTrailingBodySeparator } from '../src/core/markdown.mjs';
import { schemaBadgeClass, schemaIdFromText, schemaKey } from '../src/core/schema.mjs';
import { readJson, removeKeysWithPrefix, textByteLength, writeJson } from '../src/services/storage.mjs';
import { createGitNativeSourceAdapter, defaultArtifactPathMatch, gitRemoteUrlFromSource, parseGitFilePermalink } from '../src/services/git-native-source-adapter.mjs';
import { localStateAssetIsPersistent, localStateDataKey, localStateFileIsPersistent, localStateJsonSize, localStateSlug, makeLocalStateId, serializeAssetForLocalState, serializeFileForLocalState, workspaceHasLocalStateContent } from '../src/state/local-workspace.mjs';
import { escapeAttr, escapeHtml, safeUrl } from '../src/ui/html.mjs';
import { attachmentFileExtension, attachmentMetaChips, humanSize, shortMime } from '../src/ui/evidence-attachments.mjs';
import { renderPreviewSections } from '../src/ui/preview.mjs';
import { decorateLensSource, discoveryScrollSignature, normalizedHistoryKind, preferredStoredScrollModes, routeDescriptorFor, shouldApplyLens, shouldPreserveStoredScrollOnZeroWrite, shouldRejectDiscoveryScroll, stripVolatileLensState } from '../src/viewstate/lens.mjs';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
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

const WALK_IGNORED_DIRECTORIES = new Set(['.git']);

function walk(dir, output = []) {
  for (const entry of readdirSync(dir)) {
    if (WALK_IGNORED_DIRECTORIES.has(entry)) continue;
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
    'src/architecture/boundaries.mjs',
    'src/core/text.mjs',
    'src/core/path.mjs',
    'src/core/markdown.mjs',
    'src/core/schema.mjs',
    'src/app/core-runtime.js',
    'src/app/services-runtime.js',
    'src/app/state-runtime.js',
    'src/app/ui-runtime.js',
    'src/app/viewstate-runtime.js',
    'src/services/storage.mjs',
    'src/services/git-source-adapter.mjs',
    'src/services/git-native-source-adapter.mjs',
    'src/services/repo-fetch-diagnostics.mjs',
    'src/state/local-workspace.mjs',
    'src/ui/html.mjs',
    'src/ui/evidence-attachments.mjs',
    'src/ui/preview.mjs',
    'src/viewstate/lens.mjs',
    'tools/build-public.mjs',
    'tools/check-public-build.mjs',
    '.github/workflows/publish-public.yml',
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
  const expected = new Set(['README.md', 'tiinex.app.llm.v1.md', 'tiinex.context.v1.md', 'tiinex.orientation.v1.md', 'VALIDATION_NOTES.md']);
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

function sourceModulePaths() {
  const srcRoot = file('src');
  return walk(srcRoot)
    .map((full) => relative(root, full).replace(/\\/g, '/'))
    .filter((path) => path.endsWith('.mjs') || path.endsWith('.js'))
    .sort();
}

function validateSourceModuleSyntax() {
  const modulePaths = sourceModulePaths();
  for (const path of modulePaths) {
    const result = spawnSync(process.execPath, ['--check', file(path)], { encoding: 'utf8' });
    if (result.status !== 0) fail(`node --check ${path} failed:\n${result.stderr || result.stdout}`.trim());
  }
  note(`source module syntax checked: ${modulePaths.join(', ')}`);
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


function validateWizardArchitecture() {
  const js = read('app.js');
  const forbidden = [
    'registerOpenArtifactWizardWrapper',
    'registerWizardPathForWrapper',
    'registerWizardDescribeStepWrapper',
    'registeredOpenArtifactWizardWrapper',
    'registeredWizardPathForWrapper',
    'registeredWizardDescribeStepWrapper'
  ].filter((token) => js.includes(token));
  if (forbidden.length) {
    fail(`Wizard opener/path/describe behavior must not use wrapper stacks: ${forbidden.join(', ')}`);
  }
  const requiredTokens = [
    'const WIZARD_SCHEMA_REQUIRED_KEYS',
    'const WIZARD_SCHEMA_PUBLIC_KEYS',
    'function validateWizardSchemaRegistryContract',
    'function freezeWizardSchemaRegistry',
    'const WIZARD_SCHEMA_REGISTRY = freezeWizardSchemaRegistry',
    'const SCHEMA_CREATE_POLICY_REQUIRED_KEYS',
    'const SCHEMA_CREATE_POLICY_ORDER',
    'const SCHEMA_CREATE_POLICY_MANUAL_CREATABILITY',
    'const SCHEMA_CREATE_POLICY_RELATIONSHIP_CREATABILITY',
    'const SCHEMA_CREATE_POLICY_UI_SURFACES',
    'const TIINEX_SCHEMA_PERMALINK_COMMIT',
    'const TIINEX_VALIDATOR_PERMALINK_COMMIT',
    'const TIINEX_SHA256_C14N_VALIDATOR_URL',
    'function validationMethodEntryLabel',
    'function validateSchemaCreatePolicyRegistryContract',
    'const SCHEMA_CREATE_POLICY_REGISTRY = freezeSchemaCreatePolicyRegistry',
    'function schemaCreatePolicy',
    'function schemaPermalink',
    'function policyAllowsOrdinaryWizardSchema',
    'function policyKnownSchemaId',
    'function optionFromWizardSchemaDefinition',
    'function wizardSchemaDefinition',
    'function schemaFormFor',
    'function bodyFromForm',
    'function formStateFromNode'
  ];
  const missing = requiredTokens.filter((token) => !js.includes(token));
  if (missing.length) {
    fail(`Wizard schema registry contract is incomplete: ${missing.join(', ')}`);
  }
  const stalePolicyTokens = [
    'SCHEMA_CREATE_POLICY_CREATABILITY',
    'SCHEMA_CREATE_POLICY_SURFACES',
    'def.creatability',
    'def.wizardSurface',
    'support-only',
    'runtime-only',
    'governance-only',
    'recovery-only',
    'not-created',
    'current-wizard',
    'contextual',
    'discouraged'
  ].filter((token) => js.includes(token));
  if (stalePolicyTokens.length) {
    fail(`Schema create policy must keep schema-facing docs vocabulary separate from UI surface policy: ${stalePolicyTokens.join(', ')}`);
  }

  const policyOrderMatch = js.match(/const\s+SCHEMA_CREATE_POLICY_ORDER\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\);/);
  const policyFamiliesMatch = js.match(/const\s+SCHEMA_CREATE_POLICY_FAMILIES\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\);/);
  const policyRegistryMatch = js.match(/const\s+SCHEMA_CREATE_POLICY_REGISTRY\s*=\s*freezeSchemaCreatePolicyRegistry\(\{([\s\S]*?)\},\s*SCHEMA_CREATE_POLICY_ORDER\);/);
  if (!policyOrderMatch || !policyFamiliesMatch || !policyRegistryMatch) {
    fail('Schema create policy registry, order, and families must be statically discoverable.');
  } else {
    const quoted = (text) => [...text.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    const orderIds = quoted(policyOrderMatch[1]);
    const orderSet = new Set(orderIds);
    const familySet = new Set(quoted(policyFamiliesMatch[1]));
    const registryIds = [...policyRegistryMatch[1].matchAll(/^\s*'([^']+)'\s*:\s*schemaPolicyEntry/gm)].map((match) => match[1]);
    const registryFamilyPairs = [...policyRegistryMatch[1].matchAll(/schemaPolicyEntry\('([^']+)'\s*,\s*'[^']+'\s*,\s*'([^']+)'/g)].map((match) => ({ id: match[1], family: match[2] }));
    const missingFromOrder = registryIds.filter((id) => !orderSet.has(id));
    const missingFromRegistry = orderIds.filter((id) => !registryIds.includes(id));
    const unsupportedFamilies = registryFamilyPairs.filter((entry) => !familySet.has(entry.family));
    if (missingFromOrder.length) fail(`Schema create policy entries missing from order: ${missingFromOrder.join(', ')}`);
    if (missingFromRegistry.length) fail(`Schema create policy order entries missing from registry: ${missingFromRegistry.join(', ')}`);
    if (unsupportedFamilies.length) fail(`Schema create policy entries use unsupported families: ${unsupportedFamilies.map((entry) => `${entry.id}:${entry.family}`).join(', ')}`);
    if (!familySet.has('discovery-family') || !familySet.has('resource-family') || !familySet.has('instrument-family')) {
      fail('Schema create policy families must include discovery-family, resource-family, and instrument-family.');
    }
  }
  if (!js.includes("'manuallyCreatable',") || !js.includes("'creatableAsContinuation',") || !js.includes("'creatableAsReference',") || !js.includes("'uiSurface',")) {
    fail('Schema create policy must expose schema-facing creatability fields separately from uiSurface.');
  }
  if (!js.includes(".filter((id) => policyAllowsOrdinaryWizardSchema(id))")) {
    fail('humanSchemaOptions must derive ordinary Type-step choices from schema create policy.');
  }
  if (!js.includes("if (def && policyAllowsOrdinaryWizardSchema(def.id))")) {
    fail('schemaOptionById must reject schemas that are not allowed by ordinary wizard policy.');
  }
  if (!js.includes('if (!policyKnownSchemaId(id)) return') || !js.includes('return schemaCreatePolicy(id).schemaPath')) {
    fail('schemaArtifactPath must use the schema create policy registry rather than only wizard-visible schema ids.');
  }
  if (!js.includes("'schemaPermalink',") || !js.includes('schemaCreatePolicy(id).schemaPath') || !js.includes('policy?.schemaPermalink')) {
    fail('Generated schema references must prefer policy-owned commit-pinned schema permalinks when available.');
  }
  if (/function schemaReferenceForPath[\s\S]*relativePathFromTo[\s\S]*return `\[\$\{id\}\]\(\$\{relative \|\| schemaPath\}\)`/.test(js) && !/function schemaReferenceForPath[\s\S]*schemaPermalink/.test(js)) {
    fail('schemaReferenceForPath must not fall back to relative schema paths before checking pinned schema permalinks.');
  }

  const artifactRegistryTokens = [
    'const TIINEX_MARKDOWN_ARTIFACT_REGISTRY',
    "suffix: '.trace.md'",
    "suffix: '.schema.md'",
    "suffix: '.workspace.md'",
    "suffix: '.validator.md'",
    "suffix: '.adapter.md'",
    "suffix: '.origin.md'",
    "suffix: '.tool.md'",
    "suffix: '.interface.md'",
    'function isValidatorPath',
    'function tiinexArtifactDefinitionForPath(value)',
    'function pathsByTiinexArtifactKind(paths)',
    'artifactPathsByKind',
    'validatorPaths',
    'adapterPaths',
    'originPaths',
    'toolPaths',
    'interfacePaths',
    'data-artifact-display-filter',
    'renderArtifactDisplayFilterSelect',
    'Artifact category'
  ];
  for (const token of artifactRegistryTokens) {
    if (!js.includes(token)) fail(`Registry-driven artifact discovery/display contract missing app token: ${token}`);
  }
  if (!js.includes('function isTiinexMarkdownArtifactPath(value)') || !js.includes('return Boolean(tiinexArtifactDefinitionForPath(value));')) {
    fail('Tiinex markdown artifact suffix ownership must be centralized in TIINEX_MARKDOWN_ARTIFACT_REGISTRY.');
  }
  if (js.includes('Show .schema.md') || js.includes('Show .validator.md') || js.includes('Show .workspace.md')) {
    fail('Display Options must not render one hard-coded checkbox per artifact suffix.');
  }
  if (!js.includes('function pathLooksUsefulLineageArtifact(path) {\n    return isTiinexMarkdownArtifactPath(path);')
    || !js.includes('function isLineageArtifactPath(value) {\n    return isTiinexMarkdownArtifactPath(value);')
    || !js.includes('function isIndexableTiinexMarkdownPath(path) {\n    return isTiinexMarkdownArtifactPath(path);')) {
    fail('Lineage/discovery/indexing suffix helpers must delegate to the canonical Tiinex markdown artifact suffix helper.');
  }
  if (js.includes('data-action="refresh-discovery"') || js.includes('function renderGitHubDiscoveryRefreshButton')) {
    fail('GitHub discovery must not expose a separate refresh button for validator discovery; origin ingest must load supported artifact suffixes directly.');
  }
  if (/discoverGitHubRepoIntoWorkspace(?:Responsive|Progress)/.test(js) || js.includes('\ndiscoverGitHubRepoIntoWorkspace =') || js.includes('\n  discoverGitHubRepoIntoWorkspace =')) {
    fail('GitHub discovery must have one canonical discoverGitHubRepoIntoWorkspace implementation, not overwritten replacement implementations.');
  }
  if (js.includes('githubTreeApiCorsUnsafe') || js.includes('GitHub API tree discovery is disabled in static file mode')) {
    fail('GitHub discovery must query the GitHub tree origin first so newly committed .validator.md files are visible before static flat-package cache fallback.');
  }
  if (!js.includes("const api = `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(resolvedRef)}?recursive=1`;") || !js.includes('discoverGitHubTracePathsViaJsdelivr(repo, resolvedRef, effectiveRoots)')) {
    fail('GitHub discovery must use the GitHub tree API as primary origin with static flat fallback.');
  }
  const gitSortTokens = [
    'function nodeSortTimestamp(node)',
    'function createdAtMidnightDate(value)',
    'function scheduleGitCommitSortEnrichment(ws)',
    'function fetchGitCommitSortDate(node)',
    'repoCommitDateSortFetchLimit',
    'skipCommitSortEnrichment'
  ];
  for (const token of gitSortTokens) {
    if (!js.includes(token)) fail(`Feed sort git commit-date enrichment missing app token: ${token}`);
  }
  if (!/function\s+compareNodesDesc\(a, b\)\s*{\s*return nodeSortTimestamp\(b\) - nodeSortTimestamp\(a\)/.test(js)) {
    fail('Feed sort must use nodeSortTimestamp so midnight Created At values can be enriched by matching Git commit dates.');
  }
  if (!js.includes('utcDatePart(result.committedAt) === midnightDate') || !js.includes('utcDatePart(committedAt) !== midnightDate')) {
    fail('Git commit-date feed sorting must only override midnight Created At when the commit date matches the markdown date.');
  }
  if (!js.includes('function isStructuralMaterialRef') || !js.includes('if (isStructuralMaterialRef(ref)) continue;')) {
    fail('Referenced Material must exclude structural Tiinex links before openable attachment filtering.');
  }
  if (!js.includes('tiinexArtifactDefinitionForKind(kind)') || !js.includes('isTiinexMarkdownArtifactPath(target)')) {
    fail('Referenced Material must not list registry-owned Tiinex markdown artifacts as generic attachments.');
  }
  if (!js.includes('/^sha256-base64url-c14n-v\\d+$/.test(label)') || !js.includes('commit-pinned permalink|validator artifact|validation method artifact|method definition')) {
    fail('Referenced Material must exclude linked validation-method examples and validator placeholders, not only real .validator.md URLs.');
  }
  const renderMaterialUsesCanonicalRefs = /function\s+renderMaterialSection\(ws, node, opts = \{\}\)\s*\{[\s\S]{0,420}?nodeMaterialRefs\(ws, node\)/u.test(js);
  const materialBadgesUseCanonicalRefs = /function\s+materialSchemaBadges\(ws, node\)\s*\{[\s\S]{0,180}?nodeMaterialRefs\(ws, node\)/u.test(js);
  if (!renderMaterialUsesCanonicalRefs || !materialBadgesUseCanonicalRefs) {
    fail('Rendered material sections and material badges must use the canonical nodeMaterialRefs pipeline so wrappers apply consistently.');
  }
  if (!js.includes('function insertPreviewMaterialAfterPostMain(html, material)') || js.includes("const insertAfterMain = html.indexOf('</div>')") || js.includes("const firstClose = html.indexOf('</div>')")) {
    fail('Preview material sections must be inserted after the post-main click target, not inside the selectable card body.');
  }
  if (!js.includes("if (action === 'open-material-lightbox') {\n      event.preventDefault();\n      event.stopPropagation();")
    || !js.includes("if (action === 'open-material-preview') {\n      event.preventDefault();\n      event.stopPropagation();")) {
    fail('Material preview actions must stop event propagation so preview does not also select or anchor the card.');
  }
  const materialWrapperCalls = (js.match(/registerNodeMaterialRefsWrapper\s*\(function/g) || []).length;
  if (materialWrapperCalls !== 1) {
    fail(`Referenced Material must have one canonical wrapper owner; found ${materialWrapperCalls}.`);
  }
  const structuralMaterialActions = ['load-material-trace', 'open-trace-reference', 'external-trace', 'confirm-open-external-trace'];
  const structuralMaterialHits = structuralMaterialActions.filter((token) => js.includes(token));
  if (structuralMaterialHits.length) {
    fail(`Structural Tiinex navigation must not be owned by Referenced Material actions: ${structuralMaterialHits.join(', ')}`);
  }
  if (!js.includes("total} attachment") || js.includes('counts.validator) bits.push') || js.includes('counts.schema) bits.push') || js.includes('counts.trace) bits.push')) {
    fail('Referenced Material summary must describe attachments, not schema/validator/trace structural references.');
  }
  if (/action === 'wizard-next-step'[\s\S]{0,180}setRouteState\('push'\)/.test(js) || /action === 'wizard-set-step'[\s\S]{0,180}setRouteState\('push'\)/.test(js)) {
    fail('Wizard step navigation must replace route state so saving an artifact does not leave an older dialog route behind browser Back.');
  }
  if (!js.includes('validationMethodIdFromLabel') || !js.includes('methodHref') || !js.includes('methodDefinitionUrl')) {
    fail('Integrity parser must preserve linked validation method entries while normalizing the method id.');
  }

  if (!js.includes('methodDefinitionChipHtml(node)') || !js.includes('method-definition-lineage-post')) {
    fail('Validation method definition artifacts must be visibly distinct from ordinary content cards.');
  }
  if (!js.includes('open-integrity-method-definition') || !js.includes('copy-integrity-method-definition')) {
    fail('Integrity diagnostics must expose direct method-definition open/copy actions.');
  }
  if (!js.includes('byteIntegrityAuditLabel(status)') || !js.includes('schemaAuthorityLabelForNode(node)')) {
    fail('Integrity diagnostics must distinguish byte-integrity result, method-definition availability, and schema authority.');
  }

  const ordinaryWizardPolicies = [...js.matchAll(new RegExp("schemaPolicyEntry\\('[^']+', '[^']+', '[^']+', [^,]+, '[^']+', '([^']+)', '([^']+)', '([^']+)', 'ordinary-wizard'", 'g'))];
  const nonOrdinaryManualPolicies = ordinaryWizardPolicies.filter((match) => match[1] !== 'yes');
  if (nonOrdinaryManualPolicies.length) {
    fail('ordinary-wizard UI policy requires Manually Creatable: yes.');
  }
  for (const id of ['tiinex.workspace.v1', 'raw']) {
    const ordinaryPattern = new RegExp(`${escapeRegExp(id)}[\\s\\S]{0,180}ordinary-wizard`);
    if (ordinaryPattern.test(js)) fail(`${id} must not appear as an ordinary wizard schema card.`);
  }


  const staleRegistryFunctions = [
    'function bodyTemplates',
    'function schemaFormDefinitions',
    'function buildTraceMarkdown',
    'function generateTraceFromModal',
    'function wizardRelationCardInitial'
  ].filter((token) => js.includes(token));
  if (staleRegistryFunctions.length) {
    fail(`Stale wizard/create switch-table functions found: ${staleRegistryFunctions.join(', ')}`);
  }
  const wizardSelectSchemaHandlers = (js.match(/if \(action === 'wizard-select-schema'\)/g) || []).length;
  if (wizardSelectSchemaHandlers !== 1) {
    fail(`wizard-select-schema must have exactly one action handler; found ${wizardSelectSchemaHandlers}.`);
  }
  if (js.includes('function wizardContextStrip')) {
    fail('Wizard relation context must live in the header via wizardHeaderContext, not body-level wizardContextStrip.');
  }
  if (!js.includes('function wizardHeaderContext')) {
    fail('Wizard relation context must use header-level wizardHeaderContext.');
  }
  const css = read('styles.css');
  const staleWizardBodyContext = [
    'wizard-context-strip',
    'wizard-context-chip',
    'wizard-relation-card'
  ].filter((token) => css.includes(token) || js.includes(token));
  if (staleWizardBodyContext.length) {
    fail(`Stale wizard body relation context found: ${staleWizardBodyContext.join(', ')}`);
  }
  if (!css.includes('wizard-header-context')) {
    fail('Wizard header relation context styles are missing.');
  }
  if (!css.includes('asset-image-preview-body') || !css.includes('overflow: hidden !important') || !css.includes('max-height: 100% !important')) {
    fail('Image attachment previews must contain images inside the dialog viewport without introducing inner image scroll.');
  }
  const policyIds = [
    'tiinex.relation.v1',
    'tiinex.validation.method.v1',
    'tiinex.schema.family.v1',
    'tiinex.attestation.v1',
    'tiinex.external.payload.v1',
    'tiinex.privacy.boundary.v1',
    'tiinex.consent.v1',
    'tiinex.redaction.v1',
    'tiinex.traversal.runtime.v1',
    'tiinex.quantum.traversal.runtime.v1'
  ];
  const missingPolicyIds = policyIds.filter((id) => !js.includes(`'${id}': schemaPolicyEntry(`));
  if (missingPolicyIds.length) {
    fail(`Schema create policy registry is missing newly maintained schema ids: ${missingPolicyIds.join(', ')}`);
  }
  if (!js.includes("'tiinex.quantum.traversal.runtime.v1', 'Quantum Traversal Runtime', 'traversal-runtime', 'tiinex.traversal.runtime.v1'")) {
    fail('Quantum traversal runtime create policy must remain child-scoped under traversal.runtime.');
  }
  note('wizard architecture uses direct services, header-level context, registry contract guards, and schema create-policy metadata');
}

function validateGitHubRecoveredContinuityContract() {
  const js = read('app.js');
  const requiredTokens = [
    'function recoveredTiinexArtifactParentDisposition',
    'function materializeRecoveredTiinexArtifactMarkdown',
    'function githubRecoveredContinuityRegressionReport',
    "mode: 'preserved-unresolved-parent'",
    "reason: 'github-issue-import'",
    "githubIssueImportTrace('issue-thread-loader.parent-reconciliation'",
    'githubParentMaterializationMode: materialized.mode',
    "githubParentMaterializationMode: 'resolved-parent'",
    "reason: 'continuity loss: unresolved-known recovery no longer contains its declared Parent block'"
  ];
  for (const token of requiredTokens) {
    if (!js.includes(token)) fail(`GitHub recovered continuity contract missing app token: ${token}`);
  }
  const materializerCalls = (js.match(/materializeRecoveredTiinexArtifactMarkdown\(/g) || []).length;
  if (materializerCalls < 3) {
    fail('GitHub issue body and comment recovery must share one materialization owner.');
  }
  if (js.includes('markdownWithSelfIntegrity(stripContinuityParentBlock(embeddedIssue))')) {
    fail('GitHub issue recovery must not strip an unresolved declared Parent and reseal it as a root.');
  }
  const stripParentCalls = (js.match(/stripContinuityParentBlock\(/g) || []).length;
  if (stripParentCalls !== 2) {
    fail(`Parent stripping must remain owned by the helper definition and explicit root/detach save path; found ${stripParentCalls} references.`);
  }
  if (!/resolveAdapterParentTraversalForWorkspace\(ws,\s*\{[\s\S]{0,220}?sourceId:\s*source\.id/u.test(js)) {
    fail('GitHub issue import must run source-bounded parent reconciliation after all issue artifacts are indexed.');
  }
  if (js.includes("resolveAdapterParentTraversalForWorkspace(ws, { reason: options.reason || 'public-link-open'")) {
    fail('Public hash loading must not rerun parent traversal after the issue loader has already reconciled that snapshot.');
  }
  note('GitHub recovered continuity preserves unresolved Parent declarations and reconciles each issue snapshot once');
}

function validateRenderBoundaryArchitecture() {
  const js = read('app.js');
  const css = read('styles.css');
  const required = [
    'function renderChromeSignature',
    'function renderFullAppHtml',
    'function patchRender',
    'function renderWorkspaceGridHtml',
    'function renderModalRootHtml',
    'root.dataset.renderChromeSignature',
    'root.dataset.renderBoundary'
  ];
  const missing = required.filter((token) => !js.includes(token));
  if (missing.length) {
    fail(`Render boundary architecture is incomplete: ${missing.join(', ')}`);
  }
  if (!js.includes('<div id="modal-root" class="modal-root">')) {
    fail('Modal content must render through #modal-root so it can be patched without replacing the full app shell.');
  }
  if (!css.includes('.modal-root') || !css.includes('display: contents')) {
    fail('The modal-root outlet must be layout-neutral via display: contents.');
  }
  note('render boundary supports chrome-preserving workspace/modal patches');
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
  const parkedTargets = new Set(['rememberLensScroll', 'enhanceLensSource', 'applyCurrentOrCachedLens', 'persistLensState']);
  const nonParked = ordinary
    .filter((entry) => !parkedTargets.has(entry.target))
    .map((entry) => `${entry.target}->${entry.replacement}@${entry.line}`);
  if (nonParked.length) {
    fail(`Ordinary reassignments outside parked scroll/viewState surface found: ${nonParked.join(', ')}`);
  }
  note(`ordinary function reassignment inventory: ${ordinary.length}/${allowedKeys.size}; parked scroll/viewState only`);
}

function validateArchitectureProductReadiness() {
  const docs = {
    'README.md': read('README.md'),
    'VALIDATION_NOTES.md': read('VALIDATION_NOTES.md'),
    'tiinex.app.llm.v1.md': read('tiinex.app.llm.v1.md'),
  };
  for (const [path, text] of Object.entries(docs)) {
    if (!text.includes('architectureReadyForProductWork')) {
      fail(`${path} must mention architectureReadyForProductWork so future work has a single readiness signal`);
    }
  }
  const expectedSignals = [
    'architectureScaffoldReady',
    'coreExtractionReady',
    'serviceStateExtractionReady',
    'uiFeatureExtractionReady',
    'viewStateIsolationReady',
    'publicBuildReady',
    'cleanupReadyForProductWork',
  ];
  for (const signal of expectedSignals) {
    if (!docs['README.md'].includes(signal) || !docs['VALIDATION_NOTES.md'].includes(signal)) {
      fail(`Architecture readiness docs must keep ${signal} visible in README.md and VALIDATION_NOTES.md`);
    }
  }
  note('architecture product-readiness signal is documented');
}

async function validateGitSourceAdapterResearchContract() {
  const gitSource = read('src/services/git-source-adapter.mjs');
  const gitNative = read('src/services/git-native-source-adapter.mjs');
  const browserGitNative = read('src/app/git-native-runtime.js');
  const repoDiag = read('src/services/repo-fetch-diagnostics.mjs');
  const appJs = read('app.js');
  for (const token of [
    'GIT_SOURCE_ADAPTER_CONTRACT',
    'local-object-store-first',
    'time-portal-aware',
    'permalink-as-recovery-anchor-not-primary-read-path',
    'repoFiles',
    'issueSnapshots',
    'resolveParentFromLocalObjects'
  ]) {
    if (!gitSource.includes(token)) fail(`Git source adapter research contract missing ${token}`);
  }
  for (const token of [
    'GIT_NATIVE_ADAPTER_CAPABILITY',
    'createGitNativeSourceAdapter',
    'local-git-object-store-first',
    'readBlobAt',
    'resolveParentFromLocalObjects',
    'hiddenProxy: false'
  ]) {
    if (!gitNative.includes(token)) fail(`Git native source adapter missing ${token}`);
  }
  for (const token of ['emptyRepoFetchDiagnostics', 'summarizeRepoFetchEvents', 'repoFetchDiscoveryVerdict']) {
    if (!repoDiag.includes(token)) fail(`Repo fetch diagnostics module missing ${token}`);
  }
  for (const token of ['TiinexGitNativeRuntime', 'cloneLab', 'ensureRuntime', 'explicitVendorLoad', 'bufferModuleUrl', 'Missing Buffer dependency', 'GitHub browser git clone needs an explicit CORS proxy']) {
    if (!browserGitNative.includes(token)) fail(`Browser Git-native runtime bridge missing ${token}`);
  }
  for (const token of [
    'githubRepoFetchTrace',
    'githubRepoFetchSummary',
    'githubRepoFetchTraceJson',
    'gitNativeRuntimeStatus',
    'gitNativeCloneLab',
    'skipGitNativeRawBridge',
    'git-native-raw-bridge',
    'session.start',
    'raw.request',
    'raw.success',
    'raw.failed'
  ]) {
    if (!appJs.includes(token)) fail(`GitHub repo fetch observability missing app token: ${token}`);
  }
  const remote = gitRemoteUrlFromSource({ repo: 'Tiinex/docs' });
  if (remote !== 'https://github.com/Tiinex/docs.git') fail(`Git native remote URL normalization failed: ${remote}`);
  const parsed = parseGitFilePermalink('https://github.com/Tiinex/docs/blob/1234567890abcdef/.topics/demo/001.trace.md');
  if (!parsed || parsed.repo !== 'Tiinex/docs' || parsed.path !== '.topics/demo/001.trace.md' || parsed.commit !== '1234567890abcdef') {
    fail('Git native permalink parser did not preserve repo/ref/path/commit');
  }
  if (!defaultArtifactPathMatch('.topics/demo/001.trace.md')) fail('Git native artifact matcher must accept .topics markdown artifacts');

  const fakeGit = {
    async resolveRef() { return 'abc123def456'; },
    async listFiles() { return ['README.md', '.topics/demo/001.trace.md', '.topics/demo/note.txt', '.topics/demo/schema.schema.md']; },
    async readBlob({ filepath }) { return { blob: new TextEncoder().encode(`content:${filepath}`) }; }
  };
  const adapter = createGitNativeSourceAdapter({ git: fakeGit, fs: {}, dir: '/repo' });
  const snapshot = await adapter.acquireSnapshot({ repo: 'Tiinex/docs', ref: 'master', rootPaths: ['.topics'] });
  const candidates = await adapter.listArtifactCandidates(snapshot);
  if (snapshot.commit !== 'abc123def456' || candidates.length !== 2 || !candidates.includes('.topics/demo/001.trace.md')) {
    fail('Git native adapter fake-runtime contract failed candidate listing');
  }
  const text = await adapter.readFile('.topics/demo/001.trace.md', snapshot);
  if (text !== 'content:.topics/demo/001.trace.md') fail('Git native adapter fake-runtime readFile contract failed');
  const caps = adapter.reportCapabilities();
  if (!caps.runtimeAvailable || !caps.canResolveRef || !caps.canReadBlobAt || caps.usesHiddenProxy) fail('Git native adapter capability report is incorrect');
  note('git source adapter research spine, git-native runtime spine, and repo fetch diagnostics are present');
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

  if (js.includes('data-mode="issue"') || js.includes('Add issue thread')) {
    fail('GitHub issue discovery must be owned by the GitHub source/community UX, not a separate Add-flow source.');
  }
  const githubSourceUxTokens = [
    ['Repo files discovery'],
    ['Issue snapshot discovery', 'Issue/discussion discovery'],
    ['openEditSourceModal'],
    ['enabledSurfaces']
  ];
  for (const variants of githubSourceUxTokens) {
    if (!variants.some((token) => js.includes(token))) fail(`Canonical GitHub source/community UX missing token: ${variants[0]}`);
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

  const obsoleteStorageTokens = [
    'tiinex-viewer-authors',
    'tiinex.localWorkspace.registry.v1',
    'tiinex.localWorkspace.state.v1',
    'tiinex-scroll:',
    'tiinex-lens:'
  ];
  const obsoleteStorageHits = obsoleteStorageTokens.filter((token) => js.includes(token));
  if (obsoleteStorageHits.length) {
    fail(`Obsolete browser storage key tokens found: ${obsoleteStorageHits.join(', ')}`);
  }

  const obsoleteRouteScrollStateTokens = [
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
  ];
  const obsoleteRouteScrollHits = obsoleteRouteScrollStateTokens.filter((token) => countTokenReferences(js, token) > 0);
  if (obsoleteRouteScrollHits.length) {
    fail(`Obsolete route-scroll-state tokens found: ${obsoleteRouteScrollHits.join(', ')}`);
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


function validateMobileActionOwnership() {
  const js = read('app.js');
  if (!/function\s+genericMobileActionOwnsButton\s*\(\s*button\s*\)/.test(js)) {
    fail('Mobile generic action dispatcher must declare genericMobileActionOwnsButton(button).');
  }
  if (!js.includes(".mobile-global-actions-host, .mobile-action-backdrop")) {
    fail('Mobile generic action ownership must be scoped to global FAB host and mobile action sheet only. Top rail actions need their own handler.');
  }
  if (!js.includes('if (!button || !genericMobileActionOwnsButton(button)) return;')) {
    fail('mobileOnlyActionClick must ignore mobile actions it does not own before preventing propagation.');
  }
  const broadDispatcherPattern = /function\s+mobileOnlyActionClick\s*\([\s\S]*?const\s+button\s*=\s*event\.target\?\.closest\?\.\('\[data-mobile-action\]'\);\s*if\s*\(\s*!button\s*\)\s*return;[\s\S]*?event\.preventDefault\s*\(/;
  if (broadDispatcherPattern.test(js)) {
    fail('mobileOnlyActionClick must not claim every [data-mobile-action]. Mobile top rail actions must remain owned by mobileTopRailClick.');
  }
}

function validateCssSurface() {
  const css = read('styles.css');
  const balance = countCssBraceBalance(css);
  if (balance !== 0) fail(`CSS brace balance failed: ${balance}`);

  const versionedCss = [...css.matchAll(/(?:^|[^A-Za-z0-9_-])(?:v\d{2,}[-_][A-Za-z0-9_-]+|[A-Za-z0-9_-]+[-_]v\d{2,})(?=$|[^A-Za-z0-9_-])/gi)].map((m) => m[0].trim());
  if (versionedCss.length) fail(`Version-stamped CSS tokens found: ${[...new Set(versionedCss)].slice(0, 20).join(', ')}`);
}


function validateNoInlineCodeHistory() {
  const appJs = read('app.js');
  const blockedPatterns = [
    [/\bCP\d{2,}\b/u, 'checkpoint marker'],
    [/\bpre-CP\d{2,}\b/u, 'pre-checkpoint marker'],
    [/\bpost-CP\d{2,}\b/u, 'post-checkpoint marker'],
    [/\bretired\b/iu, 'retired wording'],
    [/\blegacy\b/iu, 'legacy wording'],
    [/\bno-op\b/iu, 'no-op wording'],
    [/avoid broad surgery/iu, 'broad-surgery wording']
  ];
  for (const [pattern, label] of blockedPatterns) {
    if (pattern.test(appJs)) fail(`Inline implementation history should not ship in app.js: ${label}`);
  }
}

function validateNoScaffoldMarkers() {
  const checkedFiles = [
    'app.js',
    'styles.css',
    ...sourceModulePaths(),
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
  const validatorLinkPattern = /https:\/\/github\.com\/Tiinex\/docs\/blob\/(?:master|main)\/\.topics\/\.validators\/[^)\s]+\.validator\.md/gu;
  const placeholderPattern = /^\s*-\s+Value:\s+(?:pending|test|placeholder|todo)\s*$/imu;
  const relativeSchemaLinkPattern = /\[[^\]]+\]\((?:\.\.?\/?|\.topics\/)\.?topics?\/?\.schemas\/tiinex\.[^)]+\.schema\.md\)|\[[^\]]+\]\((?:\.\.\/)*\.schemas\/tiinex\.[^)]+\.schema\.md\)/gu;
  for (const path of markdownFiles) {
    const text = read(path);
    if (placeholderPattern.test(text)) placeholderHits.push(path);
    const matches = [...text.matchAll(schemaLinkPattern)].map((match) => match[0]);
    for (const target of matches) unpinnedSchemaHits.push(`${path} -> ${target}`);
    const validatorMatches = [...text.matchAll(validatorLinkPattern)].map((match) => match[0]);
    for (const target of validatorMatches) unpinnedSchemaHits.push(`${path} -> ${target}`);
    const relativeMatches = [...text.matchAll(relativeSchemaLinkPattern)].map((match) => match[0]);
    for (const target of relativeMatches) unpinnedSchemaHits.push(`${path} -> ${target}`);
  }
  if (placeholderHits.length) {
    fail(`Packaged continuity markdown contains placeholder integrity values: ${placeholderHits.join(', ')}`);
  }
  if (unpinnedSchemaHits.length) {
    fail(`Packaged schema links must be commit-pinned, not master/main: ${unpinnedSchemaHits.slice(0, 20).join(', ')}`);
  }
}

function validateIntegrityLifecycleUxContract() {
  const js = read('app.js');
  const css = read('styles.css');
  if (/integrityFooter\([^\n)]*['"]pending['"]/.test(js)) {
    fail('Generated artifact integrity footers must not use Value: pending. Empty footer means no claim.');
  }
  if (/# Continuity Integrity[\s\S]{0,180}-\s+Value:\s+pending/.test(js)) {
    fail('App-generated continuity integrity output must not contain Value: pending.');
  }
  const requiredTokens = [
    'draft-pending',
    'malformed-claim',
    'method-unsupported',
    'target-unavailable',
    'target-ambiguous',
    'byte-integrity-verified',
    'What this does not verify',
    'canOpenIntegrityDiagnostics(node)',
    'markdownWithSelfIntegrity',
    'markdownWithParentTargetIntegrity',
    'finalizeCreatedArtifactIntegrity',
    'finalizeSavedLocalIntegrity',
    'Method definition',
    'Validation method authority',
    'Method Definition Availability',
    'Byte integrity result',
    'Claim Lifecycle',
    'Finality',
    'Export Readiness',
    'exportFileWithIntegrityRefresh',
    'exportIntegritySummaryLine',
    'archiveZipCryptoBlob',
    'assertZipCryptoArchiveBlob',
    'data-field="exportPassword"',
    'Downloaded password-protected zip',
    'Windows-compatible ZIP password protects file contents',
    'function buildExportPlan',
    'function buildPackageResult',
    'function showExportResult',
    'function renderExportResultModal',
    'copy-export-summary',
    'ORIGIN_ADAPTER_CONTRACTS',
    'ORIGIN_ADAPTER_CAPABILITY_KEYS',
    'ORIGIN_ADAPTER_GUARANTEE_KEYS',
    'originAdapterSummary',
    'parseGitHubIssueSpec',
    'loadGitHubIssueIntoWorkspace',
    'issueContributionParseLevel',
    'issueContributionIntent',
    'githubIssueCommentMarkdown',
    'GitHub issue social origin',
    'feedback/proposal only',
    'sha256-base64url-text-v1',
    'client-side · no telemetry',
    'Claim lifecycle',
    'Draft / no integrity claim',
    'valid draft/local state',
    'not final byte-integrity verified',
    'Schema authority',
    'renderIntegrityLinkKv',
    'renderIntegrityMethodAuthority',
    'validationMethodDefinitionUrl',
    'validationMethodDefinitionStatus',
    'findValidationMethodDefinitionNode',
    'copyIntegrityMethodDefinitionLink',
    'openIntegrityMethodDefinitionFromDiagnostics',
    'function parseIntegrityEntries',
    'function preferredIntegrityEntry',
    'function integrityEntryCountLabel',
    'function integrityEntryAuditDetails',
    'function renderIntegrityValidationEntries',
    'Validation Entries',
    'Validation Entry Audit',
    'active-byte-integrity-entry',
    'Ready for browser evaluation',
    'resultStatus',
    'duplicate target entry',
    'integrityEntrySummary'
  ];
  for (const token of requiredTokens) {
    if (!js.includes(token)) fail(`Integrity lifecycle/diagnostics contract missing app token: ${token}`);
  }
  if (/upsertWorkspaceTextFile\(ws, path, artifact\.text, 'local'\)/.test(js)) {
    fail('Wizard direct create must finalize minimum integrity before saving local artifact text.');
  }
  if (/upsertWorkspaceTextFile\(ws, path, text, 'local'\)/.test(js)) {
    fail('Manual add flow must finalize minimum integrity before saving local artifact text.');
  }
  if (js.split(/\r?\n/).some((line) => line.includes('createArtifactFromWizard(ws, app.modal);') && !line.includes('await createArtifactFromWizard'))) {
    fail('Wizard direct create must await async integrity finalization.');
  }
  if (/const canOpenDiagnostics = integrityHasClaim\(node\.integrity\)/.test(js)) {
    fail('Integrity badges must open diagnostics for no-claim/draft states, not only claimed footer states.');
  }
  if (!js.includes('const entries = parseIntegrityEntries(normalized);') || !js.includes('preferredIntegrityEntry(entries)')) {
    fail('Integrity parser must preserve multiple method entries and select the supported byte-integrity entry without discarding the others.');
  }
  if (!js.includes('renderIntegrityValidationEntries(diagnostics)') || !js.includes('entry.active') || !js.includes('entry.duplicateMethod')) {
    fail('Integrity diagnostics must render per-entry audit rows and mark active/duplicate validation entries.');
  }
  if (!js.includes('meaningfulContinuityParentForIntegrity(ws, path, text, context)') || !js.includes("integrityFooterEntry(TIINEX_SHA256_C14N_V2_METHOD_ID, 'self'")) {
    fail('Local save integrity refresh must use v2 self seals and explicit parent-target generation instead of preserving stale multi-entry footers blindly.');
  }
  if (!js.includes('exportFileWithIntegrityRefresh(ws, file)') || !js.includes('integrityRefresh') || !js.includes('refreshed-self-target')) {
    fail('Workspace export must run a non-mutating integrity refresh pass and report export integrity outcomes.');
  }
  if (/function\s+exportWorkspaceZip\s*\(/.test(js) || /exportWorkspaceZipEncrypted/.test(js) || /export-toggle-encryption/.test(js)) {
    fail('Workspace export must have one canonical archive exporter; old zip/encryption export actions must not remain as parallel owners.');
  }
  if (!js.includes('const versionMadeBy = 0x0314') || !js.includes('const flag = 0x0801') || !js.includes('verificationByte') || !js.includes('Math.imul((keys.k1 + (keys.k0 & 0xff)) >>> 0, 134775813)') || !js.includes('Math.imul(temp, (temp ^ 1) >>> 0)')) {
    fail('ZIP password export must set traditional encrypted ZIP headers, UTF-8 flag, and verification byte explicitly.');
  }
  if (!js.includes('await assertZipCryptoArchiveBlob(blob, payload.entries.length)')) {
    fail('ZIP password export must verify encrypted local headers before download.');
  }
  if (!js.includes('modal.exportPassword') || !js.includes('data-field="exportPassword"')) {
    fail('ZIP password export must store password input in modal state instead of relying only on transient DOM reads.');
  }
  for (const token of ['zipBufferHasEncryptedEntries', 'encryptedZipToImportEntries', 'zipCryptoDecryptBytes', 'promptForZipPassword']) {
    if (!js.includes(token)) fail(`ZIP password import support missing: ${token}`);
  }
  if (/downloadBlob\(`\$\{base\}-password\.zip`/.test(js) || js.includes('_tiinex/export.manifest.json')) {
    fail('Export should not suffix password zip names or add a root _tiinex metadata folder.');
  }
  const requiredCss = ['integrity-meaning-grid', 'integrity-method-authority', 'integrity-method-authority.draft-finality', 'integrity-authority-signals', 'integrity-validation-entries', 'integrity-validation-entry.active', 'integrity-validation-entry.preserved-not-evaluated', 'integrity-summary.byte-integrity-verified', 'integrity-badge.draft', 'body.mobile-chrome .integrity-modal-card .modal-actions', 'position: static !important', 'export-result-panel', 'export-result-hero', 'export-result-contract'];
  for (const token of requiredCss) {
    if (!css.includes(token)) fail(`Integrity diagnostics UX CSS missing: ${token}`);
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


function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateArchitectureBoundaries() {
  const layerNames = new Set(ARCHITECTURE_BOUNDARIES.layers.map((layer) => layer.name));
  const requiredLayers = ['app', 'architecture', 'core', 'state', 'services', 'ui', 'viewstate'];
  const missingLayers = requiredLayers.filter((name) => !layerNames.has(name));
  if (missingLayers.length) fail(`Architecture boundary manifest is missing layers: ${missingLayers.join(', ')}`);

  for (const layer of ARCHITECTURE_BOUNDARIES.layers) {
    if (!existsSync(join(root, layer.path))) fail(`Architecture layer path is missing: ${layer.path}`);
    for (const allowed of layer.mayImport) {
      if (!layerNames.has(allowed)) fail(`Architecture layer ${layer.name} allows unknown import layer: ${allowed}`);
    }
  }

  const modulePaths = sourceModulePaths();
  const requiredModules = [
    'src/architecture/boundaries.mjs',
    'src/app/core-runtime.js',
    'src/app/services-runtime.js',
    'src/app/state-runtime.js',
    'src/app/ui-runtime.js',
    'src/app/viewstate-runtime.js',
    'src/core/text.mjs',
    'src/core/path.mjs',
    'src/core/markdown.mjs',
    'src/core/schema.mjs',
    'src/services/storage.mjs',
    'src/services/git-source-adapter.mjs',
    'src/services/git-native-source-adapter.mjs',
    'src/services/repo-fetch-diagnostics.mjs',
    'src/state/local-workspace.mjs',
    'src/ui/html.mjs',
    'src/ui/evidence-attachments.mjs',
    'src/ui/preview.mjs',
    'src/viewstate/lens.mjs'
  ];
  for (const path of requiredModules) {
    if (!modulePaths.includes(path)) fail(`Required architecture module is missing: ${path}`);
  }

  const forbiddenHits = [];
  const importHits = [];
  for (const path of modulePaths) {
    const layer = architectureLayerForPath(path);
    if (!layer) {
      fail(`Source module is outside a declared architecture layer: ${path}`);
      continue;
    }
    const text = read(path);
    const code = stripJsStringsAndComments(text);
    for (const token of layer.forbids || []) {
      const pattern = new RegExp(`(?<![\\w$])${escapeRegExp(token)}(?![\\w$])`, 'g');
      if (pattern.test(code)) forbiddenHits.push(`${path} uses ${token}`);
    }

    const imports = [...text.matchAll(/\bimport\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g)].map((match) => match[1]);
    for (const specifier of imports) {
      if (!specifier.startsWith('.')) continue;
      const baseParts = path.split('/').slice(0, -1);
      const parts = specifier.split('/');
      const resolvedParts = [...baseParts];
      for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') resolvedParts.pop();
        else resolvedParts.push(part);
      }
      const resolvedPath = resolvedParts.join('/');
      const importedLayer = architectureLayerForPath(resolvedPath);
      if (importedLayer && importedLayer.name !== layer.name && !layer.mayImport.includes(importedLayer.name)) {
        importHits.push(`${path} imports ${importedLayer.name} via ${specifier}`);
      }
    }
  }

  if (forbiddenHits.length) fail(`Architecture boundary forbidden access found: ${forbiddenHits.slice(0, 20).join(', ')}`);
  if (importHits.length) fail(`Architecture boundary import violations found: ${importHits.slice(0, 20).join(', ')}`);

  if (normalizeLineEndings('a\r\nb\rc') !== 'a\nb\nc') fail('src/core/text.mjs normalizeLineEndings contract failed');
  if (trimOuterBlankLines('\n\nalpha\n') !== 'alpha') fail('src/core/text.mjs trimOuterBlankLines contract failed');
  if (splitNonEmptyLines('\n alpha \n\n beta \n').join('|') !== 'alpha|beta') fail('src/core/text.mjs splitNonEmptyLines contract failed');
  if (shortText('alpha beta gamma', 8) !== 'alpha b…') fail('src/core/text.mjs shortText contract failed');
  if (fileNameFromPath('a/b/c.trace.md') !== 'c.trace.md') fail('src/core/path.mjs fileNameFromPath contract failed');
  if (dirname('a/b/c.trace.md') !== 'a/b') fail('src/core/path.mjs dirname contract failed');
  if (joinPath('a/b', '../c') !== 'a/c') fail('src/core/path.mjs joinPath contract failed');
  if (relativePath('a/b/root.trace.md', 'a/c/leaf.trace.md') !== '../c/leaf.trace.md') fail('src/core/path.mjs relativePath contract failed');
  if (canonicalWorkspacePath('./a//b/../c.trace.md') !== 'a/c.trace.md') fail('src/core/path.mjs canonicalWorkspacePath contract failed');
  if (normalizeAssetPath('/a//b') !== 'a/b') fail('src/core/path.mjs normalizeAssetPath contract failed');
  if (slugify('Hello, Tiinex!') !== 'hello-tiinex') fail('src/core/path.mjs slugify contract failed');
  const parsedLink = parseMarkdownLink('[Label](../x.md)');
  if (parsedLink.text !== 'Label' || parsedLink.href !== '../x.md') fail('src/core/markdown.mjs parseMarkdownLink contract failed');
  if (stripMarkdownInline('[Label](x) `code`') !== 'Label code') fail('src/core/markdown.mjs stripMarkdownInline contract failed');
  if (stripTrailingBodySeparator('body\n---\n') !== 'body') fail('src/core/markdown.mjs stripTrailingBodySeparator contract failed');
  if (stripBodyTitle('# Title\n\nBody') !== 'Body') fail('src/core/markdown.mjs stripBodyTitle contract failed');
  if (plainBlock('- alpha\n- beta') !== 'alpha\nbeta') fail('src/core/markdown.mjs plainBlock contract failed');
  if (extractBodySections('## One\na\n## Two\nb\n').One.trim() !== 'a') fail('src/core/markdown.mjs extractBodySections contract failed');
  if (sectionMap('# T\n\n## One\na\n').one !== 'a') fail('src/core/markdown.mjs sectionMap contract failed');
  if (singleFieldFromBullet('- Target: thing', 'Target') !== 'thing') fail('src/core/markdown.mjs singleFieldFromBullet contract failed');
  if (schemaKey('tiinex.evidence.v1') !== 'evidence') fail('src/core/schema.mjs schemaKey contract failed');
  if (schemaBadgeClass('tiinex.unknown.v1') !== 'unknown') fail('src/core/schema.mjs schemaBadgeClass contract failed');
  if (schemaIdFromText('[tiinex.topic.v1](schema.md)') !== 'tiinex.topic.v1') fail('src/core/schema.mjs schemaIdFromText contract failed');
  if (textByteLength('å') !== 2) fail('src/services/storage.mjs textByteLength contract failed');
  const memoryStorage = Object.create(null);
  const storageAdapter = {
    getItem: (key) => Object.prototype.hasOwnProperty.call(memoryStorage, key) ? memoryStorage[key] : null,
    setItem: (key, value) => { memoryStorage[key] = String(value); storageAdapter[key] = String(value); },
    removeItem: (key) => { delete memoryStorage[key]; delete storageAdapter[key]; },
  };
  writeJson(storageAdapter, 'alpha', { ok: true });
  if (readJson(storageAdapter, 'alpha', {}).ok !== true) fail('src/services/storage.mjs JSON read/write contract failed');
  writeJson(storageAdapter, 'tiinex.localWorkspace.state.keep', { keep: true });
  writeJson(storageAdapter, 'tiinex.localWorkspace.state.drop', { drop: true });
  removeKeysWithPrefix(storageAdapter, 'tiinex.localWorkspace.state.', 'tiinex.localWorkspace.state.keep');
  if (readJson(storageAdapter, 'tiinex.localWorkspace.state.drop', null) !== null) fail('src/services/storage.mjs removeKeysWithPrefix contract failed');
  if (localStateDataKey('prefix.', 'id') !== 'prefix.id') fail('src/state/local-workspace.mjs localStateDataKey contract failed');
  if (localStateSlug('My Local Workspace!') !== 'my-local-workspace') fail('src/state/local-workspace.mjs localStateSlug contract failed');
  if (!makeLocalStateId('Demo', 'fixed').endsWith('-fixed')) fail('src/state/local-workspace.mjs makeLocalStateId contract failed');
  if (!localStateFileIsPersistent({ sourceId: 'local' })) fail('src/state/local-workspace.mjs localStateFileIsPersistent contract failed');
  if (!localStateAssetIsPersistent({ source: 'zip', content: 'asset' })) fail('src/state/local-workspace.mjs localStateAssetIsPersistent contract failed');
  if (!workspaceHasLocalStateContent({ files: new Map([['a', { sourceId: 'local' }]]), assets: new Map() })) fail('src/state/local-workspace.mjs workspaceHasLocalStateContent contract failed');
  if (serializeFileForLocalState({ path: 'x.trace.md', content: 'a\r\nb' }).content !== 'a\nb') fail('src/state/local-workspace.mjs serializeFileForLocalState contract failed');
  if (serializeAssetForLocalState({ path: 'asset.png', content: 'abc' }).name !== 'asset.png') fail('src/state/local-workspace.mjs serializeAssetForLocalState contract failed');
  if (localStateJsonSize('å') !== 2) fail('src/state/local-workspace.mjs localStateJsonSize contract failed');
  if (escapeHtml('<tag>&\"') !== '&lt;tag&gt;&amp;&quot;') fail('src/ui/html.mjs escapeHtml contract failed');
  if (escapeAttr('`') !== '&#096;') fail('src/ui/html.mjs escapeAttr contract failed');
  if (safeUrl('javascript:alert(1)') !== '') fail('src/ui/html.mjs safeUrl contract failed');
  if (attachmentFileExtension('demo.trace.md') !== 'MD') fail('src/ui/evidence-attachments.mjs attachmentFileExtension contract failed');
  if (humanSize(2048) !== '2 KB') fail('src/ui/evidence-attachments.mjs humanSize contract failed');
  if (shortMime('application/json', 'data.bin') !== 'JSON') fail('src/ui/evidence-attachments.mjs shortMime contract failed');
  if (attachmentMetaChips({ kind: 'url', url: 'https://www.example.com/x', representation: 'snapshot' }).join('|') !== 'snapshot|URL|example.com') fail('src/ui/evidence-attachments.mjs attachmentMetaChips contract failed');
  if (!renderPreviewSections({ One: 'Hello **world**' }, ['One']).includes('Hello **world**')) fail('src/ui/preview.mjs renderPreviewSections contract failed');
  const lineageDescriptor = routeDescriptorFor({ id: 'n1', path: 'a.trace.md', title: 'A' });
  if (lineageDescriptor.mode !== 'lineage' || lineageDescriptor.selectedPath !== 'a.trace.md') fail('src/viewstate/lens.mjs routeDescriptorFor node contract failed');
  const pendingDescriptor = routeDescriptorFor(null, { selectedPath: 'b.trace.md' });
  if (pendingDescriptor.mode !== 'lineage' || pendingDescriptor.selectedPath !== 'b.trace.md') fail('src/viewstate/lens.mjs routeDescriptorFor pending contract failed');
  const source = decorateLensSource({}, lineageDescriptor, { top: 12.6, mode: 'lineage', selectedPath: 'a.trace.md' });
  if (source.scrollTop !== 13 || source.scrollMode !== 'lineage') fail('src/viewstate/lens.mjs decorateLensSource contract failed');
  if (discoveryScrollSignature({ nodeKeys: ['b', 'a'], hash: (text) => text }) !== 'feed::all::::normal::::2::a\nb') fail('src/viewstate/lens.mjs discoveryScrollSignature contract failed');
  const volatile = stripVolatileLensState({ scrollTop: 5, keep: { feedScrollTop: 2, value: true } });
  if ('scrollTop' in volatile || 'feedScrollTop' in volatile.keep || volatile.keep.value !== true) fail('src/viewstate/lens.mjs stripVolatileLensState contract failed');
  if (normalizedHistoryKind({ kind: 'push', signature: 'a', lastSignature: 'a', lastAt: 10, now: 20 }).kind !== 'replace') fail('src/viewstate/lens.mjs normalizedHistoryKind recent contract failed');
  if (normalizedHistoryKind({ kind: 'push', signature: 'b', lastSignature: 'a', lastAt: 0, now: 2000 }).kind !== 'push') fail('src/viewstate/lens.mjs normalizedHistoryKind push contract failed');
  if (shouldApplyLens({ userInteracted: true, isBootingFromUrl: false, routingRestoring: false })) fail('src/viewstate/lens.mjs shouldApplyLens user contract failed');
  if (!shouldRejectDiscoveryScroll('old', 'new')) fail('src/viewstate/lens.mjs shouldRejectDiscoveryScroll contract failed');
  if (preferredStoredScrollModes('lineage').join(',') !== 'lineage,discovery') fail('src/viewstate/lens.mjs preferredStoredScrollModes lineage contract failed');
  if (preferredStoredScrollModes('discovery').join(',') !== 'discovery,lineage') fail('src/viewstate/lens.mjs preferredStoredScrollModes discovery contract failed');
  if (!shouldPreserveStoredScrollOnZeroWrite({ preserveNonZero: true, nextTop: 0, existingTop: 42 })) fail('src/viewstate/lens.mjs shouldPreserveStoredScrollOnZeroWrite preserve contract failed');
  if (shouldPreserveStoredScrollOnZeroWrite({ preserveNonZero: true, nextTop: 5, existingTop: 42 })) fail('src/viewstate/lens.mjs shouldPreserveStoredScrollOnZeroWrite nonzero contract failed');

  const appJs = read('app.js');
  if (!appJs.includes('function removeNodeCandidateMatches(ws, node, key, file, removal)')) fail('local draft discard must route file deletion through one candidate policy owner.');
  if (!appJs.includes(`if (removal?.localShadowDraft) {
      return localFileMatchesNodeForDeletion(file, node);
    }`)) fail('local shadow draft discard must not delete non-local source files by same path.');
  if (!appJs.includes("localShadowDraftRemoval ? '' : node.path")) fail('local shadow draft discard must not include the raw source path in delete keys.');
  if (!appJs.includes('function localShadowDiscardVisibleOriginal(ws, original)')) fail('local shadow draft discard must prefer typed source artifacts over resolved discovery finding wrappers when re-anchoring.');
  if (!appJs.includes('This removes only the local draft from this workspace. The original source artifact is preserved and should take its place again.')) fail('local draft discard confirmation must state source-preserving semantics.');
  if (!appJs.includes("function writeStoredScrollSnapshot(reason = 'snapshot')")) fail('app.js must snapshot stored scroll before page lifecycle exits');
  if (!appJs.includes("flushBrowserStateBeforeLeave('pagehide')")) fail('app.js must own cached-only pagehide lifecycle flush');
  if (!appJs.includes("flushBrowserStateBeforeLeave('beforeunload')")) fail('app.js must own cached-only beforeunload lifecycle flush');
  if (!appJs.includes('persistCachedLensStateBeforeLeave') || !appJs.includes('cancelStoredScrollRestoreSchedule?.(`leave:')) fail('app.js lifecycle flush must stay cached-only and cancel restore backlog');
  if (!appJs.includes('TiinexViewState.preferredStoredScrollModes(activeMode)')) fail('app.js must prefer active scroll mode when restoring stored scroll');
  if (!appJs.includes('TiinexViewState.shouldPreserveStoredScrollOnZeroWrite')) fail('app.js must preserve nonzero stored scroll from lifecycle zero-writes');
  if (!appJs.includes('function storedScrollStableKey(ws, identity = null)')) fail('app.js must write a stable stored scroll fallback key for F5 restore');
  if (!appJs.includes('sessionStorageJsonSet(stableKey, value)')) fail('app.js must persist stored scroll to the stable fallback key');
  if (!appJs.includes('storedScrollStableKey(ws, current)')) fail('app.js must read stored scroll from the stable fallback key');
  if (!appJs.includes('function scanStoredScrollFallback(current)')) fail('app.js must scan stored scroll entries when runtime workspace ids change after F5');
  if (!appJs.includes('Workspace ids are runtime ids')) fail('app.js must document stored scroll fallback ownership for runtime workspace id changes');
  if (!appJs.includes('storedScrollMatchesIdentity(saved, current)')) fail('app.js must share stored scroll identity validation between keyed and scanned reads');
  if (!appJs.includes('function storedScrollContentSignature(ws, mode =')) fail('app.js must guard stored scroll restore with a content signature');
  if (!appJs.includes('savedContent && currentContent && savedContent !== currentContent')) fail('app.js must reject stored scroll when content signatures differ');
  if (!appJs.includes('Prefer the rendered/visible feed for the workspace')) fail('app.js must document rendered feed mode ownership for scroll restore');
  if (!appJs.includes('function preferredStoredScrollCompletionTarget(ws, saved)')) fail('app.js must complete stored scroll restore against the saved target role');
  if (!appJs.includes('function scrollTargetMatchesSavedTop(target, saved)')) fail('app.js must verify stored scroll target position before marking restore complete');
  if (!appJs.includes('Complete only once the saved target')) fail('app.js must document stored scroll timing ownership');
  if (!appJs.includes('stored browser scroll is the single F5/session scroll-restore owner')) fail('app.js must document single-owner scroll restore ownership');
  if (!appJs.includes('Durable lens owns route selection/history only')) fail('durable lens must not own F5 scroll restore');
  if (!appJs.includes('STORED_SCROLL_RESTORE_WINDOW_MS = 12000') || !appJs.includes('storedScrollRestoreWindowMs(reason =')) fail('stored scroll restore must keep bounded content-load windows without long mobile lifecycle chases');
  if (!appJs.includes('STORED_SCROLL_RESUME_RESTORE_WINDOW_MS') || !appJs.includes('no-chase-on-resume')) fail('stored scroll restore must not chase on mobile/tab resume');
  if (!appJs.includes('apply:wait-content-ready')) fail('stored scroll restore must wait for the saved target role to become scrollable');
  if (!appJs.includes('STORED_SCROLL_STABLE_COMPLETION_MS') || !appJs.includes('chase:complete-invalidated') || !appJs.includes('chase:complete-stable')) fail('stored scroll restore completion must survive post-apply render resets');
  if (!appJs.includes('Lineage restore must be stable across refresh')) fail('lineage stored scroll signature must avoid runtime source identity churn');
  if (appJs.includes('registerRenderWrapper(function renderWithAnchorScroll')) fail('obsolete anchor-scroll restore wrapper must not remain active');
  if (appJs.includes('function chaseAnchorScrollForWorkspace') || appJs.includes('function writeAnchorScroll')) fail('obsolete anchor-scroll runtime helpers must be removed after stored browser scroll becomes the single owner');
  if (appJs.includes('if (ws) writeAnchorScroll(ws, null, anchorScrollMode(ws));')) fail('obsolete anchor-scroll interval writer must not remain active');
  if (!appJs.includes("sessionStorage.getItem('tiinex.debug.scrollFlight')") || !appJs.includes('renderWithOptionalScrollFlightRecorder')) fail('scroll flight recorder must be explicit opt-in after diagnostics cleanup');
  if (appJs.includes('chaseScrollForWorkspace') || appJs.includes('chaseAllScroll')) fail('durable lens scroll chase must not remain after stored browser scroll becomes the single owner');
  if (!appJs.includes('Number(saved?.top || 0) > 0 && storedScrollMatchesIdentity(saved, current)')) fail('stored scroll keyed reads must skip zero entries and continue to fallback');
  if (!appJs.includes('.filter((saved) => Number(saved?.top || 0) > 0)')) fail('stored scroll scan fallback must ignore zero entries');
  if (!appJs.includes("!String(targetRole || '').startsWith('post-feed.')")) fail('stored scroll writes must reject inactive shell zero overwrites');
  if (!appJs.includes('function scheduleRouteHistoryScrollRestore(reason =')) fail('browser history route restores must have a dedicated scroll owner');
  if (!appJs.includes("scheduleRouteHistoryScrollRestore('popstate')")) fail('popstate restores must re-apply hash route scroll after render');
  if (!appJs.includes("scheduleRouteHistoryScrollRestore('startup')")) fail('startup route restores must re-apply hash route scroll after render');
  if (!appJs.includes('function startupHasExplicitRouteModal()')) fail('startup local-state restore must not erase explicit route modals');
  if (!appJs.includes('startupHasExplicitRouteModal())) return false')) fail('explicit route modal must suppress local-state startup modal clearing');
  if (!appJs.includes('data-action="workspace-config-save"')) fail('workspace configuration editor must save through a local draft action.');
  if (appJs.includes('data-action="workspace-config-download"')) fail('workspace configuration editor must not bypass workspace draft persistence with a direct download action.');
  if (!appJs.includes("action === 'workspace-config-save'") || !appJs.includes('await saveNodeEdit(ws, node, markdown)')) fail('workspace configuration save must reuse local artifact draft persistence.');
  const indexHtml = read('index.html');
  if (indexHtml.includes('id="viewer-entrypoint-notice"')) {
    fail('index.html must not restore the removed visible viewer entrypoint notice.');
  }
  if (!/<section\s+id="tiinex-llm-entrypoint"[\s\S]*?\bhidden\b/u.test(indexHtml)) {
    fail('index.html must preserve the hidden Tiinex LLM entrypoint.');
  }
  if (!indexHtml.includes('data-tiinex-llm-entrypoint="./llms.txt"')) {
    fail('index.html hidden Tiinex LLM entrypoint must retain the llms.txt binding.');
  }
  const requiredClassicScripts = [
    '<script src="./src/app/core-runtime.js"></script>',
    '<script src="./src/app/services-runtime.js"></script>',
    '<script src="./src/app/state-runtime.js"></script>',
    '<script src="./src/app/ui-runtime.js"></script>',
    '<script src="./src/app/viewstate-runtime.js"></script>',
    '<script src="./app.js"></script>'
  ];
  for (const script of requiredClassicScripts) {
    if (!indexHtml.includes(script)) fail(`index.html must load ${script}`);
  }
  if (indexHtml.indexOf('./src/app/core-runtime.js') > indexHtml.indexOf('./src/app/services-runtime.js')
    || indexHtml.indexOf('./src/app/services-runtime.js') > indexHtml.indexOf('./src/app/state-runtime.js')
    || indexHtml.indexOf('./src/app/state-runtime.js') > indexHtml.indexOf('./src/app/ui-runtime.js')
    || indexHtml.indexOf('./src/app/ui-runtime.js') > indexHtml.indexOf('./src/app/viewstate-runtime.js')
    || indexHtml.indexOf('./src/app/viewstate-runtime.js') > indexHtml.indexOf('./app.js')) {
    fail('index.html classic runtime scripts must load core, services, state, UI, viewstate, then app.js');
  }
  if (/type="module"\s+src="\.\/app\.js"/.test(indexHtml)) fail('app.js must remain a classic script for file-open static usage');
  const extractedNames = [
    'normalizeNewlines', 'shortText', 'fileNameFromPath', 'dirname', 'joinPath', 'relativePath', 'slugify',
    'parseMarkdownLink', 'stripMarkdownInline', 'schemaKey', 'schemaBadgeClass', 'canonicalWorkspacePath',
    'sourceUrlDirectory', 'isFetchableHttpUrl', 'extractBodySections', 'normalizeAssetPath', 'schemaIdFromText',
    'stripBodyTitle', 'sectionMap', 'plainBlock', 'singleFieldFromBullet', 'stripTrailingBodySeparator'
  ];
  for (const name of extractedNames) {
    const declarationPattern = new RegExp(`^\\s*function\\s+${escapeRegExp(name)}\\s*\\(`, 'm');
    if (declarationPattern.test(appJs)) fail(`Extracted core helper should not be redeclared in app.js: ${name}`);
  }
  const extractedUiNames = [
    'escapeHtml', 'escapeAttr', 'safeUrl', 'attachmentFileExtension', 'humanSize', 'shortMime',
    'attachmentMetaChips', 'renderPreviewSections'
  ];
  for (const name of extractedUiNames) {
    const declarationPattern = new RegExp(`^\\s*function\\s+${escapeRegExp(name)}\\s*\\(`, 'm');
    if (declarationPattern.test(appJs)) fail(`Extracted UI helper should not be redeclared in app.js: ${name}`);
  }
  const coreRuntime = read('src/app/core-runtime.js');
  for (const name of extractedNames.filter((name) => name !== 'normalizeNewlines')) {
    if (!new RegExp(`(?<![\\w$])${escapeRegExp(name)}(?![\\w$])`).test(coreRuntime)) fail(`Core browser runtime does not expose expected helper: ${name}`);
  }
  if (!coreRuntime.includes('normalizeLineEndings')) fail('Core browser runtime must expose normalizeLineEndings for app.js aliasing');
  const servicesRuntime = read('src/app/services-runtime.js');
  const stateRuntime = read('src/app/state-runtime.js');
  for (const name of ['readJson', 'writeJson', 'textByteLength', 'removeKeysWithPrefix']) {
    if (!new RegExp(`(?<![\w$])${escapeRegExp(name)}(?![\w$])`).test(servicesRuntime)) fail(`Services browser runtime does not expose expected helper: ${name}`);
  }
  for (const name of ['localStateDataKey', 'makeLocalStateId', 'localStateFiles', 'serializeFileForLocalState', 'serializeAssetForLocalState']) {
    if (!new RegExp(`(?<![\w$])${escapeRegExp(name)}(?![\w$])`).test(stateRuntime)) fail(`State browser runtime does not expose expected helper: ${name}`);
  }
  const uiRuntime = read('src/app/ui-runtime.js');
  for (const name of ['escapeHtml', 'escapeAttr', 'safeUrl', 'attachmentMetaChips', 'renderPreviewSections']) {
    if (!new RegExp(`(?<![\w$])${escapeRegExp(name)}(?![\w$])`).test(uiRuntime)) fail(`UI browser runtime does not expose expected helper: ${name}`);
  }
  const viewstateRuntime = read('src/app/viewstate-runtime.js');
  for (const name of ['routeDescriptorFor', 'decorateLensSource', 'discoveryScrollSignature', 'stripVolatileLensState', 'normalizedHistoryKind', 'shouldApplyLens', 'shouldRejectDiscoveryScroll']) {
    if (!new RegExp(`(?<![\w$])${escapeRegExp(name)}(?![\w$])`).test(viewstateRuntime)) fail(`Viewstate browser runtime does not expose expected helper: ${name}`);
  }

  note(`architecture layers checked: ${[...layerNames].sort().join(', ')}`);
}

function validatePublicBuildContracts() {
  const packageJson = JSON.parse(read('package.json'));
  const scripts = packageJson.scripts || {};
  if (scripts['build:public'] !== 'node tools/build-public.mjs') {
    fail('package.json must expose "build:public": "node tools/build-public.mjs"');
  }
  if (scripts['public:check'] !== 'node tools/check-public-build.mjs') {
    fail('package.json must expose "public:check": "node tools/check-public-build.mjs"');
  }
  if (scripts.test !== 'node tools/validate-static.mjs && node tools/check-public-build.mjs') {
    fail('package.json test script must run static validation and public build check');
  }

  const buildScript = read('tools/build-public.mjs');
  if (!buildScript.includes("argValue('--out', '.site-publish')")) fail('build-public must default to .site-publish and accept --out for checks');
  if (!buildScript.includes('tiinex.bundle.js')) fail('build-public must create tiinex.bundle.js');
  if (!buildScript.includes('window.TIINEX_VIEWER_OPTIONS')) fail('build-public must include viewer options before app.js in the bundle');
  for (const section of ['src/app/core-runtime.js', 'src/app/services-runtime.js', 'src/app/state-runtime.js', 'src/app/ui-runtime.js', 'src/app/viewstate-runtime.js', 'app.js']) {
    if (!buildScript.includes(section)) fail(`build-public must include ${section}`);
  }

  const checkScript = read('tools/check-public-build.mjs');
  if (!checkScript.includes('public index must load exactly one local JS bundle')) fail('public build checker must enforce one local app bundle');
  if (!checkScript.includes('node --check public bundle failed')) fail('public build checker must syntax-check the bundle');

  const workflow = read('.github/workflows/publish-public.yml');
  for (const required of ['npm test', 'npm run build:public', 'publish_dir: .site-publish', 'publish_branch: public']) {
    if (!workflow.includes(required)) fail(`publish workflow must include ${required}`);
  }
  if (/rsync\b/u.test(workflow)) fail('publish workflow must publish build output, not rsync the raw repository');

  note('public build and publish workflow contracts are valid');
}

function validateRootPackageShape() {
  const appRootEntries = new Set([
    '.editorconfig',
    '.github',
    '.gitignore',
    '.topics',
    'assets',
    'open',
    'app.js',
    'index.html',
    'llms.txt',
    'package.json',
    'README.md',
    'samples',
    'src',
    'styles.css',
    'tiinex.app.llm.v1.md',
    'tiinex.context.v1.md',
    'tiinex.orientation.manifest.v1.json',
    'tiinex.orientation.v1.md',
    'robots.txt',
    'tools',
    'VALIDATION_NOTES.md'
  ]);

  const repoMetadataRootEntries = new Set([
    'CNAME',
    'favicon.ico',
    'LICENSE',
    'NOTICE',
    'discord'
  ]);

  const ignoredInfrastructureRootEntries = new Set([
    '.git'
  ]);

  const allowedRootEntries = new Set([
    ...appRootEntries,
    ...repoMetadataRootEntries,
    ...ignoredInfrastructureRootEntries
  ]);

  const rootEntries = readdirSync(root).sort();
  const unexpected = rootEntries.filter((entry) => !allowedRootEntries.has(entry));
  if (unexpected.length) fail(`Unexpected root package entries: ${unexpected.join(', ')}`);

  const appShapeEntries = rootEntries.filter((entry) => !ignoredInfrastructureRootEntries.has(entry));
  note(`root app/package entries: ${appShapeEntries.join(', ')}`);

  const forbiddenPackageFiles = walk(root)
    .map((full) => relative(root, full))
    .filter((path) => /(^|\/)(?:.*\.(?:zip|bak|tmp|log)|node_modules\/|\.DS_Store$|Thumbs\.db$)/i.test(path));
  if (forbiddenPackageFiles.length) fail(`Local artifacts should not ship: ${forbiddenPackageFiles.join(', ')}`);

  const packageJson = JSON.parse(read('package.json'));
  if (packageJson.private !== true) {
    fail('package.json must set private: true so the static frontend is not presented as an npm-published package');
  }
  const validateScript = packageJson.scripts && packageJson.scripts.validate;
  const testScript = packageJson.scripts && packageJson.scripts.test;
  const metricsScript = packageJson.scripts && packageJson.scripts.metrics;
  const storageScanScript = packageJson.scripts && packageJson.scripts['storage:scan'];
  const buildPublicScript = packageJson.scripts && packageJson.scripts['build:public'];
  const publicCheckScript = packageJson.scripts && packageJson.scripts['public:check'];
  if (validateScript !== 'node tools/validate-static.mjs') {
    fail('package.json must expose "validate": "node tools/validate-static.mjs"');
  }
  if (testScript !== 'node tools/validate-static.mjs && node tools/check-public-build.mjs') {
    fail('package.json must expose "test": "node tools/validate-static.mjs && node tools/check-public-build.mjs"');
  }
  if (metricsScript !== 'node tools/collect-metrics.mjs') {
    fail('package.json must expose "metrics": "node tools/collect-metrics.mjs"');
  }
  if (buildPublicScript !== 'node tools/build-public.mjs') {
    fail('package.json must expose "build:public": "node tools/build-public.mjs"');
  }
  if (publicCheckScript !== 'node tools/check-public-build.mjs') {
    fail('package.json must expose "public:check": "node tools/check-public-build.mjs"');
  }
  if (storageScanScript !== 'node tools/inspect-storage.mjs') {
    fail('package.json must expose "storage:scan": "node tools/inspect-storage.mjs"');
  }
}


async function main() {
  validateRequiredFiles();
  validateRootPackageShape();
  validateRootMarkdown();
  validateNoAuditReports();
  validateMarkdownContinuityHygiene();
  validateIntegrityLifecycleUxContract();
  validateGitHubRecoveredContinuityContract();
  validateEmbeddedWorkspaceMirror();
  validateNoInlineCodeHistory();
  validateNoScaffoldMarkers();
  validateToolSyntax();
  validateSourceModuleSyntax();
  validateArchitectureBoundaries();
  validateArchitectureProductReadiness();
  await validateGitSourceAdapterResearchContract();
  validatePublicBuildContracts();
  validateJavascriptSyntax();
  validateJavascriptSurface();
  validateMobileActionOwnership();
  validateWrapperHygiene();
  validateCanonicalRenderAssignments();
  validateWizardArchitecture();
  validateRenderBoundaryArchitecture();
  validateOrdinaryFunctionReassignments();
  validateCssSurface();

  for (const message of notes) console.log(`✓ ${message}`);
  if (failures.length) {
    console.error('\nStatic validation failed:');
    for (const message of failures) console.error(`- ${message}`);
    process.exit(1);
  }
  console.log('✓ node --check app.js, tools, and source modules');
  console.log('✓ CSS brace balance');
  console.log('✓ no ordinary app-level version-stamped identifiers/classes detected');
  console.log('✓ no public scaffold/debug markers detected');
  console.log('✓ root package markdown is intentional');
  console.log('✓ packaged continuity markdown and app integrity lifecycle contracts are valid');
  console.log('✓ embedded default workspace mirrors packaged workspace markdown');
  console.log('✓ architecture boundary manifest and product-readiness contracts are valid');
  console.log('✓ public build and publish workflow contracts are valid');
  console.log('\nStatic validation passed. Browser golden-flow validation is still required for UI behavior.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
