export function requireServiceToken(token: string) {
  const expected = process.env.ZAP_CONVEX_SERVICE_TOKEN;
  if (!expected || token !== expected) throw new Error("Unauthorized Convex service caller.");
}
