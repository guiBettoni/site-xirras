const fs = require("node:fs");
const path = require("node:path");
const { buildAdminAuth } = require("../lib/admin-auth");

const rootDir = path.resolve(__dirname, "..");
const env = loadEnv(path.join(rootDir, ".env"));

const SUPABASE_URL = String(process.env.SUPABASE_URL || env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();
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

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
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

async function requestSupabase(endpointPath, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente da Vercel.");
  }

  const url = new URL(endpointPath.replace(/^\/+/, ""), `${SUPABASE_URL}/rest/v1/`);
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/json",
    ...(options.headers || {}),
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

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

async function selectTable(table, query = "select=*") {
  const data = await requestSupabase(`${table}?${query}`, { method: "GET" });
  return Array.isArray(data) ? data : [];
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

async function clearTable(table) {
  await requestSupabase(`${table}?id=not.is.null`, {
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
          updated_at: new Date().toISOString(),
        });
      }
    }
    if (photos.length) {
      await requestSupabase("album_photos?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(photos),
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
          updated_at: new Date().toISOString(),
        }))
      ),
    });
  }

  if (attendance.length) {
    await requestSupabase("attendance?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(
        attendance.map((item) => ({
          ...toAttendanceRow(item),
          updated_at: new Date().toISOString(),
        }))
      ),
    });
  }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const data = await getState();
      return sendJson(res, 200, { ok: true, data });
    }

    if (req.method === "PUT") {
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

    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      ok: false,
      error: error.message || "Erro interno.",
    });
  }
};
