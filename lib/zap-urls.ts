export const ZAP_DOCS_URL = "https://docs.zap.wzrd.tech";

export function publicZapOrigin(fallback?: string) {
  const configured = process.env.ZAP_PUBLIC_ORIGIN
    ?? process.env.ZAP_PUBLIC_BASE_URL
    ?? process.env.NEXT_PUBLIC_SITE_URL
    ?? process.env.VERCEL_PROJECT_PRODUCTION_URL
    ?? process.env.VERCEL_URL
    ?? fallback
    ?? "https://zap.wzrd.tech";
  const normalized = configured.startsWith("http://") || configured.startsWith("https://")
    ? configured
    : `https://${configured}`;
  return normalized.replace(/\/$/, "");
}
