const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const env = loadEnv(path.join(rootDir, ".env"));

const PORT = Number(process.env.PORT || env.PORT || 3000);
const SUPABASE_URL = String(process.env.SUPABASE_URL || env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();

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

function sendJson(res, statusCode, payload) {
  send(res, statusCode, JSON.stringify(payload), {
    "Content-Type": "application/json; charset=utf-8",
  });
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
  const normalized = urlPath === "/" ? "/index.html" : urlPath;
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
      heroBadge: "",
      heroTitle: "",
      heroTitle2: "",
      heroText: "",
      nextGamePlace: "",
      aboutTitle: "",
      aboutText: "",
      foundedDate: "",
      pixMensalidade: "",
      pixAvulso: "",
    },
    highlight: null,
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
  const highlight = firstRow(rows.highlights);
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
            heroBadge: normalizeText(site.hero_badge),
            heroTitle: normalizeText(site.hero_title),
            heroTitle2: normalizeText(site.hero_title_2),
            heroText: normalizeText(site.hero_text),
            nextGamePlace: normalizeText(site.next_game_place),
            aboutTitle: normalizeText(site.about_title),
            aboutText: normalizeText(site.about_text),
            foundedDate: normalizeText(site.founded_date),
            pixMensalidade: normalizeText(site.pix_mensalidade),
            pixAvulso: normalizeText(site.pix_avulso),
          }
        : {}),
    },
    highlight: highlight
      ? {
          id: highlight.id,
          playerName: normalizeText(highlight.player_name),
          weekLabel: normalizeText(highlight.week_label),
          reason: normalizeText(highlight.reason),
          votes: normalizeInt(highlight.votes),
          playerPhoto: highlight.player_photo || null,
        }
      : null,
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
  const highlight = payload.highlight;
  const members = Array.isArray(payload.members) ? payload.members : [];
  const games = Array.isArray(payload.games) ? payload.games : [];
  const albums = Array.isArray(payload.albums) ? payload.albums : [];
  const posts = Array.isArray(payload.posts) ? payload.posts : [];
  const attendance = Array.isArray(payload.attendance) ? payload.attendance : [];

  await Promise.all([
    clearTable("album_photos"),
    clearTable("attendance"),
    clearTable("games"),
    clearTable("posts"),
    clearTable("albums"),
    clearTable("members"),
  ]);

  await Promise.all([
    requestSupabase("site_settings?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        id: "main",
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
        updated_at: new Date().toISOString(),
      }),
    }),
    requestSupabase("highlights?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(
        highlight
          ? {
              id: "main",
              player_name: normalizeText(highlight.playerName),
              week_label: normalizeText(highlight.weekLabel),
              reason: normalizeText(highlight.reason),
              votes: normalizeInt(highlight.votes),
              player_photo: highlight.playerPhoto || null,
              updated_at: new Date().toISOString(),
            }
          : {
              id: "main",
              player_name: "",
              week_label: "Destaque da semana",
              reason: "",
              votes: 0,
              player_photo: null,
              updated_at: new Date().toISOString(),
            }
      ),
    }),
  ]);

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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/health" && req.method === "GET") {
      return sendJson(res, 200, {
        ok: true,
        storage: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
      });
    }

    if (url.pathname === "/api/state" && req.method === "GET") {
      const data = await getState();
      return sendJson(res, 200, { ok: true, data });
    }

    if (url.pathname === "/api/state" && req.method === "PUT") {
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
