import crypto from "node:crypto";

const refreshes = new Map();

export async function refreshDiscordToken(token, credentials, fetchImpl = fetch, now = Date.now()) {
  if (!token.refreshToken) return { ...token, accessToken: undefined, error: "RefreshAccessTokenError" };
  const key = crypto.createHash("sha256").update(token.refreshToken).digest("hex");
  for (const [id, entry] of refreshes) if (entry.expiresAt <= now) refreshes.delete(id);
  if (!refreshes.has(key)) {
    const promise = (async () => {
      const response = await fetchImpl("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token", refresh_token: token.refreshToken,
          client_id: credentials.clientId, client_secret: credentials.clientSecret,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      const data = await response.json();
      if (!response.ok || typeof data.access_token !== "string" || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) <= 0) {
        throw new Error("Discord token refresh failed");
      }
      return {
        accessToken: data.access_token,
        accessTokenExpires: Date.now() + Number(data.expires_in) * 1000,
        refreshToken: data.refresh_token || token.refreshToken,
      };
    })();
    if (refreshes.size >= 1000) refreshes.delete(refreshes.keys().next().value);
    refreshes.set(key, { promise, expiresAt: now + 60_000 });
  }
  try {
    return { ...token, ...await refreshes.get(key).promise, error: undefined };
  } catch {
    refreshes.delete(key);
    return { ...token, accessToken: undefined, error: "RefreshAccessTokenError" };
  }
}
