// Coerce Gemini/Firestore list fields into string[] so .map() is always safe.

export function asStringArray(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      typeof item === 'string'
        ? item.trim()
          ? [item.trim()]
          : []
        : asStringArray(item)
    );
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') || trimmed.startsWith('(')) {
      try {
        const parsed = JSON.parse(trimmed.replace(/'/g, '"'));
        if (Array.isArray(parsed)) return asStringArray(parsed);
      } catch {
        /* fall through */
      }
    }
    return trimmed.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === 'object') {
    return Object.values(value).flatMap(asStringArray);
  }
  const s = String(value).trim();
  return s ? [s] : [];
}

export function withNormalizedTriageFields(fields) {
  if (!fields || typeof fields !== 'object') return fields;
  return {
    ...fields,
    riskIndicators: asStringArray(fields.riskIndicators),
  };
}
