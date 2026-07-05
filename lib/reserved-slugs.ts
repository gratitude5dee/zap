const reservedSlugs = new Set([
  "api",
  "docs",
  "embed",
  "gallery",
  "quickstart",
  "runs",
  "settings",
  "studio",
  "zap",
]);

export function isReservedSlug(slug: string) {
  return reservedSlugs.has(slug.toLowerCase());
}
