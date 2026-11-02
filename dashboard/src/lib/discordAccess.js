const MANAGE_GUILD = 0x20;
const ADMINISTRATOR = 0x8;
const GUILD_CACHE_TTL_MS = 5 * 60_000;

const discordGuildCache = globalThis.__kreoDiscordGuildCache || new Map();
const discordGuildInflight = globalThis.__kreoDiscordGuildInflight || new Map();

if (!globalThis.__kreoDiscordGuildCache) {
  globalThis.__kreoDiscordGuildCache = discordGuildCache;
}

if (!globalThis.__kreoDiscordGuildInflight) {
  globalThis.__kreoDiscordGuildInflight = discordGuildInflight;
}

export async function fetchDiscordGuilds(accessToken) {
  if (!accessToken) {
    return [];
  }

  const cacheKey = accessToken;
  const cachedEntry = discordGuildCache.get(cacheKey);
  const currentTime = Date.now();
  for (const [id, entry] of discordGuildCache) {
    if (entry.expiresAt <= currentTime && !entry.retryAfterUntil) discordGuildCache.delete(id);
  }

  if (cachedEntry?.guilds && cachedEntry.expiresAt > currentTime) {
    return cachedEntry.guilds;
  }

  if (cachedEntry?.retryAfterUntil && cachedEntry.retryAfterUntil > currentTime && cachedEntry.guilds) {
    return cachedEntry.guilds;
  }

  const inflightRequest = discordGuildInflight.get(cacheKey);
  if (inflightRequest) {
    return inflightRequest;
  }

  const requestPromise = (async () => {
    const response = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      if (response.status === 429 && cachedEntry?.guilds) {
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterMs = retryAfterHeader ? Math.ceil(Number(retryAfterHeader) * 1000) : 15_000;
        discordGuildCache.set(cacheKey, {
          ...cachedEntry,
          retryAfterUntil: currentTime + retryAfterMs,
        });
        return cachedEntry.guilds;
      }

      throw new Error(`Discord guild lookup failed with status ${response.status}`);
    }

    const guilds = await response.json();
    const safeGuilds = Array.isArray(guilds) ? guilds : [];

    if (discordGuildCache.size >= 5000) discordGuildCache.delete(discordGuildCache.keys().next().value);
    discordGuildCache.set(cacheKey, {
      guilds: safeGuilds,
      expiresAt: Date.now() + GUILD_CACHE_TTL_MS,
      retryAfterUntil: 0,
    });

    return safeGuilds;
  })();

  discordGuildInflight.set(cacheKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    discordGuildInflight.delete(cacheKey);
  }
}

export function hasGuildManageAccess(guild) {
  const permissions = Number(guild?.permissions) || 0;
  return Boolean(guild?.owner) || (permissions & MANAGE_GUILD) === MANAGE_GUILD || (permissions & ADMINISTRATOR) === ADMINISTRATOR;
}

export function getGuildAccess(guilds, guildId) {
  const guild = Array.isArray(guilds) ? guilds.find((entry) => entry.id === guildId) : null;

  return {
    guild: guild || null,
    isMember: Boolean(guild),
    isOwner: Boolean(guild?.owner),
    canManage: hasGuildManageAccess(guild),
  };
}
