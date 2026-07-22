export const ARCHITECTURE_BOUNDARIES = Object.freeze({
  layers: Object.freeze([
    Object.freeze({
      name: 'architecture',
      path: 'src/architecture',
      role: 'module boundary manifest and architecture contracts',
      mayImport: Object.freeze([]),
      forbids: Object.freeze([]),
    }),
    Object.freeze({
      name: 'app',
      path: 'src/app',
      role: 'bootstrap and orchestration',
      mayImport: Object.freeze(['core', 'state', 'services', 'ui', 'viewstate']),
      forbids: Object.freeze([]),
    }),
    Object.freeze({
      name: 'core',
      path: 'src/core',
      role: 'pure domain and markdown logic',
      mayImport: Object.freeze([]),
      forbids: Object.freeze(['document', 'window', 'localStorage', 'sessionStorage']),
    }),
    Object.freeze({
      name: 'state',
      path: 'src/state',
      role: 'application state and store coordination',
      mayImport: Object.freeze(['core', 'services']),
      forbids: Object.freeze(['document']),
    }),
    Object.freeze({
      name: 'services',
      path: 'src/services',
      role: 'browser adapters, source loading, archive, and export services',
      mayImport: Object.freeze(['core']),
      forbids: Object.freeze(['innerHTML', 'outerHTML']),
    }),
    Object.freeze({
      name: 'ui',
      path: 'src/ui',
      role: 'feature rendering and DOM event binding',
      mayImport: Object.freeze(['core', 'state', 'services', 'viewstate']),
      forbids: Object.freeze(['localStorage', 'sessionStorage']),
    }),
    Object.freeze({
      name: 'viewstate',
      path: 'src/viewstate',
      role: 'route, lens, and scroll ownership',
      mayImport: Object.freeze(['core', 'state']),
      forbids: Object.freeze([]),
    }),
  ]),
});

export function architectureLayerForPath(path) {
  return ARCHITECTURE_BOUNDARIES.layers.find((layer) => path === layer.path || path.startsWith(`${layer.path}/`)) || null;
}
