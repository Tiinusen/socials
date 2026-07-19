#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import vm from 'node:vm';
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

const WALK_IGNORED_DIRECTORIES = new Set(['.git', '.mirrors', '.site-publish', 'node_modules']);

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
  const expected = new Set([
    'README.md',
    'tiinex.app.llm.v1.md',
    'tiinex.context.v1.md',
    'tiinex.orientation.v1.md',
    'VALIDATION_NOTES.md',
    'LINEAGE_POLICY.md',
    'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md',
    'SECURITY.md'
  ]);
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
  for (const id of ['raw']) {
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
    "reason: 'continuity loss: unresolved-known recovery no longer contains its declared Parent block'",
    "case: 'exact-parent-path-beats-same-basename-collision'",
    "case: 'basename-only-parent-collision-remains-unresolved-known'",
    'function tiinexHintConcreteIdentityKeys',
    "unresolvedKnown('ambiguous-explicit-parent'",
    'githubParentResolutionSpecificity',
    'function isAdapterDiscoveryFindingNode',
    'function integrityParentNodeForArtifact',
    "case: 'adapter-finding-does-not-become-recovered-artifact-parent'",
    "case: 'integrity-parent-prefers-declared-recovered-parent-over-adapter-finding'"
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
  if (stripParentCalls !== 4 || !js.includes('function replaceWorkspaceConfigContinuityParent') || !js.includes('function preserveWorkspaceConfigContinuityParent')) {
    fail(`Parent stripping must remain owned by the helper definition, explicit root/detach save path, workspace artifact parent-edit path, and workspace parent-preservation path; found ${stripParentCalls} references.`);
  }
  if (!/resolveAdapterParentTraversalForWorkspace\(ws,\s*\{[\s\S]{0,220}?sourceId:\s*source\.id/u.test(js)) {
    fail('GitHub issue import must run source-bounded parent reconciliation after all issue artifacts are indexed.');
  }
  if (js.includes("resolveAdapterParentTraversalForWorkspace(ws, { reason: options.reason || 'public-link-open'")) {
    fail('Public hash loading must not rerun parent traversal after the issue loader has already reconciled that snapshot.');
  }
  note('GitHub recovered continuity preserves unresolved Parent declarations, rejects basename collisions, and reconciles each issue snapshot once');
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
  for (const token of ['TiinexGitNativeRuntime', 'cloneLab', 'ensureRuntime', 'explicitVendorLoad', 'bufferModuleUrl', 'Missing Buffer dependency', 'GitHub browser git clone needs an explicit CORS proxy', 'commitPresent']) {
    if (!browserGitNative.includes(token)) fail(`Browser Git-native runtime bridge missing ${token}`);
  }
  for (const forbidden of ['hydrateCommits', 'hydrateCommit', 'hydrationStatus', 'coordinated-deepen-ref']) {
    if (browserGitNative.includes(forbidden)) fail(`Browser Git-native runtime must not expose implicit historical branch deepening: ${forbidden}`);
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
    'raw.failed',
    'exactHistoricalFileReport',
    'EXACT_HISTORICAL_CACHE_NAME',
    'networkRequested !== true',
    'exact-immutable-file',
    'refreshExactHistoricalIntegrityDependents',
    'allowHistoricalNetwork: false',
    'allowHistoricalNetwork: true',
    'exactHistoricalReadBudget'
  ]) {
    if (!appJs.includes(token)) fail(`GitHub repo fetch reliability contract missing app token: ${token}`);
  }
  for (const forbidden of [
    'queueGitNativeHistoricalHydration',
    'flushGitNativeHistoricalHydrationQueue',
    'git-native.historical-coordinator.start',
    'current-snapshot-first-background-hydration',
    'bridge.hydrateCommit',
    'app.integrityTargetHashCache = {}'
  ]) {
    if (appJs.includes(forbidden)) fail(`Ordinary app runtime must not reintroduce workspace-wide historical hydration: ${forbidden}`);
  }
  if (appJs.includes("await scheduleIntegrityVerification(ws, { discoveryProgress: true })")) {
    fail('Progressive repo indexing must not block current-snapshot rendering on full integrity verification.');
  }
  if (!appJs.includes("networkRequested: options.allowHistoricalNetwork === true")) {
    fail('Exact historical network reads must require an explicit caller-owned allowHistoricalNetwork decision.');
  }
  if (!appJs.includes("skipGitNativeRawBridge: true") || !appJs.includes("fallbackPolicy: 'exact-immutable-file'")) {
    fail('Exact historical file reads must bypass Git pack hydration and use the explicit immutable-file transport boundary.');
  }

  const rawResolverStart = appJs.indexOf("  function normalizedGitNativeRefLabel(value = '') {");
  const rawResolverEnd = appJs.indexOf("  const EXACT_HISTORICAL_CACHE_NAME = 'tiinex.exact-historical-files';", rawResolverStart);
  if (rawResolverStart < 0 || rawResolverEnd <= rawResolverStart) fail('Could not isolate Git-native raw material resolver for validation.');
  const rawResolverSource = appJs.slice(rawResolverStart, rawResolverEnd);
  if (/\bacquireSnapshot\s*\(/u.test(rawResolverSource)) {
    fail('Git-native raw material reads must never restart clone/fetch through acquireSnapshot after the repository snapshot is loaded.');
  }
  for (const token of ['git-native.raw-bridge.loaded-commit', 'git-native.raw-bridge.network-refresh-blocked', 'implicitSnapshotRefreshes: 0']) {
    if (!appJs.includes(token)) fail(`Git-native local-only raw bridge contract missing: ${token}`);
  }

  let implicitRawSnapshotRefreshes = 0;
  const rawTraceEvents = [];
  const rawResolverContext = {
    app: {},
    isCommitRef(value = '') { return /^[a-f0-9]{40}$/i.test(String(value || '').trim()); },
    gitNativeRepoMaterialOwnerRecord() { return null; },
    gitNativeRepoMaterialOwnerRecordAnyRef() { return { repo: 'Tiinex/docs', ref: 'master', requestedRef: 'master', commit: 'a'.repeat(40), resolvedCommit: 'a'.repeat(40) }; },
    gitNativeRepoMaterialWorkspaceOwner() { return null; },
    gitNativeRepoMaterialWorkspaceOwnerAnyRef() { return null; },
    workspaceGitResolvedCommit(owner) { return owner?.resolvedCommit || owner?.commit || ''; },
    workspaceGitRefLabel(owner) { return owner?.ref || ''; },
    githubRepoFetchTrace(event, detail) { rawTraceEvents.push({ event, detail }); },
    Date,
    Object,
    String,
    RegExp,
    Error
  };
  vm.runInNewContext(`${rawResolverSource}\n  globalThis.__rawResolverTest = { resolveGitNativeCommitForRawRead, gitNativeRawBridgeResolutionState };`, rawResolverContext, { filename: 'app.js#git-native-raw-resolver' });
  const rawRuntime = { git: { async resolveRef() { throw new Error('local ref absent'); } }, fs: {}, dir: '/repo', cache: {} };
  const rawBridge = { async acquireSnapshot() { implicitRawSnapshotRefreshes += 1; return { ok: true, commit: 'b'.repeat(40) }; } };
  const resolvedLoadedCommit = await rawResolverContext.__rawResolverTest.resolveGitNativeCommitForRawRead(rawRuntime, rawBridge, {}, { repo: 'Tiinex/docs', ref: 'master', path: '.topics/a.md' }, {});
  if (resolvedLoadedCommit !== 'a'.repeat(40) || implicitRawSnapshotRefreshes !== 0) {
    fail('A missing local branch ref must reuse the already loaded resolved commit without any snapshot refresh.');
  }
  let mismatchedRefBlocked = false;
  try {
    await rawResolverContext.__rawResolverTest.resolveGitNativeCommitForRawRead(rawRuntime, rawBridge, {}, { repo: 'Tiinex/docs', ref: 'other-branch', path: '.topics/a.md' }, {});
  } catch (_) {
    mismatchedRefBlocked = true;
  }
  if (!mismatchedRefBlocked || implicitRawSnapshotRefreshes !== 0 || !rawTraceEvents.some((item) => item.event === 'git-native.raw-bridge.network-refresh-blocked')) {
    fail('An unavailable non-current ref must be blocked locally and must not trigger clone/fetch.');
  }

  const runtimeWindow = { TIINEX_VIEWER_OPTIONS: { gitNative: {} } };
  vm.runInNewContext(browserGitNative, {
    window: runtimeWindow,
    URL,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    Map,
    Set,
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Date,
    Math,
    RegExp,
    Error
  }, { filename: 'src/app/git-native-runtime.js' });
  if (typeof runtimeWindow.TiinexGitNativeRuntime?.commitPresent !== 'function') fail('Git-native runtime must retain local commit presence checks.');
  if ('hydrateCommits' in runtimeWindow.TiinexGitNativeRuntime || 'hydrateCommit' in runtimeWindow.TiinexGitNativeRuntime) {
    fail('Git-native runtime export must not expose branch-deepening history hydration.');
  }

  const timingStart = browserGitNative.indexOf('  function gitTransportTimingPolicy(value = {}) {');
  const timingEnd = browserGitNative.indexOf('  function timedFetchHttpClient(', timingStart);
  if (timingStart < 0 || timingEnd <= timingStart) fail('Could not isolate progress-aware Git transport timing helpers.');
  const timingContext = { Object, Number, Math, Date, Error };
  vm.runInNewContext(`${browserGitNative.slice(timingStart, timingEnd)}
  globalThis.__gitTimingTest = { gitTransportTimingPolicy, gitTransportRateState, gitTransportLowSpeedState };`, timingContext, { filename: 'src/app/git-native-runtime.js#transport-timing' });
  const timingPolicy = timingContext.__gitTimingTest.gitTransportTimingPolicy({
    maxNetworkDurationMs: 35000,
    responseStartTimeoutMs: 6000,
    idleTimeoutMs: 8000,
    lowSpeedGraceMs: 12000,
    minBytesPerSecond: 65536
  });
  const timingNow = 100000;
  const healthyTransfer = timingContext.__gitTimingTest.gitTransportLowSpeedState(24.6 * 1024 * 1024, timingNow - 14000, timingPolicy, timingNow);
  const slowTransfer = timingContext.__gitTimingTest.gitTransportLowSpeedState(50 * 1024 * 12, timingNow - 12000, timingPolicy, timingNow);
  const graceTransfer = timingContext.__gitTimingTest.gitTransportLowSpeedState(20 * 1024 * 5, timingNow - 5000, timingPolicy, timingNow);
  if (healthyTransfer.exceeded || healthyTransfer.bytesPerSecond < 1024 * 1024) {
    fail('A healthy multi-megabyte Git transfer must not be rejected by the low-throughput policy.');
  }
  if (!slowTransfer.exceeded || slowTransfer.bytesPerSecond >= timingPolicy.minBytesPerSecond) {
    fail('A sustained 50 KB/s Git transfer must be eligible for bounded fallback after the low-speed grace period.');
  }
  if (graceTransfer.exceeded) fail('Git low-throughput policy must not abort before its grace period expires.');

  const fakeFs = { promises: { async mkdir() {} } };
  let warmCloneCalls = 0;
  let warmFetchCalls = 0;
  const warmWindow = {
    TIINEX_VIEWER_OPTIONS: { gitNative: {} },
    Buffer,
    GitHttp: {},
    git: {
      async resolveRef() { return 'a'.repeat(40); },
      async currentBranch() { return 'master'; },
      async listFiles() { return ['.topics/demo/001.trace.md']; },
      async clone() { warmCloneCalls += 1; },
      async fetch() { warmFetchCalls += 1; }
    }
  };
  vm.runInNewContext(browserGitNative, {
    window: warmWindow, URL, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, Blob, AbortController, Map, Set, Promise, Object, Array, String, Number, Boolean, Date, Math, RegExp, Error, Buffer, setTimeout, clearTimeout, setInterval, clearInterval
  }, { filename: 'src/app/git-native-runtime.js#warm-object-store' });
  const warmSnapshot = await warmWindow.TiinexGitNativeRuntime.acquireSnapshot({ repo: 'Tiinex/docs', ref: 'master', rootPaths: ['.topics'], fs: fakeFs, corsProxy: 'https://proxy.example' });
  if (!warmSnapshot.reusedExistingClone || warmSnapshot.networkOperation !== 'none' || warmSnapshot.networkOperationSucceeded || warmCloneCalls || warmFetchCalls) {
    fail('Warm Git snapshot reuse must explicitly report local object-store material with zero network operation.');
  }

  let localOnlyCloneCalls = 0;
  const localOnlyWindow = {
    TIINEX_VIEWER_OPTIONS: { gitNative: {} },
    Buffer,
    GitHttp: {},
    git: {
      async resolveRef() { throw new Error('missing'); },
      async currentBranch() { return ''; },
      async listFiles() { return []; },
      async clone() { localOnlyCloneCalls += 1; },
      async fetch() { throw new Error('local-only must not fetch'); }
    }
  };
  vm.runInNewContext(browserGitNative, {
    window: localOnlyWindow, URL, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, Blob, AbortController, Map, Set, Promise, Object, Array, String, Number, Boolean, Date, Math, RegExp, Error, Buffer, setTimeout, clearTimeout, setInterval, clearInterval
  }, { filename: 'src/app/git-native-runtime.js#local-only-miss' });
  let localOnlyMiss = null;
  try {
    await localOnlyWindow.TiinexGitNativeRuntime.acquireSnapshot({ repo: 'Tiinex/docs', ref: 'master', rootPaths: ['.topics'], fs: fakeFs, localOnly: true });
  } catch (error) {
    localOnlyMiss = error;
  }
  if (!localOnlyMiss?.localSnapshotMiss || localOnlyMiss?.networkOperation !== 'none' || localOnlyCloneCalls !== 0) {
    fail('Local Git preflight misses must be explicit and must never clone or fetch.');
  }

  let coldResolved = false;
  let coldCloneCalls = 0;
  const coldWindow = {
    TIINEX_VIEWER_OPTIONS: { gitNative: {} },
    Buffer,
    GitHttp: {},
    git: {
      async resolveRef() { if (!coldResolved) throw new Error('missing'); return 'b'.repeat(40); },
      async currentBranch() { return 'master'; },
      async listFiles() { return ['.topics/demo/001.trace.md']; },
      async clone() { coldCloneCalls += 1; coldResolved = true; },
      async fetch() {}
    }
  };
  vm.runInNewContext(browserGitNative, {
    window: coldWindow, URL, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, Blob, AbortController, Map, Set, Promise, Object, Array, String, Number, Boolean, Date, Math, RegExp, Error, Buffer, setTimeout, clearTimeout, setInterval, clearInterval
  }, { filename: 'src/app/git-native-runtime.js#cold-clone' });
  const coldSnapshot = await coldWindow.TiinexGitNativeRuntime.acquireSnapshot({ repo: 'Tiinex/docs', ref: 'master', rootPaths: ['.topics'], fs: fakeFs, corsProxy: 'https://proxy.example' });
  if (coldSnapshot.reusedExistingClone || coldSnapshot.networkOperation !== 'clone' || !coldSnapshot.networkOperationSucceeded || coldCloneCalls !== 1) {
    fail('Cold Git snapshot acquisition must explicitly report one successful clone network operation.');
  }

  const exactStart = appJs.indexOf("  const EXACT_HISTORICAL_CACHE_NAME = 'tiinex.exact-historical-files';");
  const exactEnd = appJs.indexOf('  async function tryReadGithubRawViaGitNative', exactStart);
  if (exactStart < 0 || exactEnd <= exactStart) fail('Could not isolate exact historical file resolver for runtime validation.');
  const exactSource = `${appJs.slice(exactStart, exactEnd)}\n  globalThis.__exactHistoricalTest = { readExactHistoricalFile, exactHistoricalFileReport, clearExactHistoricalFileCache };`;
  const exactCache = new Map();
  const exactStorage = new Map();
  const traceEvents = [];
  let exactNetworkCalls = 0;
  let exactActiveCalls = 0;
  let exactMaxActiveCalls = 0;
  const exactContext = {
    app: {},
    window: {
      caches: {
        async open() {
          return {
            async match(url) { return exactCache.has(url) ? new Response(exactCache.get(url)) : undefined; },
            async put(url, response) { exactCache.set(url, await response.text()); },
            async keys() { return Array.from(exactCache.keys()).map((url) => ({ url })); },
            async delete(request) { return exactCache.delete(request.url || request); }
          };
        }
      }
    },
    location: { href: 'https://tiinex.dev/' },
    document: { hidden: false },
    localStorage: {
      getItem(key) { return exactStorage.has(key) ? exactStorage.get(key) : null; },
      setItem(key, value) { exactStorage.set(key, String(value)); },
      removeItem(key) { exactStorage.delete(key); }
    },
    STORAGE_KEYS: { exactHistoricalReadBudget: 'tiinex.exactHistoricalReadBudget' },
    storageReadJson(storage, key, fallback) {
      const raw = storage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    },
    storageWriteJson(storage, key, value) { storage.setItem(key, JSON.stringify(value)); },
    normalizeRepoSlug(value = '') { return String(value || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').toLowerCase(); },
    normalizeRepoPath(value = '') { return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '').replace(/\/{2,}/g, '/'); },
    isCommitRef(value = '') { return /^[a-f0-9]{40}$/i.test(String(value || '').trim()); },
    rawGithubSourceParts(url = '') {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/').filter(Boolean);
      return { repo: `${parts[0]}/${parts[1]}`, ref: parts[2], path: parts.slice(3).join('/'), rawUrl: url };
    },
    sameRepoSlug(a = '', b = '') { return String(a || '').toLowerCase() === String(b || '').toLowerCase(); },
    githubRepoFetchTrace(event, detail) { traceEvents.push({ event, detail }); },
    async adapterRequest(url) {
      exactNetworkCalls += 1;
      exactActiveCalls += 1;
      exactMaxActiveCalls = Math.max(exactMaxActiveCalls, exactActiveCalls);
      await new Promise((resolve) => setTimeout(resolve, 5));
      exactActiveCalls -= 1;
      return { text: `content:${url}` };
    },
    getWorkspace() { return null; },
    async verifyNodeIntegrity() { return { status: 'target-unavailable', label: 'unused' }; },
    render() {},
    Response,
    URL,
    Map,
    Set,
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Date,
    Math,
    RegExp,
    Error,
    JSON,
    setTimeout,
    clearTimeout
  };
  vm.runInNewContext(exactSource, exactContext, { filename: 'app.js#exact-historical-file-resolver' });
  const exactResolver = exactContext.__exactHistoricalTest;
  const commitOne = '1'.repeat(40);
  const commitTwo = '2'.repeat(40);
  const deferredExact = await exactResolver.readExactHistoricalFile({ repo: 'Tiinex/docs', ref: commitOne, path: '.topics/a.md' }, { networkRequested: false });
  if (!deferredExact.deferred || exactNetworkCalls !== 0) fail('Ordinary historical target reads must defer without network access.');
  const [exactOne, exactTwo] = await Promise.all([
    exactResolver.readExactHistoricalFile({ repo: 'Tiinex/docs', ref: commitOne, path: '.topics/a.md' }, { networkRequested: true }),
    exactResolver.readExactHistoricalFile({ repo: 'Tiinex/docs', ref: commitTwo, path: '.topics/b.md' }, { networkRequested: true })
  ]);
  if (!exactOne.ok || !exactTwo.ok || exactNetworkCalls !== 2 || exactMaxActiveCalls !== 1) {
    fail(`Exact historical reads must serialize per origin; calls=${exactNetworkCalls} maxActive=${exactMaxActiveCalls}`);
  }
  const cachedExact = await exactResolver.readExactHistoricalFile({ repo: 'Tiinex/docs', ref: commitOne, path: '.topics/a.md' }, { networkRequested: false });
  if (!cachedExact.ok || exactNetworkCalls !== 2 || !/cache/.test(cachedExact.sourceResolutionKind || '')) {
    fail('Exact historical files must remain readable from immutable cache without a second network call.');
  }
  const exactReport = exactResolver.exactHistoricalFileReport();
  if (exactReport.networkReads !== 2 || exactReport.maxConcurrentObserved !== 1 || exactReport.cacheHits < 1) {
    fail('Exact historical diagnostics must expose network, serialization, and cache behavior.');
  }
  if (!traceEvents.some((item) => item.event === 'git-native.historical-read.deferred') || !traceEvents.some((item) => item.event === 'exact-historical.network.success')) {
    fail('Exact historical resolver diagnostics must distinguish deferred startup reads from explicit network reads.');
  }

  const budgetSuppressed = await exactResolver.readExactHistoricalFile({ repo: 'Tiinex/docs', ref: '3'.repeat(40), path: '.topics/c.md' }, { networkRequested: true, maxReadsPerWindow: 2 });
  if (!budgetSuppressed.deferred || budgetSuppressed.reason !== 'origin-window-budget-exhausted' || exactNetworkCalls !== 2) {
    fail('Persistent exact historical origin budget must suppress excess requests before network access.');
  }
  const reloadContext = Object.assign({}, exactContext, {
    app: {},
    window: { caches: exactContext.window.caches }
  });
  vm.runInNewContext(exactSource, reloadContext, { filename: 'app.js#exact-historical-file-resolver-reload' });
  const reloadCached = await reloadContext.__exactHistoricalTest.readExactHistoricalFile({ repo: 'Tiinex/docs', ref: commitOne, path: '.topics/a.md' }, { networkRequested: false });
  if (!reloadCached.ok || reloadCached.cacheState !== 'cache-storage' || exactNetworkCalls !== 2) {
    fail('Exact historical immutable cache must survive a page-runtime reset without a new network call.');
  }
  const gitFetchCalls = (browserGitNative.match(/runtime\.git\.fetch\s*\(/g) || []).length;
  if (gitFetchCalls !== 1 || !browserGitNative.includes('opts.refreshExistingClone === true')) {
    fail(`Git-native runtime should retain exactly one fetch path for explicit current-ref refresh; found ${gitFetchCalls}.`);
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

  // These helpers execute before the viewer can load its workspace or restore a
  // file:// route. A syntax-only check cannot detect that a refactor removed a
  // declaration while leaving its calls behind, so keep their ownership explicit.
  const requiredBootstrapHelpers = [
    'shouldUseEmbeddedDefaultWorkspace',
    'isDefaultLocalWorkspaceBootstrapCandidate',
    'hasExternalWorkspaceBootstrapCandidate',
    'workspaceAssetUrl',
    'staticDiskMode',
    'cleanHashOnly',
    'packagedAssetUrlFromAnyPath'
  ];
  for (const name of requiredBootstrapHelpers) {
    const declaration = new RegExp(`(?:function\\s+${name}\\s*\\(|(?:const|let|var)\\s+${name}\\s*=)`);
    if (!declaration.test(code)) fail(`app.js bootstrap helper is referenced but not declared: ${name}`);
  }
  if (!/(?:const|let|var)\s+DEFAULT_TIINEX_BRAND_ASSET\s*=/.test(code)) {
    fail('app.js bootstrap brand asset constant is missing: DEFAULT_TIINEX_BRAND_ASSET');
  }

  if (!js.includes("shouldUseEmbeddedDefaultWorkspace(candidates)")) {
    fail('workspace bootstrap must decide embedded default usage from the resolved candidate list, not only file:// mode.');
  }
  if (!js.includes("'fallback-after-packaged-paths'") || !js.includes("role: configuredByHost ? 'fallback-after-runtime-candidates' : 'fallback-after-packaged-paths'")) {
    fail('hosted startup must fall back to the embedded workspace after missing/unfetchable packaged paths instead of leaving an empty stage.');
  }
  if (!js.includes('Dot-prefixed packaged workspace paths are not reliable on hosted Pages')) {
    fail('workspace bootstrap must document why embedded default owns hosted fallback when .topics paths are unavailable.');
  }
  if (!js.includes('fetchWorkspacePointerIssueThread') || !js.includes('fetchGitHubIssueThreadWithFallback(spec')) {
    fail('workspace issue pointers must use the GitHub issue thread fallback stack, not GitHub REST only.');
  }
  if (/async function resolveWorkspaceIssuePointer[\s\S]*?fetchGitHubJson\(spec\.apiIssueUrl/.test(js)) {
    fail('resolveWorkspaceIssuePointer must not depend directly on GitHub REST; use fetchWorkspacePointerIssueThread fallback owner.');
  }
  const ordinaryVersionedIdentifiers = [...code.matchAll(/\b[A-Za-z_$][\w$]*(?:V\d{2,}|v\d{2,})\b/g)].map((m) => m[0]);
  if (ordinaryVersionedIdentifiers.length) {
    fail(`Ordinary version-stamped JavaScript identifiers found: ${[...new Set(ordinaryVersionedIdentifiers)].slice(0, 20).join(', ')}`);
  }

  const forbiddenCalls = ['stopImmediatePropagation', 'onActionV645'];
  for (const token of forbiddenCalls) {
    if (code.includes(token)) fail(`Forbidden historical runtime token found in code: ${token}`);
  }

  const releaseInvalidationStart = js.indexOf('  function invalidateRuntimeCachesForReleaseIfNeeded()');
  const releaseInvalidationEnd = js.indexOf('  function buildFooterTooltip()', releaseInvalidationStart);
  if (releaseInvalidationStart < 0 || releaseInvalidationEnd <= releaseInvalidationStart) fail('Could not isolate release cache invalidation policy.');
  const releaseInvalidation = js.slice(releaseInvalidationStart, releaseInvalidationEnd);
  for (const token of ['STORAGE_KEYS.githubIssueThreadCache', 'STORAGE_KEYS.githubSourceMaterialCachePrefix']) {
    if (!releaseInvalidation.includes(token)) fail(`App release cache-busting must invalidate stale durable source cache on public rebuilds: ${token}`);
  }
  const buildPublic = read('tools/build-public.mjs');
  for (const token of ['GITHUB_RUN_ATTEMPT', 'runKey', 'defaultBuildId', 'TIINEX_RELEASE_CACHE_KEY', 'releaseCacheKey']) {
    if (!buildPublic.includes(token)) fail(`Public build cache identity must change on each publish run, not only source commit: ${token}`);
  }
  if (!js.includes('githubHostedIssueSnapshotMetadataUrlCandidates') || !js.includes('disableRuntimeCache: true') || !js.includes("cacheMode: 'no-cache'")) {
    fail('Hosted issue snapshots must use same-origin candidate paths with browser/runtime cache revalidation instead of stale runtime cache.');
  }
  if (!js.includes('githubSourceMaterialCacheWrite') || !js.includes('restoreGitHubSourceMaterialCacheIntoWorkspace') || !js.includes('githubSourceMaterialCachePrefix') || !js.includes('restoreConfiguredGitHubIssueThreadCachesIntoWorkspace') || !js.includes('githubSourceMaterialCacheLooksCompleteForSource') || !js.includes('githubSourceMaterialCacheFreshness') || !js.includes('source-material-cache.invalidated')) {
    fail('Cache tier must restore/write a complete release/TTL-bounded source-material cache and rehydrate configured issue targets through the shared issue materialization path, not only route state, issue-thread cache, or local Git preflight.');
  }
  if (!js.includes('hostedIssueSnapshotBaseUrlCandidates') || !js.includes('githubHostedIssueSnapshotResolveDirectory') || !js.includes('githubPagesDefaultBaseUrlForRepository') || js.includes('${repoName}/${relative}')) {
    fail('Hosted issue snapshot paths must follow mirror convention roots such as /issues/github.com/owner/repo.json, then a source repo GitHub Pages mirror candidate for GitHub-backed repos, and preserve the repository directory for issue item paths.');
  }
  if (!js.includes('site-issue-snapshot.metadata-candidate') || !js.includes('site-issue-snapshot.metadata-selected') || !js.includes('resolveFreshestGitHubHostedIssueSnapshotMetadata') || !js.includes('githubHostedIssueSnapshotFreshnessValue')) {
    fail('Hosted issue snapshot adapter must trace and select the freshest available viewer/source mirror metadata instead of stopping at the first 200 response.');
  }
  if (!js.includes('refresh-source-via-live-transport') || !js.includes('bypassRepositorySnapshot: true') || !js.includes('bypassHostedIssueSnapshot: true') || !js.includes('githubIssueTransportPresentation') || !js.includes('renderWorkspaceTransportPills')) {
    fail('Mirror/cache transport badges must provide an explicit next-level live-source refresh path for repository files and issue snapshots.');
  }
  for (const token of ['TRANSPORT_TIER_ORDER', "['cache', 'mirror', 'proxy', 'direct']", 'data-transport-tier', 'restoreGitHubSourceUserConfig', 'preserveSourceConfig', 'forceDirectFallback', 'transportRefreshTier', 'allowLowerTierCacheFallback', 'stale-cache-suppressed-by-requested-tier', 'resetWorkspaceTransportStateForSourceLoad', 'forceWorkspaceCacheTransportPresentation', 'activeSourceTransportTier']) {
    if (!js.includes(token)) fail(`Transport badge tier progression/source-config guard missing: ${token}`);
  }
  if (!js.includes("transportRefreshTier: 'cache', transportPolicy: githubSourceTransportPolicyForTier('cache', { routeOwnedStartup: true })")
    || !js.includes("transportRefreshTier: 'cache', transportPolicy: githubSourceTransportPolicyForTier('cache', { startupProgress: true })")) {
    fail('Route/startup GitHub source loads must begin cache-first, then fall through the same transport policy to mirror when source cache is absent.');
  }
  const sourceLoadStart = js.indexOf('  async function loadGitHubStateSourceIntoWorkspace(');
  const sourceLoadEnd = js.indexOf('  async function createWorkspaceFromInputs(', sourceLoadStart);
  if (sourceLoadStart < 0 || sourceLoadEnd <= sourceLoadStart) fail('Could not isolate GitHub source load transport owner.');
  const sourceLoad = js.slice(sourceLoadStart, sourceLoadEnd);
  for (const token of [
    'const requestedTransportPolicy = githubSourceTransportPolicyFromOptions(options)',
    'restoreGitHubSourceMaterialCacheIntoWorkspace',
    'source-material-cache.miss-fallback-to-mirror',
    'source-material-cache.incomplete-fallback-to-mirror',
    'restoreConfiguredGitHubIssueThreadCachesIntoWorkspace',
    'githubSourceMaterialCacheLooksCompleteForSource',
    'resetWorkspaceTransportStateForSourceLoad(ws, githubSource, transportPolicy)',
    'ensureWorkspaceRequestedIssueTransportFallback(ws, githubSource, transportPolicy',
    'sourceLoadHardRefresh',
    'bypassRepositorySnapshot: Boolean(options.bypassRepositorySnapshot || !transportPolicy.allowMirror)',
    'liveGitHub: Boolean(options.liveGitHub || transportPolicy.allowProxy)',
    'allowDirectGithubClone: Boolean(options.allowDirectGithubClone || transportPolicy.allowDirect)',
    'forceDirectFallback: Boolean(options.forceDirectFallback || transportPolicy.allowDirect)',
    'bypassHostedIssueSnapshot: Boolean(options.bypassHostedIssueSnapshot || !transportPolicy.allowMirror)',
    'allowSharedReaderFallback: Boolean(options.allowSharedReaderFallback || transportPolicy.allowDirect)',
    'transportRefreshTier: transportPolicy.requestedTier',
    'transportPolicy'
  ]) {
    if (!sourceLoad.includes(token)) fail(`Transport tier options must be forwarded through the single GitHub source loader: ${token}`);
  }
  const issueDiscoveryStart = js.indexOf('  async function discoverGitHubIssuesIntoWorkspace(');
  const issueDiscoveryEnd = js.indexOf('    ws.githubIssueDiscoveryRuns =', issueDiscoveryStart);
  if (issueDiscoveryStart < 0 || issueDiscoveryEnd <= issueDiscoveryStart) fail('Could not isolate GitHub issue discovery transport owner.');
  const issueDiscovery = js.slice(issueDiscoveryStart, issueDiscoveryEnd);
  for (const token of ['transportPolicy', 'liveGitHub: Boolean(options.liveGitHub || transportPolicy.allowProxy)', 'bypassHostedIssueSnapshot: Boolean(options.bypassHostedIssueSnapshot || !transportPolicy.allowMirror)', 'forceDirectFallback: Boolean(options.forceDirectFallback || transportPolicy.allowDirect)', 'transportRefreshTier: transportPolicy.requestedTier']) {
    if (!issueDiscovery.includes(token)) fail(`Issue imports must receive the caller transport tier rather than resolving their own transport path: ${token}`);
  }

  for (const token of ['maybeScheduleTemporalLensAfterViewState', 'openModalOnMissingRef: false', 'routeOwnedStartup: true', 'timePortalTransportTierFromOptions', 'cache-and-mirror-do-not-own-historical-git-state', "transportRefreshTier: 'proxy'", "transportRefreshTier: 'direct'", 'allowDirectFallbackOnProxyMiss', 'time-portal.transport.proxy-miss-direct-fallback', 'readExactHistoricalFile', 'exact-historical.cache-hit', 'preferSeedPaths: false', 'includeKnownFreshnessPaths: false', 'bypassRepositorySnapshot: true', 'temporalUseGitHubTreeApi', 'noApi: !temporalUseGitHubTreeApi', 'repoJsdelivrFileUrl', 'timePortalDirectMaxHistoricalReadsPerWindow', 'exactHistoricalResetCooldown', 'forceDirectFallback: Boolean(temporalTransportPolicy.allowDirect)', 'repoDiscoveryPromises', 'joining existing load', 'temporalRefResolverHasLoadedRepoMaterial']) {
    if (!js.includes(token)) fail(`Time Portal source snapshots must bypass cache/mirror, prefer proxy for historical Git state, reserve direct/raw for the explicit last-resort tier, and avoid duplicate in-flight historical loads: ${token}`);
  }
  if (!js.includes("throw new Error(`Exact historical raw read deferred: ${exactHistorical.reason || 'network-not-requested'}`)")) {
    fail('Commit-pinned direct/raw reads must respect the exact historical cache/budget boundary instead of silently falling through to generic raw fetchText.');
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
  if (!js.includes('data-mobile-action="mobile-remove-workspace"') || !js.includes("if (action === 'mobile-remove-workspace') return { action: 'remove-workspace'")) {
    fail('Mobile global workspace menu must expose Remove workspace instead of burying workspace close behind desktop-only chrome.');
  }
  if (!/function\s+mobileFabActionDataset\s*\([\s\S]*?if \(action === 'mobile-remove-workspace'\) return \{ action: 'remove-workspace', ws: ws\.id \};[\s\S]*?function\s+genericMobileActionOwnsButton/u.test(js)) {
    fail('The active mobile global action dispatcher must map Remove workspace to the normal remove-workspace handler.');
  }
  if (js.includes('data-mobile-action="mobile-display"')) {
    fail('Mobile global workspace menu must not include the Display shortcut; display options remain available from the toolbar/filter owner.');
  }
  if (!/function\s+mobileGlobalActions[\s\S]{0,1200}<i class="fa-solid fa-bars"><\/i>/u.test(js)) {
    fail('Mobile global workspace menu launcher must use a hamburger/menu icon rather than a plus icon.');
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
    for (const target of relativeMatches) {
      const href = parseMarkdownLink(target).href || '';
      const resolved = joinPath(dirname(path), href);
      if (!resolved || !existsSync(join(root, resolved))) {
        unpinnedSchemaHits.push(`${path} -> ${target} (packaged target missing)`);
      }
    }
  }
  if (placeholderHits.length) {
    fail(`Packaged continuity markdown contains placeholder integrity values: ${placeholderHits.join(', ')}`);
  }
  if (unpinnedSchemaHits.length) {
    fail(`Packaged schema links must be commit-pinned or resolve to a packaged local schema: ${unpinnedSchemaHits.slice(0, 20).join(', ')}`);
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
  if (!js.includes('prepareGithubExportIntegrityPayloads(modal, ws)') || !js.includes('prepareGithubExportItemIntegrity(ws, item)')) {
    fail('GitHub publication must prepare local draft integrity before copy/open/verify so posted Source Markdown is already v2-sealed.');
  }
  if (!js.includes('githubExportEffectiveMarkdown(file, node)') || /const original = normalizeNewlines\(file\?\.content \|\| file\?\.text/.test(js)) {
    fail('Integrity refresh must prefer current file.text/effective markdown over stale file.content.');
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
  const workspacePath = join(root, '.topics/.workspaces/viewer.workspace.md');
  if (!existsSync(workspacePath)) {
    note('packaged default workspace absent; runtime workspace candidates or embedded fallback may own startup');
    return;
  }
  const workspace = readFileSync(workspacePath, 'utf8');
  if (embedded !== workspace) {
    fail('EMBEDDED_DEFAULT_WORKSPACE_MD must exactly mirror .topics/.workspaces/viewer.workspace.md when a packaged default workspace is present');
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
  if (!appJs.includes("action === 'workspace-config-save'") || !appJs.includes('await saveNodeEdit(ws, node, markdown,')) fail('workspace configuration save must reuse local artifact draft persistence.');
  if (appJs.includes('>Save workspace</button>')) fail('topbar Save workspace button must not remain; workspace artifacts are created or edited through normal artifact cards.');
  if (!appJs.includes('workspace-config-update-current')) fail('workspace artifact editor must expose Update with current staging.');
  if (!/async function saveWorkspace\(wsId\) \{[\s\S]{0,360}?app\.modal = defaultExportModal\(ws\.id\);[\s\S]{0,120}?render\(\);/u.test(appJs)) fail('workspace shell export action must open the canonical export adapter modal.');
  if (/async function saveWorkspace\(wsId\) \{[\s\S]{0,260}?openWorkspaceSaveArtifactModal/u.test(appJs)) fail('workspace shell export action must not open the workspace artifact save dialog.');
  if (!appJs.includes('Current workspace set staged in this workspace artifact')) fail('Update with current must stage the active workspace set before local draft save.');
  if (!appJs.includes("syncDocumentTitle('viewer-config-after-workspace-state')")) fail('workspace Browser Title must be re-applied after workspace state restore.');
  if (!appJs.includes("configured || hostTitle")) fail('workspace Browser Title from .workspace.md must take precedence over build-time viewer shell title.');
  if (!appJs.includes("syncDocumentTitle('workspace-config-save')")) fail('saving workspace identity must apply the Browser Title preview to the active viewer.');
  if (!appJs.includes('Workspace Label')) fail('workspace exports must serialize explicit Workspace Label fields.');
  if (!appJs.includes("['Workspace Label', 'Label']")) fail('workspace parser must prefer explicit Workspace Label over generated headings.');
  if (!appJs.includes('preserves the user-visible names of every workspace')) fail('workspace update-current label preservation policy must be documented in code.');
  if (!appJs.includes('workspace-transition-icon-only')) fail('workspace Continue/Reference transitions must render icon-only to preserve single-row card actions.');
  if (!/if \(isWorkspaceNode\(node\)\) \{[\s\S]{0,300}?editActions\.push\(edit\(\{ label: 'Edit'[\s\S]{0,1600}?writeActions\.push\([\s\S]{0,220}?workspaceContinueAction,[\s\S]{0,120}?workspaceReferenceAction,[\s\S]{0,260}?label: 'Open',[\s\S]{0,420}?label: 'Merge'/u.test(appJs)) fail('desktop workspace card actions must preserve Edit, icon-only Continue/Reference, then labeled Open and Merge order.');
  if (!appJs.includes("? ['read', 'markdown', 'share', 'workspace-open']")) fail('mobile workspace card primary actions must surface Open icon-only instead of Edit.');
  if (!appJs.includes('suppressRouteStateWrite: true') || !appJs.includes('suppressRoutePrewarm: true') || !/async function openWorkspaceNode\([\s\S]{0,1400}?setRouteState\(routeHistoryKind\)/u.test(appJs)) fail('workspace Open/Merge actions must push a real route history entry after suppressing internal replace/prewarm writes so mobile Back returns to the previous card list.');
  if (!appJs.includes("options.suppressRouteStateWrite !== true) setRouteState('replace')") || !appJs.includes('options.suppressRoutePrewarm !== true && options.suppressRouteStateWrite !== true')) fail('workspace state restore must allow user-facing workspace Open to own browser history rather than replacing the current entry.');
  if (!appJs.includes("'tiinex.workspace.v1': schemaPolicyEntry('tiinex.workspace.v1', 'Workspace', 'core-artifact', 'tiinex.root.v1', 'Portable workspace entrypoint.', 'yes'")) fail('workspace artifacts must be creatable through the ordinary artifact wizard.');
  if (!appJs.includes('Workspace entries use the same draft/export/publish path as other artifacts')) fail('artifact wizard copy must explain workspace artifacts use the normal draft/export path.');
  if (!appJs.includes('githubWorkspacePresentationDelta')) fail('GitHub issue previews must have a workspace-specific human summary path.');
  if (!appJs.includes('workspace-config-scope-strip')) fail('workspace Update with current scope toggle must have a single compact owner.');
  if (appJs.includes('workspace-config-checkbox option-toggle')) fail('workspace Update with current scope toggle must not be duplicated inside the summary and footer.');
  if (!appJs.includes('workspace-config-identity-section')) fail('workspace config editor must put identity fields first so mobile can edit without scrolling past diagnostics.');
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

function validateRepositoryTransportContracts() {
  const app = read('app.js');
  const index = read('index.html');
  const workflow = read('.github/workflows/publish-public.yml');
  const schemaPath = join(root, '.topics/.schemas/tiinex.workspace.v1.schema.md');
  const workspacePath = join(root, '.topics/.workspaces/viewer.workspace.md');
  const schema = existsSync(schemaPath) ? readFileSync(schemaPath, 'utf8') : '';
  const workspace = existsSync(workspacePath) ? readFileSync(workspacePath, 'utf8') : '';
  if (existsSync(join(root, '.gitmodules'))) {
    fail('source branch must not track .gitmodules; mirror sources belong in workspace artifacts or GitHub Actions variables');
  }
  if (existsSync(join(root, '.topics/repository-mirrors.json'))) {
    fail('repository mirror source declarations must live in the workspace artifact, not a sidecar repository-mirrors.json file');
  }
  if (schema) {
    for (const token of ['## Repository Mirrors', 'Each mirror should be a third-level heading under `## Repository Mirrors`', '`Repository`', '`URL`', 'A repository mirror declaration is not a workspace entrypoint, not a runtime transport, and not provenance', 'Deployment hosts may append additional mirrors through host configuration']) {
      if (!schema.includes(token)) fail(`workspace schema must document repository mirror declarations: ${token}`);
    }
    for (const token of ['## Repository Transports', '`snapshot`', '`git-proxy`', 'Snapshot transports precede Git-proxy transports', 'Relative `Metadata` and `Proxy` values resolve against the workspace artifact location', '### Co-hosted mirror convention', './mirrors/<source-host>/<owner>/<repository>.json', './.mirrors/<source-host>/<owner>/<repository>.json', 'Viewers must not crawl directory indexes']) {
      if (!schema.includes(token)) fail(`workspace schema must document repository transport contract: ${token}`);
    }
  } else {
    note('packaged workspace schema absent; skipping schema-bound repository transport documentation checks for this branch');
  }
  if (workspace) {
    for (const token of ['## Repository Mirrors', '### Tiinex docs', '- Repository: Tiinex/docs', '- URL: https://github.com/Tiinex/docs.git', '### Tiinex ai-provenance', '- Repository: Tiinex/ai-provenance', '- URL: https://github.com/Tiinex/ai-provenance.git']) {
      if (!workspace.includes(token)) fail(`packaged workspace must declare repository mirror source: ${token}`);
    }
    if (/Repository:\s*Tiinusen\/socials|URL:\s*https:\/\/github\.com\/Tiinusen\/socials\.git/u.test(workspace)) {
      fail('packaged workspace must not declare the publishing fork as an extra repository mirror');
    }
  } else {
    note('packaged workspace absent; runtime workspace candidates or issue pointers may own workspace bootstrap');
  }

  if (workspace) {
    for (const token of ['## Repository Transports', '- Kind: git-proxy', '- Proxy: https://cors.isomorphic-git.org']) {
      if (!workspace.includes(token)) fail(`packaged workspace must declare the default repository transport: ${token}`);
    }
    if (workspace.includes('- Kind: snapshot') || workspace.includes('mirrors/github.com/Tiinex/docs.json')) {
      fail('packaged workspace should exercise the schema-defined co-hosted mirror convention instead of duplicating its own repo mirror URL');
    }
  }
  for (const token of ['parseRepositoryTransports', 'repositoryTransportsFor', 'coHostedRepositorySnapshotTransports', 'githubPagesRepositorySnapshotTransports', 'githubPagesDefaultBaseUrlForRepository', "convention: 'co-hosted-source'", "convention: 'co-hosted-public'", "convention: 'github-pages-source-public'", 'tryDiscoverGitHubRepoViaRepositorySnapshot', 'zipBufferToImportEntries', 'repositoryTransportPlan', 'gitNativeTransportCandidates', 'clearRepositoryTransportHealth', 'workspace-transport-lazy', 'repositoryTransportDeadlineAt', 'repositoryTransportBudgetMs', 'local-file-http-snapshot-unavailable', "phase: 'snapshot-connect'", "phase: 'snapshot-transfer'", "phase: 'snapshot-processing'", 'repository-snapshot.convention-miss', 'repositorySnapshotMetadataTimeoutMs: 5000', 'repositorySnapshotTimeoutMs: 35000']) {
    if (!app.includes(token)) fail(`repository transport runtime contract missing: ${token}`);
  }
  const identityStart = app.indexOf("  function normalizeRepositoryTransportIdentity(value, defaultHost = 'github.com') {");
  const transportParseStart = app.indexOf('  function parseRepositoryTransports(', identityStart);
  if (identityStart < 0 || transportParseStart <= identityStart) fail('Could not isolate repository mirror convention helpers.');
  const mirrorContext = { URL, Number, Boolean, encodeURIComponent, stripMarkdownInline: (value) => String(value || '') };
  vm.runInNewContext(`${app.slice(identityStart, transportParseStart)}
  globalThis.__mirrorConvention = { coHostedRepositorySnapshotTransports, githubPagesRepositorySnapshotTransports, githubPagesDefaultBaseUrlForRepository };`, mirrorContext, { filename: 'app.js#co-hosted-mirror-convention' });
  const publicMirrors = mirrorContext.__mirrorConvention.coHostedRepositorySnapshotTransports('Tiinex/docs', {
    baseUrl: 'https://tiinex.github.io/site/',
    includeSourceRoot: false
  });
  if (publicMirrors.length !== 1 || publicMirrors[0]?.metadataUrl !== 'https://tiinex.github.io/site/mirrors/github.com/Tiinex/docs.json' || publicMirrors[0]?.convention !== 'co-hosted-public') {
    fail('Published viewers must derive the co-hosted mirror from the effective application base URL.');
  }
  const sourcePagesMirrors = mirrorContext.__mirrorConvention.githubPagesRepositorySnapshotTransports('Tiinex/docs');
  if (sourcePagesMirrors.length !== 1 || sourcePagesMirrors[0]?.metadataUrl !== 'https://tiinex.github.io/docs/mirrors/github.com/Tiinex/docs.json' || sourcePagesMirrors[0]?.convention !== 'github-pages-source-public') {
    fail('GitHub-backed sources may probe the source repository default Pages mirror after the viewer-owned mirror candidate.');
  }
  if (mirrorContext.__mirrorConvention.githubPagesRepositorySnapshotTransports('https://gitlab.com/example/repo.git').length) {
    fail('Source-owned GitHub Pages mirror inference must be limited to GitHub-backed repositories.');
  }
  const localMirrors = mirrorContext.__mirrorConvention.coHostedRepositorySnapshotTransports('Tiinex/docs', {
    baseUrl: 'http://localhost:8080/',
    includeSourceRoot: true
  });
  if (localMirrors.length !== 2 || localMirrors[0]?.metadataUrl !== 'http://localhost:8080/.mirrors/github.com/Tiinex/docs.json' || localMirrors[1]?.metadataUrl !== 'http://localhost:8080/mirrors/github.com/Tiinex/docs.json') {
    fail('Local/source viewers must probe .mirrors before the public mirrors path.');
  }
  const forgeMirror = mirrorContext.__mirrorConvention.coHostedRepositorySnapshotTransports('https://gitlab.com/example/repo.git', {
    baseUrl: 'https://viewer.example/app/',
    includeSourceRoot: false
  });
  if (forgeMirror[0]?.metadataUrl !== 'https://viewer.example/app/mirrors/gitlab.com/example/repo.json') {
    fail('Co-hosted mirror paths must preserve the canonical source host instead of being GitHub-only.');
  }

  const fileMirrors = mirrorContext.__mirrorConvention.coHostedRepositorySnapshotTransports('Tiinex/docs', {
    baseUrl: 'file:///tmp/tiinex/index.html',
    includeSourceRoot: true
  });
  if (fileMirrors.length) {
    fail('file:// runtimes must not pretend sibling mirror metadata is fetchable without user-granted folder or zip intake.');
  }
  if (app.includes("convention: 'github-pages-default'")) {
    fail('Repository mirror discovery must use the bounded source-pages convention helper, not legacy ad-hoc GitHub Pages defaults.');
  }

  if (/repo:\s*['"]Tiinex\/docs['"]/u.test(index) || /corsProxy:\s*['"]https:\/\/cors\.isomorphic-git\.org/u.test(index)) {
    fail('repository identity and proxy selection must live in .workspace.md, not default app JSON');
  }
  if (/defaultGitNativeRepoForStartup|ensurePersistedGitNativeDiscoveryRuntime/u.test(app)) {
    fail('startup must not invent a repository or eagerly load Git runtime before workspace transport selection');
  }
  if (!/function gitNativeConfiguredRepo\(config = \{\}\) \{[\s\S]{0,280}return String\(config\.repo \|\| ''\)\.trim\(\);/u.test(app)) {
    fail('legacy app Git configuration may own only an explicitly configured repository');
  }
  if (!app.includes("const configUrl = normalizeViewerConfigUrl('.topics/.workspaces/viewer.workspace.md')")) {
    fail('embedded workspace resources must resolve from an absolute workspace artifact URL');
  }
  for (const token of ['repositorySnapshotTransportError', 'response-start-timeout', 'idle-timeout', 'low-throughput', 'max-network-duration', 'reader?.cancel?.(abortReason)', 'repository-snapshot.transport.telemetry']) {
    if (!app.includes(token)) fail(`snapshot transfer health contract missing: ${token}`);
  }
  const snapshotFetchStart = app.indexOf('  async function fetchRepositorySnapshotBytes(');
  const snapshotFetchEnd = app.indexOf('  function repositorySnapshotArchiveUrl(', snapshotFetchStart);
  if (snapshotFetchStart < 0 || snapshotFetchEnd <= snapshotFetchStart) fail('Could not isolate repository snapshot transfer helper.');
  const snapshotFetchSource = app.slice(snapshotFetchStart, snapshotFetchEnd);
  if (/setTimeout\([^)]*repository snapshot archive timed out after/u.test(snapshotFetchSource)) {
    fail('Repository snapshot archives must not use one fixed short wall-clock timeout while bytes are progressing.');
  }

  const gitRuntime = read('src/app/git-native-runtime.js');
  for (const token of ['timedFetchHttpClient', 'gitTransportTimingPolicy', 'gitTransportLowSpeedState', 'response-start-timeout', 'idle-timeout', 'low-throughput', 'max-network-duration', 'reader?.cancel?.(error)', 'if (abortReason) throw abortReason', 'AbortController', 'transportSignal', 'cleanupFailedClone', "const requestedRef = clean(opts.ref || '')", 'ref: requestedRef || undefined', 'currentBranch', 'reusedExistingClone', 'networkOperationSucceeded', "networkOperation = 'none'", "networkOperation = 'fetch'", "networkOperation = 'clone'"]) {
    if (!gitRuntime.includes(token)) fail(`Git transport abort/cleanup contract missing: ${token}`);
  }
  for (const token of ['gitNativeResponseStartTimeoutMs: 6000', 'gitNativeIdleTimeoutMs: 8000', 'gitNativeLowSpeedGraceMs: 12000', 'gitNativeMinBytesPerSecond: 65536', 'repositoryTransportCooldownMs: 60000', 'repositoryTransportFailureShouldCooldown', 'git-native.transport.telemetry', 'repository-transport.fallback-selected', "phase === 'git-transfer'", "phase === 'git-processing'", 'repositoryTransportDecisionReport', 'repositoryTransportPresentation', 'workspace-transport-pill', "kind: 'local-git'", 'selectedMaterialTransport', 'usedNetworkTransport', 'snapshot.networkOperationSucceeded === true'] ) {
    if (!app.includes(token)) fail(`progress-aware repository transport contract missing: ${token}`);
  }
  const gitDiscoveryStart = app.indexOf('  async function tryDiscoverGitHubRepoViaGitNative(ws, context = {}) {');
  const gitDiscoveryEnd = app.indexOf('  async function discoverGitHubRepoIntoWorkspace(ws, options)', gitDiscoveryStart);
  if (gitDiscoveryStart < 0 || gitDiscoveryEnd <= gitDiscoveryStart) fail('Could not isolate Git-native discovery coordinator.');
  const gitDiscoverySource = app.slice(gitDiscoveryStart, gitDiscoveryEnd);
  if (/transportTimer|setTimeout\([^)]*Git transport/u.test(gitDiscoverySource)) {
    fail('Git-native discovery must not use one fixed wall-clock timer across network transfer and local pack processing.');
  }
  if (!gitDiscoverySource.includes('cooldownApplied = repositoryTransportFailureShouldCooldown(error)')) {
    fail('Only transport-class failures may put a Git proxy into cooldown.');
  }
  if (!gitDiscoverySource.includes('if (usedNetworkTransport)') || !gitDiscoverySource.includes("kind: 'local-git'")) {
    fail('Warm Git object-store reuse must be recorded as local material and must not claim a fresh proxy success.');
  }
  for (const token of ["const localOnly = context.localOnly === true", 'cleanupFailedClone: !localOnly', 'refreshExistingClone: !localOnly', 'localOnly,', "git-native.local-preflight.miss"]) {
    if (!gitDiscoverySource.includes(token)) fail(`Local Git preflight contract missing: ${token}`);
  }
  const discoveryCoordinatorStart = app.indexOf('  async function discoverGitHubRepoIntoWorkspace(ws, options) {');
  const discoveryCoordinatorEnd = app.indexOf('  function ', discoveryCoordinatorStart + 60);
  const discoveryCoordinatorSource = app.slice(discoveryCoordinatorStart, discoveryCoordinatorEnd > discoveryCoordinatorStart ? discoveryCoordinatorEnd : app.length);
  const localPreflightIndex = discoveryCoordinatorSource.indexOf('localOnly: true');
  const snapshotAttemptIndex = discoveryCoordinatorSource.indexOf('tryDiscoverGitHubRepoViaRepositorySnapshot');
  const networkGitIndex = discoveryCoordinatorSource.lastIndexOf('tryDiscoverGitHubRepoViaGitNative');
  if (localPreflightIndex < 0 || snapshotAttemptIndex < 0 || networkGitIndex < 0 || !(localPreflightIndex < snapshotAttemptIndex && snapshotAttemptIndex < networkGitIndex)) {
    fail('Repository discovery order must be warm local Git, then snapshot mirrors, then network Git.');
  }
  if (!discoveryCoordinatorSource.includes('if (!options.hardRefresh && transportPolicy.allowCache && options.allowGitNativeLocalCache === true)')) {
    fail('Warm local Git preflight must be opt-in; cache tier is owned by the source material cache so it cannot return a partial repo-only artifact set.');
  }
  const sourceStripStart = app.indexOf('  function renderWorkspaceSourceStrip(ws) {');
  const sourceStripEnd = app.indexOf('  function localDeletionComparableValues(', sourceStripStart);
  if (sourceStripStart < 0 || sourceStripEnd <= sourceStripStart || !app.slice(sourceStripStart, sourceStripEnd).includes('renderRepositoryTransportPill(ws)')) {
    fail('The selected repository transport must render in the existing workspace source strip.');
  }
  if ((app.match(/renderRepositoryTransportPill\(ws\)/g) || []).length !== 2) {
    fail('Repository transport presentation must have exactly one source-strip call site plus its function declaration.');
  }
  const presentationStart = app.indexOf('  function repositoryTransportPresentation(transport = {}) {');
  const presentationEnd = app.indexOf('  function repositoryTransportPlan(repo) {', presentationStart);
  if (presentationStart < 0 || presentationEnd <= presentationStart) fail('Could not isolate repository transport presentation helper.');
  const presentationContext = { String, Boolean, Object };
  vm.runInNewContext(`${app.slice(presentationStart, presentationEnd)}
  globalThis.__transportPresentation = { repositoryTransportPresentation };`, presentationContext, { filename: 'app.js#repository-transport-presentation' });
  const presentation = presentationContext.__transportPresentation.repositoryTransportPresentation;
  if (presentation({ kind: 'local-git' })?.label !== 'cache') fail('Warm object-store material must present as cache.');
  if (presentation({ kind: 'browser-cache' })?.label !== 'cache') fail('Durable source-material cache must present as cache, not a generic transport badge.');
  if (presentation({ kind: 'snapshot', inferred: true, convention: 'co-hosted-source' })?.label !== 'mirror') fail('Local co-hosted snapshots must present as mirror.');
  if (presentation({ kind: 'snapshot', inferred: true, convention: 'co-hosted-public' })?.label !== 'mirror') fail('Published co-hosted snapshots must present as mirror.');
  if (presentation({ kind: 'git-proxy' })?.label !== 'proxy') fail('Network Git material must present as proxy.');
  if (presentation({ kind: 'github-raw' })?.label !== 'direct') fail('Raw fallback material must present as direct.');
  const failureKindStart = app.indexOf('  function repositoryTransportFailureKind(error) {');
  const failureKindEnd = app.indexOf('  function rememberRepositoryTransportFailure(', failureKindStart);
  if (failureKindStart < 0 || failureKindEnd <= failureKindStart) fail('Could not isolate repository transport failure classification.');
  const failureKindContext = { String, Number };
  vm.runInNewContext(`${app.slice(failureKindStart, failureKindEnd)}
  globalThis.__transportFailureTest = { repositoryTransportFailureKind, repositoryTransportFailureShouldCooldown };`, failureKindContext, { filename: 'app.js#repository-transport-failure-kind' });
  const transportFailureTest = failureKindContext.__transportFailureTest;
  if (!transportFailureTest.repositoryTransportFailureShouldCooldown({ name: 'TimeoutError', message: 'Git transport stalled.' })) {
    fail('Stalled Git network responses must enter cooldown.');
  }
  if (transportFailureTest.repositoryTransportFailureShouldCooldown(new Error('Could not list local Git files after download.'))) {
    fail('Local Git processing errors must not put the network transport into cooldown.');
  }
  if (!workflow.includes("':(exclude).mirrors/**'")) fail('mirror publisher must exclude nested .mirrors build inputs from every published snapshot');
  if (/exclude_mirrors/u.test(workflow)) fail('mirror publisher should use one invariant instead of per-repository .mirrors exclusion flags');
  for (const token of [
    'Detect publish mode',
    'viewer_build=false',
    'Prepare non-viewer publish artifact',
    "steps.publish_mode.outputs.viewer_build == 'true'",
    "steps.publish_mode.outputs.viewer_build != 'true'",
    'Root publication is unconditional',
    '## Repository Mirrors',
    'emit_workspace_mirror_sources',
    'publish_remote_mirror',
    'Ignoring duplicate mirror declaration',
    'Ignoring non-mirror submodule',
    'Validate repository mirrors',
    'Publishing repository mirror is missing',
    'TIINEX_REPOSITORY_MIRRORS',
    'secrets.TIINEX_REPOSITORY_MIRRORS',
    'emit_configured_mirror_sources',
    'github-actions-variable:TIINEX_REPOSITORY_MIRRORS',
    'extra_mirrors',
    'branches-ignore:',
    "github.ref_type == 'branch'",
    "github.ref_name != 'public'",
    'TIINEX_PUBLISH_SOURCE_REF',
    'TIINEX_USE_SOURCE_CNAME',
    'TIINEX_PUBLIC_STATIC_PATHS',
    'TIINEX_PUBLIC_REDIRECTS',
    'TIINEX_CANONICAL_SOURCE_REF',
    'TIINEX_VIEWER_GIT_REPO',
    'TIINEX_VIEWER_GIT_REF',
    'TIINEX_VIEWER_GIT_ROOTS',
    'Viewer-like repository is missing required publish input',
    'mode=viewer-static-and-mirrors',
    'mode=static-and-mirrors',
    'Static publish material:',
    'publish_enabled=false',
    'Skipping publish for $GITHUB_REF_NAME',
    'Tiinex/site only auto-publishes',
    'other non-public working branches exist',
    'TIINEX_PAGES_DEPLOY:-auto',
    'branch-only',
    'publish_enabled: ${{ steps.settings.outputs.publish_enabled }}',
    "if: steps.settings.outputs.publish_enabled == 'true'",
    'Configure GitHub Pages',
    'Upload Pages artifact',
    'Deploy to GitHub Pages',
    'deploy-pages:',
    'needs: publish',
    'needs.publish.outputs.publish_enabled',
    'actions/configure-pages@v5',
    'actions/upload-pages-artifact@v4',
    'actions/deploy-pages@v4',
    'environment:',
    'name: github-pages',
    'TIINEX_PUBLIC_REDIRECTS',
    'pages: write',
    'id-token: write',
    'TIINEX_PAGES_DEPLOY',
    'pages_deploy_enabled=false',
    'pages_deploy_enabled=true',
    'TIINEX_WORKSPACE_REPOSITORY_MIRRORS',
    'TIINEX_GITMODULES_REPOSITORY_MIRRORS',
    'Workspace Repository Mirrors are disabled',
    'Gitmodules mirror compatibility input is disabled',
    'touch .site-publish/.nojekyll',
    'github.event.repository.fork',
    'rm -f .site-publish/CNAME',
    'Ignoring self mirror declaration',
    'Sanitize public deploy root',
    'rm -f .site-publish/.gitmodules',
    'rm -rf .site-publish/.mirrors'
  ]) {
    if (!workflow.includes(token)) fail(`portable mirror workflow contract missing: ${token}`);
  }
  const rootPublishIndex = workflow.indexOf('"$GITHUB_WORKSPACE"');
  const configuredMirrorsIndex = workflow.indexOf('done < <(emit_configured_mirror_sources)');
  const workspaceMirrorsIndex = workflow.indexOf('done < <(emit_workspace_mirror_sources)');
  const optionalMirrorsIndex = workflow.indexOf('if [ -f .gitmodules ]; then');
  if (rootPublishIndex < 0 || configuredMirrorsIndex < 0 || workspaceMirrorsIndex < 0 || optionalMirrorsIndex < 0 || !(rootPublishIndex < configuredMirrorsIndex && configuredMirrorsIndex < workspaceMirrorsIndex && workspaceMirrorsIndex < optionalMirrorsIndex)) {
    fail('publishing repository root mirror must be built before configured variable mirrors, opt-in workspace mirror declarations, and opt-in .gitmodules mirrors');
  }
  if (!workflow.includes('case "${workspace_mirrors_enabled,,}"') || !workflow.includes('case "${gitmodules_mirrors_enabled,,}"')) {
    fail('workspace and .gitmodules mirror compatibility inputs must be explicit opt-ins');
  }
  if (/repository-mirrors\.json/u.test(workflow)) {
    fail('portable mirror workflow must read mirror sources from workspace artifacts, not repository-mirrors.json');
  }
  if (workflow.includes('Mirror submodule must live below .mirrors/')) {
    fail('copyable mirror workflow must ignore ordinary submodules outside .mirrors instead of rejecting the repository');
  }
  const selfMirrorGuardIndex = workflow.indexOf('if [ "$remote_identity" = "$root_identity" ]; then');
  const extraMirrorCloneIndex = workflow.indexOf('git clone --depth 1 --single-branch --no-tags "$module_url" "$clone_dir"');
  if (selfMirrorGuardIndex < 0 || extraMirrorCloneIndex < 0 || selfMirrorGuardIndex > extraMirrorCloneIndex) {
    fail('fork-safe mirror publication must skip self-referential mirrors before cloning extras');
  }
  const sanitizeDeployIndex = workflow.indexOf('- name: Sanitize public deploy root');
  const publishBranchIndex = workflow.indexOf('- name: Publish public branch');
  const uploadPagesIndex = workflow.indexOf('- name: Upload Pages artifact');
  const deployPagesIndex = workflow.indexOf('  deploy-pages:');
  if (sanitizeDeployIndex < 0 || publishBranchIndex < 0 || uploadPagesIndex < 0 || deployPagesIndex < 0 || !(sanitizeDeployIndex < publishBranchIndex && publishBranchIndex < uploadPagesIndex && uploadPagesIndex < deployPagesIndex)) {
    fail('public deploy root must be sanitized, published to public, uploaded as a Pages artifact, and then deployed in one workflow');
  }
  if (!workflow.includes("if: steps.settings.outputs.publish_enabled == 'true' && steps.settings.outputs.pages_deploy_enabled == 'true'") || !workflow.includes("if: needs.publish.outputs.publish_enabled == 'true' && needs.publish.outputs.pages_deploy_enabled == 'true'")) {
    fail('Pages artifact upload and deploy job must be gated by publish_enabled and pages_deploy_enabled so the inspectable public branch remains the fallback');
  }
  if (/repository_dispatch:|tiinex-public-pages-deploy|repos\/\$\{GITHUB_REPOSITORY\}\/dispatches/u.test(workflow)) {
    fail('Pages deployment must stay in the same workflow file instead of relying on repository_dispatch ordering');
  }
  if (!app.includes('tiinexConfiguredBuildIdentity') || !app.includes('TIINEX_APP_BUILD_DEFAULT')) fail('app build identity must be configurable by published viewer options');
  if (app.includes("const TIINEX_APP_BUILD = Object.freeze({") && app.includes("repository: 'Tiinex/site'")) fail('app build identity must not hardcode Tiinex/site as the only source repository');
  if (workflow.includes("github.ref_name == github.event.repository.default_branch")) {
    fail('fork publish must not be limited to the repository default branch; non-public working branches should be publishable');
  }
  note('workspace-owned repository snapshots, persistent transport decisions, co-hosted mirror discovery, workspace-owned and configured mirror sources, fork-safe self-mirror handling, branch publication from non-public branches, pinned source-ref publication, and single-workflow Actions Pages deployment with inspectable public branch fallback contracts are valid');
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
  const appJs = read('app.js');
  if (!buildScript.includes("argValue('--out', '.site-publish')")) fail('build-public must default to .site-publish and accept --out for checks');
  if (!buildScript.includes('tiinex.bundle.js')) fail('build-public must create tiinex.bundle.js');
  if (!buildScript.includes('window.TIINEX_VIEWER_OPTIONS')) fail('build-public must include viewer options before app.js in the bundle');
  for (const token of ['copyPathIfExists', 'TIINEX_VIEWER_GIT_REPO', 'TIINEX_VIEWER_GIT_REF', 'TIINEX_VIEWER_GIT_ROOTS', 'TIINEX_VIEWER_TITLE', 'TIINEX_BUILD_REPOSITORY', 'TIINEX_BUILD_CHANNEL', 'buildIdentity', 'PAGES_CNAME', 'TIINEX_USE_SOURCE_CNAME', 'TIINEX_PUBLIC_REDIRECTS']) {
    if (!buildScript.includes(token)) fail(`build-public must support repo-agnostic publish configuration: ${token}`);
  }
  if (/repo:\s*['"]Tiinex\/docs['"]/u.test(buildScript)) {
    fail('build-public must not hardcode Tiinex/docs as the published viewer repository');
  }
  for (const section of ['src/app/core-runtime.js', 'src/app/services-runtime.js', 'src/app/state-runtime.js', 'src/app/ui-runtime.js', 'src/app/viewstate-runtime.js', 'app.js']) {
    if (!buildScript.includes(section)) fail(`build-public must include ${section}`);
  }

  const checkScript = read('tools/check-public-build.mjs');
  if (!checkScript.includes('public index must load exactly one local JS bundle')) fail('public build checker must enforce one local app bundle');
  if (!checkScript.includes('node --check public bundle failed')) fail('public build checker must syntax-check the bundle');
  for (const token of ['tiinex.build.json', 'publicBuildIdentity', 'releaseCacheKey']) {
    if (!buildScript.includes(token)) fail(`public build must emit a fetchable publication identity for open-tab cache invalidation: ${token}`);
  }
  for (const token of ['checkPublicBuildIdentity', 'publicBuildIdentityUrl', 'invalidateRuntimeCachesForExplicitRelease', 'publicContentIdentity', 'autoReloadOnPublicBuildChange', 'shouldCheckPublicBuildIdentity', 'publicBuildIdentityCheckMinIntervalMs', 'publicBuildPollingEnabled', 'startup-first-load', 'publicBuildFirstLoadCheckDone']) {
    if (!appJs.includes(token)) fail(`runtime must monitor public build identity and invalidate stale source cache without manual F5: ${token}`);
  }
  if (appJs.includes('check=${Date.now()}') || appJs.includes("cache: 'no-store'")) {
    fail('public build identity checks must be event/TTL-gated and cache-friendly; do not poll unique no-store tiinex.build.json URLs.');
  }

  const workflow = read('.github/workflows/publish-public.yml');
  for (const required of ['npm test', 'npm run build:public', 'publish_dir: .site-publish', 'publish_branch: public']) {
    if (!workflow.includes(required)) fail(`publish workflow must include ${required}`);
  }
  const publicBranchConcurrency = workflow.includes('group: publish-public-${{ github.repository }}-public-branch')
    && workflow.includes('cancel-in-progress: false');
  if (!publicBranchConcurrency) {
    fail('publish workflow must serialize public branch updates without cancel-in-progress so issue publication cannot starve.');
  }
  if (workflow.includes("cancel-in-progress: ${{ github.event_name == 'issues' || github.event_name == 'issue_comment' }}") || workflow.includes('Debounce issue burst')) {
    fail('issue publication must be cooldown/coalescing, not trailing-edge debounce or cancel-in-progress starvation.');
  }
  if (!workflow.includes('- name: Publish not required') || !workflow.includes("if: steps.settings.outputs.publish_enabled != 'true'")) {
    fail('publish workflow must finish intentionally disabled branch runs through an explicit successful Publish not required step.');
  }
  if (!workflow.includes('issues:') || !workflow.includes('issue_comment:') || !workflow.includes('sync-issues:') || !workflow.includes('TIINEX_ISSUE_PUBLISH_GRACE_SECONDS')) {
    fail('publish workflow must support hosted issue snapshot publication from issue and comment events.');
  }
  for (const token of ['Coalesce issue snapshot publish', '.tiinex/issue-publish-state.json', 'cooldown_remaining', 'pending_generation', 'snapshot_generation', 'follow-up required', 'npm run issues:state', 'npm run public:identity']) {
    if (!workflow.includes(token)) fail(`issue publication must be rate-limited/coalesced with durable diagnostics: ${token}`);
  }
  if (!workflow.includes('npm run issues:snapshot -- --out .site-publish')) {
    fail('publish workflow must generate hosted issue snapshots into the public artifact.');
  }
  const packageJsonForIssues = JSON.parse(read('package.json'));
  if (packageJsonForIssues.scripts?.['issues:snapshot'] !== 'node tools/build-issue-snapshots.mjs') {
    fail('package.json must expose issues:snapshot for hosted issue snapshot publication.');
  }
  if (packageJsonForIssues.scripts?.['issues:state'] !== 'node tools/write-issue-publish-state.mjs' || packageJsonForIssues.scripts?.['public:identity'] !== 'node tools/write-public-build-identity.mjs') {
    fail('package.json must expose issues:state and public:identity for coalesced issue publication and open-tab cache busting.');
  }
  const issueSnapshotScript = read('tools/build-issue-snapshots.mjs');
  for (const token of ['tiinex.github.issues.snapshot', "'issues', 'github.com'", 'TIINEX_ISSUE_SNAPSHOT_REPOSITORIES', 'TIINEX_ISSUE_SNAPSHOT_MAX_COMMENTS_PER_ISSUE']) {
    if (!issueSnapshotScript.includes(token)) fail(`issue snapshot publisher contract missing ${token}`);
  }
  if (/rsync\b/u.test(workflow)) fail('publish workflow must publish build output, not rsync the raw repository');

  note('repo-agnostic public build and publish workflow contracts are valid');
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
    'LINEAGE_POLICY.md',
    'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md',
    'SECURITY.md'
  ]);

  const ignoredInfrastructureRootEntries = new Set([
    '.git',
    '.gitmodules',
    '.mirrors',
    '.site-publish',
    'node_modules'
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

function validateWorkspaceShareAndIssueOpenContracts(source) {
  if (!source.includes('function shareWorkspaceEntrypointTarget')) fail('workspace share should have explicit entrypoint target helper');
  if (!source.includes('function shareWorkspaceTargetOpenAdapter')) fail('workspace share should coerce GitHub issue/comment workspace entrypoints to the workspace hash adapter');
  if (!source.includes("parts.length >= 4 && parts[2] === 'issues') return 'workspace'")) fail('workspace share GitHub issue targets must open as workspaces, not issue shells');
  if (!source.includes("workspace-entrypoint-artifact-source")) fail('workspace share should prefer workspace artifact entrypoint before selected normal artifact');
  const shareStart = source.indexOf('function shareWorkspacePublicTarget');
  const shareEnd = source.indexOf('function shareWorkspaceLocalOnlyCounts');
  const shareBlock = source.slice(shareStart, shareEnd);
  const entrypointIndex = shareBlock.indexOf('const entrypointTarget = shareWorkspaceEntrypointTarget(ws)');
  const selectedIndex = shareBlock.indexOf('const selected = selectedNode(ws)');
  if (entrypointIndex === -1 || selectedIndex === -1 || entrypointIndex > selectedIndex) {
    fail('workspace share target must prefer workspace entrypoint before selected artifact fallback');
  }
  if (!source.includes('const workspaceTargetNode = selected && isWorkspaceNode(selected)')) fail('workspace hash issue open should fall back to recovered workspace node when the issue shell was selected');
  if (!source.includes('openPublicWorkspaceIssueShareTarget(target, spec, options)')) fail('workspace hash issue shares should open embedded workspace payload directly before importing the card shell');
  if (!source.includes('embeddedWorkspaceMarkdownForPublicIssueShare')) fail('workspace hash issue shares must prefer matching issue/comment Source Markdown payloads');
  if (!source.includes('userInitiated: Boolean(options.userInitiated)')) fail('configured GitHub issue workspace open must propagate userInitiated from discovery/source refresh');
  if (!source.includes('openWorkspaceIssueTarget: options.openWorkspaceIssueTarget !== false')) fail('configured GitHub issue workspace open must propagate openWorkspaceIssueTarget');
  if (!source.includes('file?.text || file?.rawMarkdown || file?.markdown || file?.body || file?.content')) fail('GitHub publish/local draft binding should hash current local text before stale file.content');
  if (!source.includes('githubIssueThreadEmbeddedPayloadFidelity')) fail('GitHub issue fallback readers must verify embedded v2 Source Markdown bytes before accepting a thread.');
  if (!source.includes('TIINEX_GITHUB_READER_LOSSY_PAYLOAD')) fail('lossy GitHub reader payloads must be rejected instead of cached as exact source material.');
  if (!source.includes("allowSharedReaderFallback === true")) fail('shared anonymous GitHub readers must be explicit opt-in, never an automatic fan-out fallback.');
  if (!source.includes("return [`https://r.jina.ai/http://${target}`]")) fail('shared reader fallback must use one bounded URL shape.');
  if (source.includes('https://api.allorigins.win/raw?url=') || source.includes('https://corsproxy.io/?') || source.includes('http://r.jina.ai/http://')) fail('GitHub issue reads must not fan out through allorigins, corsproxy, or nested reader URLs.');
  if (!source.includes('adapterAbuseAlleviationUntil') || !source.includes('adapter.request.provider-circuit-open')) fail('shared provider abuse responses must open a persisted circuit breaker.');
  if (!source.includes("commentsMode: 'if-needed'")) fail('workspace issue pointers must read the issue body before fetching comments.');
  if (!source.includes('issue-thread.singleflight-hit')) fail('GitHub issue threads must coalesce concurrent identical reads.');
  if (!source.includes('githubIssueNetworkSafetyReport')) fail('GitHub issue request-budget diagnostics must remain available.');
  for (const token of ['beginDeferredGitHubIssueIndexing', 'endDeferredGitHubIssueIndexing', 'issue-thread-loader.live-index-deferred', 'deferIssueIndexing: deferIssueBatchIndexing', 'deferParentTraversal: deferIssueBatchIndexing', 'scheduleAdapterParentTraversalForWorkspace']) {
    if (!source.includes(token)) fail(`GitHub issue batch import must defer repeated index/parent traversal work so large mirrors do not lock the UI: ${token}`);
  }
  if (source.includes('hardRefresh: Boolean(options.hardRefresh || existingIssueSurface || knownTargets.length)')) fail('startup issue discovery must not hard-refresh merely because issue targets exist.');
  if (!source.includes('fetchGitHubIssueThreadViaHostedSnapshot') || !source.includes("'site-issue-snapshot'")) fail('hosted viewers must prefer same-origin issue snapshots before live GitHub reads.');
  if (!source.includes('fetchGitHubRepoIssueSpecsViaHostedSnapshot') || !source.includes('issue-list.live-skipped-no-hosted-snapshot')) fail('bounded issue discovery must list from same-origin hosted snapshots before any live GitHub issue-list request.');
  if (!source.includes('sourceModalGithubConfigSnapshot') || !source.includes('preserveGithubSourceConfigAfterDiscovery')) fail('source refresh/reset and discovery must preserve the edited source configuration and explicit issue/discussion targets.');
  if (!source.includes("githubPublicationReceipts: 'tiinex.github.publicationReceipts.v1'")) fail('verified GitHub publication receipts must have a durable storage owner.');
  if (!source.includes('recordVerifiedGithubPublicationReceipts(snapshots)')) fail('verified GitHub export completion must record durable publication receipts.');
  if (!source.includes("reconcileVerifiedGithubPublicationReceipts(ws, 'verified GitHub publication')")) fail('verified GitHub publication must reconcile its local shadow immediately.');
  if (!source.includes("reconcileVerifiedGithubPublicationReceipts(ws, context || 'source material reconciliation')")) fail('F5/local-state restore must reconcile verified publication receipts after exact source material is present.');
  if (!source.includes('pruneLocalDraftShadowsAfterSourceMaterial(ws, `GitHub issue ${spec.repo}#${spec.issueNumber}`)')) fail('GitHub issue import must run verified publication receipt reconciliation after source material arrives.');
  if (!source.includes('updatedAt > verifiedAt + 1000')) fail('publication receipt reconciliation must preserve local edits created after verification.');
  if (!source.includes('Imported material') || !source.includes('node?.rawMarkdown || file.rawMarkdown || file.content')) fail('source-backed integrity validation must prefer exact recovered source markdown over restored mutable text.');
  const localStateModule = read('src/state/local-workspace.mjs');
  if (!localStateModule.includes("content: normalizeLineEndings(file.text || file.rawMarkdown || file.content || '')")) fail('local state serialization must persist current authoring text before stale file.content.');
  if (!localStateModule.includes("updatedAt: file.updatedAt || ''")) fail('local draft persistence must retain updatedAt so verified publication reconciliation can preserve newer unpublished edits.');
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
  validateRepositoryTransportContracts();
  validatePublicBuildContracts();
  const appSource = read('app.js');
  checkRuntimeIssueMarkdownFenceContracts(appSource);
  validateWorkspaceShareAndIssueOpenContracts(appSource);
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
  if (existsSync(join(root, '.topics/.workspaces/viewer.workspace.md'))) {
    console.log('✓ embedded default workspace mirrors packaged workspace markdown');
  } else {
    console.log('✓ packaged default workspace is optional when runtime candidates own workspace bootstrap');
  }
  console.log('✓ architecture boundary manifest and product-readiness contracts are valid');
  console.log('✓ public build and publish workflow contracts are valid');
  console.log('\nStatic validation passed. Browser golden-flow validation is still required for UI behavior.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});


function checkRuntimeIssueMarkdownFenceContracts(appJs) {
  const badHelperCall = /(?<![\w$])escapeRegExp\s*\(/.test(appJs);
  if (badHelperCall) {
    fail('Runtime issue markdown fence parser references escapeRegExp(); use app.js escapeRegExpLiteral() helper instead.');
  }
  if (!/function\s+extractMarkdownFenceBlocks\s*\(/.test(appJs)) {
    fail('Runtime issue markdown fence parser is missing extractMarkdownFenceBlocks().');
  }
  if (!/function\s+markdownFence\s*\(/.test(appJs)) {
    fail('Runtime GitHub publication fence writer is missing markdownFence().');
  }
}
