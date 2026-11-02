const globalRateLimits = globalThis.__kreoDashboardRateLimits || new Map();

if (!globalThis.__kreoDashboardRateLimits) {
  globalThis.__kreoDashboardRateLimits = globalRateLimits;
}

function now() {
  return Date.now();
}

export function checkRateLimit(key, { limit, windowMs }) {
  const currentTime = now();
  for (const [id, entry] of globalRateLimits) {
    if (entry.resetAt <= currentTime) globalRateLimits.delete(id);
  }
  if (globalRateLimits.size >= 10_000 && !globalRateLimits.has(key)) {
    return { allowed: false, remaining: 0, resetAt: currentTime + windowMs };
  }
  const existing = globalRateLimits.get(key);

  if (!existing || existing.resetAt <= currentTime) {
    const nextEntry = {
      count: 1,
      resetAt: currentTime + windowMs,
    };
    globalRateLimits.set(key, nextEntry);
    return { allowed: true, remaining: limit - 1, resetAt: nextEntry.resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - existing.count), resetAt: existing.resetAt };
}
