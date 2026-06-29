export function schemaKey(schemaId) {
  const text = String(schemaId || '').toLowerCase();
  if (text.includes('discovery.')) return 'discovery';
  if (text.includes('resource.')) return 'resource';
  if (text.includes('instrument.')) return 'instrument';
  if (text.includes('relation')) return 'relation';
  if (text.includes('privacy') || text.includes('redaction')) return 'privacy';
  if (text.includes('attestation')) return 'attestation';
  if (text.includes('external.payload')) return 'payload';
  if (text.includes('topic')) return 'topic';
  if (text.includes('task')) return 'task';
  if (text.includes('decision')) return 'decision';
  if (text.includes('evidence')) return 'evidence';
  if (text.includes('feedback')) return 'feedback';
  if (text.includes('reduction')) return 'reduction';
  if (text.includes('runtime')) return 'runtime';
  if (text.includes('signal')) return 'signal';
  if (text.includes('pointer')) return 'pointer';
  if (text.includes('lineage.upgrade')) return 'lineage-upgrade';
  if (text.includes('schema.family') || text.includes('definition')) return 'schema-governance';
  if (text.includes('validation.method')) return 'validation';
  return schemaId ? 'unknown' : 'plain';
}

export function schemaBadgeClass(schemaId) {
  const key = schemaKey(schemaId);
  const known = [
    'topic', 'task', 'decision', 'evidence', 'feedback', 'reduction',
    'runtime', 'signal', 'pointer', 'discovery', 'resource', 'instrument',
    'relation', 'privacy', 'attestation', 'payload', 'lineage-upgrade',
    'schema-governance', 'validation'
  ];
  if (known.includes(key)) return key;
  return key === 'plain' ? 'plain' : 'unknown';
}

export function schemaIdFromText(value, fallback = 'tiinex.topic.v1') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  const markdown = text.match(/\[([^\]]+)\]\([^)]+\)/);
  if (markdown) return markdown[1].trim() || fallback;
  return text.replace(/^Current Schema:\s*/i, '').trim() || fallback;
}
