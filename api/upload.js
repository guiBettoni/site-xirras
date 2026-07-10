const fs = require("node:fs");
const path = require("node:path");
const { buildAdminAuth } = require("../lib/admin-auth");

const rootDir = path.resolve(__dirname, "..");
const env = loadEnv(path.join(rootDir, ".env"));

const SUPABASE_URL = String(process.env.SUPABASE_URL || env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();
const STORAGE_BUCKET = String(process.env.SUPABASE_STORAGE_BUCKET || env.SUPABASE_STORAGE_BUCKET || "media").trim();

const adminAuth = buildAdminAuth({
  username: process.env.ADMIN_USERNAME || env.ADMIN_USERNAME,
  passwordSalt: process.env.ADMIN_PASSWORD_SALT || env.ADMIN_PASSWORD_SALT,
  passwordHash: process.env.ADMIN_PASSWORD_HASH || env.ADMIN_PASSWORD_HASH,
  sessionSecret: process.env.ADMIN_SESSION_SECRET || env.ADMIN_SESSION_SECRET,
  secureCookie: Boolean(process.env.VERCEL || process.env.NODE_ENV === "production"),
});

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);
const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

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

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function readBinaryBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    req.on("data", (chunk) => {
      length += chunk.length;
      if (length > MAX_UPLOAD_BYTES) {
        reject(Object.assign(new Error("Imagem muito grande (máx. 8 MB)."), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function buildObjectPath(fileName, contentType) {
  const dot = String(fileName || "").lastIndexOf(".");
  const rawExt = dot > -1 ? String(fileName).slice(dot + 1).toLowerCase() : "";
  const ext = (rawExt && /^[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : EXT_BY_MIME[contentType]) || "bin";
  const base = slugify(dot > -1 ? String(fileName).slice(0, dot) : fileName) || "imagem";
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return `${base}-${stamp}.${ext}`;
}

async function uploadToStorage(objectPath, buffer, contentType) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw Object.assign(new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente."), { status: 503 });
  }
  const endpoint = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${encodeURI(objectPath)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    body: buffer,
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text || response.statusText;
    try { const j = JSON.parse(text); message = j.message || j.error || message; } catch {}
    throw Object.assign(new Error(message || "Falha ao enviar a imagem."), { status: response.status });
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${encodeURI(objectPath)}`;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    }
    if (!adminAuth.isConfigured()) {
      return sendJson(res, 503, { ok: false, error: "Admin nao configurado." });
    }
    if (!adminAuth.isAuthorizedRequest(req)) {
      return sendJson(res, 401, { ok: false, error: "Sem permissão para enviar imagens." });
    }

    const contentType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_MIME.has(contentType)) {
      return sendJson(res, 415, { ok: false, error: "Formato não suportado. Envie JPG, PNG, WEBP, GIF ou SVG." });
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const fileName = url.searchParams.get("filename") || "imagem";

    const buffer = await readBinaryBody(req);
    if (!buffer.length) {
      return sendJson(res, 400, { ok: false, error: "Arquivo vazio." });
    }

    const objectPath = buildObjectPath(fileName, contentType);
    const publicUrl = await uploadToStorage(objectPath, buffer, contentType);

    return sendJson(res, 200, { ok: true, url: publicUrl, path: objectPath });
  } catch (error) {
    return sendJson(res, error.status || 500, { ok: false, error: error.message || "Erro interno." });
  }
};
