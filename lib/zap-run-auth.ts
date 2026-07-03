export function liveRunAuthError(live: boolean, userAccessToken?: string) {
  if (!live || userAccessToken) return null;
  return "Live Zap runs require wallet auth and a Supabase access token.";
}
