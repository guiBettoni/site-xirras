const crypto = require("node:crypto");

const COOKIE_NAME = "xirras_admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function parseCookies(headerValue) {
  const cookies = {};
  if (!headerValue) return cookies;
  for (const part of String(headerValue).split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function timingSafeEqualString(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function createSessionToken(secret, payload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(secret, token) {
  if (!token || !secret) return null;
  const parts = String(token).split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;
  const expected = sign(encodedPayload, secret);
  if (!timingSafeEqualString(signature, expected)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (!payload || typeof payload !== "object") return null;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function buildCookieValue(value, options = {}) {
  const parts = [`${COOKIE_NAME}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function normalize(value) {
  return String(value || "").trim();
}

function hashPassword(password, salt) {
  if (!password || !salt) return "";
  return crypto.scryptSync(String(password), String(salt), 64).toString("hex");
}

function buildAdminAuth(config = {}) {
  const username = normalize(config.username);
  const passwordSalt = normalize(config.passwordSalt);
  const passwordHash = normalize(config.passwordHash);
  const sessionSecret = normalize(config.sessionSecret);
  const secureCookie = Boolean(config.secureCookie);
  const enabled = Boolean(username && passwordSalt && passwordHash && sessionSecret);

  function isConfigured() {
    return enabled;
  }

  function verifyCredentials(inputUsername, inputPassword) {
    if (!enabled) return false;
    if (!timingSafeEqualString(normalize(inputUsername), username)) return false;
    const candidate = hashPassword(inputPassword, passwordSalt);
    if (!candidate) return false;
    return timingSafeEqualString(candidate, passwordHash);
  }

  function createSessionCookie() {
    const token = createSessionToken(sessionSecret, {
      role: "admin",
      user: username,
      exp: Date.now() + SESSION_TTL_MS,
    });
    return buildCookieValue(token, {
      maxAge: SESSION_TTL_MS / 1000,
      secure: secureCookie,
    });
  }

  function clearSessionCookie() {
    return buildCookieValue("", {
      maxAge: 0,
      secure: secureCookie,
    });
  }

  function isAuthorizedRequest(req) {
    if (!enabled) return false;
    const cookies = parseCookies(req.headers && req.headers.cookie);
    const payload = verifySessionToken(sessionSecret, cookies[COOKIE_NAME]);
    return Boolean(payload && payload.role === "admin" && normalize(payload.user) === username);
  }

  return {
    isConfigured,
    verifyCredentials,
    createSessionCookie,
    clearSessionCookie,
    isAuthorizedRequest,
  };
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_MS,
  buildAdminAuth,
  parseCookies,
  verifySessionToken,
};
