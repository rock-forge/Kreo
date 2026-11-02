const crypto = require("node:crypto");

function verifySocketToken(token, secret, now = Date.now()) {
  if (!secret || typeof token !== "string" || token.length > 1024) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return null;
  const [encoded, signature] = parts;
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!/^\d{17,20}$/.test(payload.guildId) || !/^\d{17,20}$/.test(payload.userId) ||
        !Number.isSafeInteger(payload.expiresAt) || payload.expiresAt <= now ||
        payload.expiresAt > now + 5 * 60_000) return null;
    return payload;
  } catch { return null; }
}

module.exports = { verifySocketToken };
