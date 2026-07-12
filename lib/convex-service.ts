export function convexServiceToken() {
  const token = process.env.ZAP_CONVEX_SERVICE_TOKEN?.trim();
  if (!token) {
    throw new Error("ZAP_CONVEX_SERVICE_TOKEN is required for privileged Convex access.");
  }
  return token;
}
