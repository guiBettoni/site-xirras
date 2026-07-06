const fs = require("node:fs");
const path = require("node:path");
const { buildAdminAuth } = require("../../lib/admin-auth");

const rootDir = path.resolve(__dirname, "../..");
const env = loadEnv(path.join(rootDir, ".env"));

const adminAuth = buildAdminAuth({
  username: process.env.ADMIN_USERNAME || env.ADMIN_USERNAME,
  passwordSalt: process.env.ADMIN_PASSWORD_SALT || env.ADMIN_PASSWORD_SALT,
  passwordHash: process.env.ADMIN_PASSWORD_HASH || env.ADMIN_PASSWORD_HASH,
  sessionSecret: process.env.ADMIN_SESSION_SECRET || env.ADMIN_SESSION_SECRET,
  secureCookie: Boolean(process.env.VERCEL || process.env.NODE_ENV === "production"),
});

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const src = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = normalized.indexOf("=");
    if (eq === -1) continue;
    const key = normalized.slice(0, eq).trim();
    let value = normalized.slice(eq + 1).trim();
    if (!key) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  }
  return out;
}

function sendJson(res, statusCode, payload, cookies = []) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  try {
    if (!adminAuth.isConfigured()) {
      return sendJson(res, 503, { ok: false, error: "Admin nao configurado." });
    }

    if (req.method !== "POST") {
      return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    }

    return sendJson(
      res,
      200,
      { ok: true },
      [adminAuth.clearSessionCookie()]
    );
  } catch (error) {
    return sendJson(res, error.status || 500, {
      ok: false,
      error: error.message || "Erro interno.",
    });
  }
};
