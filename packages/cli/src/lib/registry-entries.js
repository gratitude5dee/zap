// @ts-check

/** @param {{ slug?: string, zap?: string }} zap */
export function registrySlug(zap) {
  return zap.slug ?? zap.zap ?? "unknown";
}

/** @param {{ slug?: string, zap?: string }} zap */
export function registrySkillName(zap) {
  const slug = registrySlug(zap);
  return slug.startsWith("zap-") ? slug : `zap-${slug}`;
}

/**
 * @param {Array<Record<string, unknown>>} zaps
 * @param {string} query
 */
export function searchRegistryEntries(zaps, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return zaps.filter((zap) => {
    const haystack = JSON.stringify(zap).toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
