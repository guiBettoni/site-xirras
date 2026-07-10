const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { buildAdminAuth } = require("../lib/admin-auth");

const rootDir = path.resolve(__dirname, "..");
const env = loadEnv(path.join(rootDir, ".env"));

const PORT = Number(process.env.PORT || env.PORT || 3000);
const SUPABASE_URL = String(process.env.SUPABASE_URL || env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();
const STORAGE_BUCKET = String(process.env.SUPABASE_STORAGE_BUCKET || env.SUPABASE_STORAGE_BUCKET || "media").trim();
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);
const EXT_BY_MIME = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg" };
const adminAuth = buildAdminAuth({
  username: process.env.ADMIN_USERNAME || env.ADMIN_USERNAME,
  passwordSalt: process.env.ADMIN_PASSWORD_SALT || env.ADMIN_PASSWORD_SALT,
  passwordHash: process.env.ADMIN_PASSWORD_HASH || env.ADMIN_PASSWORD_HASH,
  sessionSecret: process.env.ADMIN_SESSION_SECRET || env.ADMIN_SESSION_SECRET,
  secureCookie: Boolean(process.env.VERCEL || process.env.NODE_ENV === "production"),
});

const STATIC_ROOTS = [rootDir, path.join(rootDir, "public"), path.join(rootDir, "uploads")];

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
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

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function sendJson(res, statusCode, payload, cookies = []) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
  };
  if (cookies.length) headers["Set-Cookie"] = cookies;
  send(res, statusCode, JSON.stringify(payload), headers);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    req.on("data", (chunk) => {
      length += chunk.length;
      if (length > 1_000_000) {
        reject(new Error("Corpo da requisição muito grande."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function safeJoin(root, requestPath) {
  const cleaned = decodeURIComponent(requestPath).replace(/^\/+/, "");
  const resolved = path.resolve(root, cleaned);
  return resolved.startsWith(root) ? resolved : null;
}

function findStaticFile(urlPath) {
  const normalized = urlPath === "/" || urlPath === "/dev" || urlPath.startsWith("/dev/")
    ? "/index.html"
    : urlPath;
  for (const base of STATIC_ROOTS) {
    const resolved = safeJoin(base, normalized);
    if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }
  }
  return null;
}

async function requestSupabase(endpointPath, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.");
  }

  const url = new URL(endpointPath.replace(/^\/+/, ""), `${SUPABASE_URL}/rest/v1/`);
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/json",
    ...(options.headers || {}),
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message = data && typeof data === "object" && data.message ? data.message : text || response.statusText;
    const error = new Error(message || "Falha ao comunicar com o Supabase.");
    error.status = response.status;
    throw error;
  }

  return data;
}

async function selectTable(table, query = "select=*") {
  const data = await requestSupabase(`${table}?${query}`, { method: "GET" });
  return Array.isArray(data) ? data : [];
}

function firstRow(rows) {
  return rows && rows.length ? rows[0] : null;
}

function normalizeText(value, fallback = "") {
  return value == null ? fallback : String(value);
}

function normalizeInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function defaults() {
  return {
    site: {
      heroImage: "",
      heroBadge: "Clube de voleibol",
      heroTitle: "Xirras",
      heroTitle2: "Voleibol Club",
      heroText: "Treino, raça e união dentro e fora da areia. O Xirras nasceu para competir, evoluir e celebrar cada ponto como um time de verdade.",
      nextGamePlace: "Próximo jogo: agenda em atualização",
      aboutTitle: "Quem somos",
      aboutText: "O Xirras Voleibol Club reúne atletas, amigos e apaixonados pelo jogo em torno de treinos, partidas e eventos que fortalecem o grupo.",
      foundedDate: "",
      pixMensalidade: "PIX mensalidade: consulte o admin",
      pixAvulso: "PIX avulso: consulte o admin",
    },
    highlights: [],
    members: [],
    games: [],
    albums: [],
    posts: [],
    attendance: [],
  };
}

function aggregateState(rows) {
  const d = defaults();
  const site = firstRow(rows.site_settings);
  const highlights = rows.highlights || [];
  const members = rows.members || [];
  const games = rows.games || [];
  const albums = rows.albums || [];
  const albumPhotos = rows.album_photos || [];
  const posts = rows.posts || [];
  const attendance = rows.attendance || [];

  return {
    site: {
      ...d.site,
      ...(site
          ? {
              heroImage: normalizeText(site.hero_image_url),
              heroBadge: normalizeText(site.hero_badge) || d.site.heroBadge,
              heroTitle: normalizeText(site.hero_title) || d.site.heroTitle,
              heroTitle2: normalizeText(site.hero_title_2) || d.site.heroTitle2,
              heroText: normalizeText(site.hero_text) || d.site.heroText,
              nextGamePlace: normalizeText(site.next_game_place) || d.site.nextGamePlace,
              aboutTitle: normalizeText(site.about_title) || d.site.aboutTitle,
              aboutText: normalizeText(site.about_text) || d.site.aboutText,
              foundedDate: normalizeText(site.founded_date),
              pixMensalidade: normalizeText(site.pix_mensalidade) || d.site.pixMensalidade,
              pixAvulso: normalizeText(site.pix_avulso) || d.site.pixAvulso,
          }
        : {}),
    },
    config: (site && site.config && typeof site.config === "object") ? site.config : {},
    highlights: highlights.map((h) => ({
      id: h.id,
      gameId: normalizeText(h.game_id),
      playerName: normalizeText(h.player_name),
      reason: normalizeText(h.reason),
      votes: normalizeInt(h.votes),
      playerPhoto: h.player_photo || null,
    })),
    members: members.map((m) => ({
      id: m.id,
      nome: normalizeText(m.nome),
      apelido: normalizeText(m.apelido),
      foto: m.foto || null,
      stats: {
        jogos: normalizeInt(m.jogos),
        vitorias: normalizeInt(m.vitorias),
        derrotas: normalizeInt(m.derrotas),
        pontos: normalizeInt(m.pontos),
        mvp: normalizeInt(m.mvp),
      },
    })),
    games: games.map((g) => ({
      id: g.id,
      eventDate: normalizeText(g.event_date),
      title: normalizeText(g.title),
      location: normalizeText(g.location),
      matchType: normalizeText(g.match_type, "interno"),
      teamA: normalizeText(g.team_a),
      teamB: normalizeText(g.team_b),
      scoreA: g.score_a === null || g.score_a === undefined ? null : normalizeInt(g.score_a),
      scoreB: g.score_b === null || g.score_b === undefined ? null : normalizeInt(g.score_b),
      result: normalizeText(g.result),
      highlightText: normalizeText(g.highlight_text),
      time: normalizeText(g.game_time),
      mvp: normalizeText(g.mvp),
      photos: Array.isArray(g.photos) ? g.photos : [],
    })),
    albums: albums.map((a) => ({
      id: a.id,
      title: normalizeText(a.title),
      eventDate: normalizeText(a.event_date),
      coverUrl: a.cover_url || null,
      photos: albumPhotos
        .filter((p) => p.album_id === a.id)
        .map((p) => ({
          id: p.id,
          url: normalizeText(p.url),
          caption: normalizeText(p.caption),
        })),
    })),
    posts: posts.map((p) => ({
      id: p.id,
      title: normalizeText(p.title),
      content: normalizeText(p.content),
      category: normalizeText(p.category),
      author: normalizeText(p.author),
      imageUrl: p.image_url || null,
      createdAt: normalizeText(p.created_at),
    })),
    attendance: attendance.map((a) => ({
      id: a.id,
      name: normalizeText(a.name),
      status: normalizeText(a.status, "Confirmado"),
      gameId: normalizeText(a.game_id),
    })),
  };
}

function toMemberRow(member) {
  return {
    id: member.id,
    nome: normalizeText(member.nome),
    apelido: normalizeText(member.apelido),
    foto: member.foto || null,
    jogos: normalizeInt(member.stats && member.stats.jogos),
    vitorias: normalizeInt(member.stats && member.stats.vitorias),
    derrotas: normalizeInt(member.stats && member.stats.derrotas),
    pontos: normalizeInt(member.stats && member.stats.pontos),
    mvp: normalizeInt(member.stats && member.stats.mvp),
  };
}

function toHighlightRow(highlight) {
  return {
    id: highlight.id,
    game_id: normalizeText(highlight.gameId),
    player_name: normalizeText(highlight.playerName),
    reason: normalizeText(highlight.reason),
    votes: normalizeInt(highlight.votes),
    player_photo: highlight.playerPhoto || null,
  };
}

function toGameRow(game) {
  return {
    id: game.id,
    event_date: normalizeDate(game.eventDate),
    title: normalizeText(game.title),
    location: normalizeText(game.location),
    match_type: normalizeText(game.matchType, "interno"),
    team_a: normalizeText(game.teamA),
    team_b: normalizeText(game.teamB),
    score_a: game.scoreA === null || game.scoreA === undefined || game.scoreA === "" ? null : normalizeInt(game.scoreA),
    score_b: game.scoreB === null || game.scoreB === undefined || game.scoreB === "" ? null : normalizeInt(game.scoreB),
    result: normalizeText(game.result),
    highlight_text: normalizeText(game.highlightText),
    game_time: normalizeText(game.time),
    mvp: normalizeText(game.mvp),
    photos: Array.isArray(game.photos) ? game.photos : [],
  };
}

function toAlbumRow(album) {
  return {
    id: album.id,
    title: normalizeText(album.title),
    event_date: normalizeDate(album.eventDate),
    cover_url: album.coverUrl || null,
  };
}

function toPostRow(post) {
  return {
    id: post.id,
    title: normalizeText(post.title),
    content: normalizeText(post.content),
    category: normalizeText(post.category),
    author: normalizeText(post.author),
    image_url: post.imageUrl || null,
    created_at: normalizeDate(post.createdAt),
  };
}

function toAttendanceRow(item) {
  return {
    id: item.id,
    name: normalizeText(item.name),
    status: normalizeText(item.status, "Confirmado"),
    game_id: normalizeText(item.gameId),
  };
}

async function clearTable(table, filter = "id=not.is.null") {
  await requestSupabase(`${table}?${filter}`, {
    method: "DELETE",
    headers: {
      Prefer: "return=minimal",
    },
  });
}

async function saveState(data) {
  const payload = data && typeof data === "object" ? data : defaults();
  const site = payload.site || {};
  const highlights = Array.isArray(payload.highlights) ? payload.highlights : [];
  const members = Array.isArray(payload.members) ? payload.members : [];
  const games = Array.isArray(payload.games) ? payload.games : [];
  const albums = Array.isArray(payload.albums) ? payload.albums : [];
  const posts = Array.isArray(payload.posts) ? payload.posts : [];
  const attendance = Array.isArray(payload.attendance) ? payload.attendance : [];

  await Promise.all([
    clearTable("album_photos"),
    clearTable("attendance"),
    clearTable("highlights"),
    clearTable("games"),
    clearTable("posts"),
    clearTable("albums"),
    clearTable("members"),
  ]);

  await requestSupabase("site_settings?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: "main",
      hero_image_url: normalizeText(site.heroImage),
      hero_badge: normalizeText(site.heroBadge),
      hero_title: normalizeText(site.heroTitle),
      hero_title_2: normalizeText(site.heroTitle2),
      hero_text: normalizeText(site.heroText),
      next_game_place: normalizeText(site.nextGamePlace),
      about_title: normalizeText(site.aboutTitle),
      about_text: normalizeText(site.aboutText),
      founded_date: normalizeDate(site.foundedDate),
      pix_mensalidade: normalizeText(site.pixMensalidade),
      pix_avulso: normalizeText(site.pixAvulso),
      config: (payload.config && typeof payload.config === "object" && !Array.isArray(payload.config)) ? payload.config : {},
      updated_at: new Date().toISOString(),
    }),
  });

  if (highlights.length) {
    await requestSupabase("highlights?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(
        highlights.map((item) => ({
          ...toHighlightRow(item),
          updated_at: new Date().toISOString(),
        }))
      ),
    });
  }

  if (members.length) {
    await requestSupabase("members?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(members.map(toMemberRow)),
    });
  }

  if (games.length) {
    await requestSupabase("games?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(
        games.map((item) => ({
          ...toGameRow(item),
          event_date: normalizeDate(item.eventDate),
          updated_at: new Date().toISOString(),
        }))
      ),
    });
  }

  if (albums.length) {
    await requestSupabase("albums?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(
        albums.map((item) => ({
          ...toAlbumRow(item),
          event_date: normalizeDate(item.eventDate),
          updated_at: new Date().toISOString(),
        }))
      ),
    });

    const photos = [];
    for (const album of albums) {
      for (const photo of Array.isArray(album.photos) ? album.photos : []) {
        photos.push({
          id: photo.id || `ph_${Math.random().toString(36).slice(2, 10)}`,
          album_id: album.id,
          url: normalizeText(photo.url),
          caption: normalizeText(photo.caption),
        });
      }
    }
    if (photos.length) {
      await requestSupabase("album_photos?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(photos.map((item) => ({ ...item, updated_at: new Date().toISOString() }))),
      });
    }
  }

  if (posts.length) {
    await requestSupabase("posts?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(
        posts.map((item) => ({
          ...toPostRow(item),
          created_at: normalizeDate(item.createdAt),
          updated_at: new Date().toISOString(),
        }))
      ),
    });
  }

  if (attendance.length) {
    await requestSupabase("attendance?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(attendance.map((item) => ({ ...toAttendanceRow(item), updated_at: new Date().toISOString() }))),
    });
  }
}

async function getState() {
  const [siteSettings, highlights, members, games, albums, albumPhotos, posts, attendance] = await Promise.all([
    selectTable("site_settings"),
    selectTable("highlights"),
    selectTable("members"),
    selectTable("games"),
    selectTable("albums"),
    selectTable("album_photos"),
    selectTable("posts"),
    selectTable("attendance"),
  ]);

  return aggregateState({
    site_settings: siteSettings,
    highlights,
    members,
    games,
    albums,
    album_photos: albumPhotos,
    posts,
    attendance,
  });
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
    throw Object.assign(new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env."), { status: 503 });
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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/health" && req.method === "GET") {
      return sendJson(res, 200, {
        ok: true,
        storage: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
      });
    }

    if (url.pathname === "/api/admin/session" && req.method === "GET") {
      return sendJson(res, 200, {
        ok: true,
        authed: adminAuth.isAuthorizedRequest(req),
      });
    }

    if (url.pathname === "/api/admin/login" && req.method === "POST") {
      if (!adminAuth.isConfigured()) {
        return sendJson(res, 503, { ok: false, error: "Admin nao configurado." });
      }
      const raw = await readBody(req);
      const parsed = raw ? JSON.parse(raw) : {};
      const username = parsed && typeof parsed === "object" ? parsed.username : "";
      const password = parsed && typeof parsed === "object" ? parsed.password : "";
      if (!adminAuth.verifyCredentials(username, password)) {
        return sendJson(res, 401, { ok: false, error: "Credenciais invalidas." });
      }
      return sendJson(
        res,
        200,
        { ok: true, user: String(username).trim() },
        [adminAuth.createSessionCookie()]
      );
    }

    if (url.pathname === "/api/admin/logout" && req.method === "POST") {
      if (!adminAuth.isConfigured()) {
        return sendJson(res, 503, { ok: false, error: "Admin nao configurado." });
      }
      return sendJson(res, 200, { ok: true }, [adminAuth.clearSessionCookie()]);
    }

    if ((url.pathname === "/dev" || url.pathname.startsWith("/dev/")) && req.method === "GET") {
      const adminIndex = path.join(rootDir, "index.html");
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(adminIndex).pipe(res);
      return;
    }

    if (url.pathname === "/api/state" && req.method === "GET") {
      const data = await getState();
      return sendJson(res, 200, { ok: true, data });
    }

    if (url.pathname === "/api/state" && req.method === "PUT") {
      if (!adminAuth.isConfigured()) {
        return sendJson(res, 503, { ok: false, error: "Admin nao configurado." });
      }
      if (!adminAuth.isAuthorizedRequest(req)) {
        return sendJson(res, 401, { ok: false, error: "Sem permissão para editar o painel." });
      }
      const raw = await readBody(req);
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof parsed.data !== "object") {
        return sendJson(res, 400, { ok: false, error: "Payload inválido." });
      }
      await saveState(parsed.data);
      return sendJson(res, 200, { ok: true });
    }

    const staticFile = findStaticFile(url.pathname);
    if (staticFile) {
      res.writeHead(200, {
        "Content-Type": getMimeType(staticFile),
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(staticFile).pipe(res);
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    sendJson(res, error.status || 500, {
      ok: false,
      error: error.message || "Erro interno.",
    });
  }
});

server.listen(PORT, () => {
  console.log(`Site Xirras rodando em http://localhost:${PORT}`);
});
