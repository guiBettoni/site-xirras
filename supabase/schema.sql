-- ============================================================
--  XIRRAS VOLEIBOL CLUB - Schema normalizado
-- ============================================================
--
-- O front fala com o servidor Node local, e o servidor usa a
-- service role key para ler/gravar estas tabelas no Supabase.
-- ============================================================

create table if not exists public.site_settings (
  id               text primary key default 'main',
  hero_image_url   text,
  hero_badge       text not null default '',
  hero_title       text not null default '',
  hero_title_2     text not null default '',
  hero_text        text not null default '',
  next_game_place  text not null default '',
  about_title      text not null default '',
  about_text       text not null default '',
  founded_date     date,
  pix_mensalidade  text not null default '',
  pix_avulso       text not null default '',
  updated_at       timestamptz not null default now()
);

alter table public.site_settings
  add column if not exists hero_image_url text;

create table if not exists public.highlights (
  id            text primary key default 'main',
  player_name   text not null default '',
  week_label    text not null default 'Destaque da semana',
  reason        text not null default '',
  votes         integer not null default 0,
  player_photo  text,
  updated_at    timestamptz not null default now()
);

create table if not exists public.members (
  id         text primary key,
  nome       text not null default '',
  apelido    text not null default '',
  foto       text,
  jogos      integer not null default 0,
  vitorias   integer not null default 0,
  derrotas   integer not null default 0,
  pontos     integer not null default 0,
  mvp        integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.games (
  id            text primary key,
  event_date    date,
  title         text not null default '',
  location      text not null default '',
  match_type    text not null default 'interno',
  team_a        text not null default '',
  team_b        text not null default '',
  score_a       integer,
  score_b       integer,
  result        text not null default '',
  highlight_text text not null default '',
  updated_at    timestamptz not null default now()
);

create table if not exists public.albums (
  id         text primary key,
  title      text not null default '',
  event_date date,
  cover_url  text,
  updated_at timestamptz not null default now()
);

create table if not exists public.album_photos (
  id         text primary key,
  album_id   text not null references public.albums(id) on delete cascade,
  url        text not null,
  caption    text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id         text primary key,
  title      text not null default '',
  content    text not null default '',
  category   text not null default '',
  author     text not null default '',
  image_url  text,
  created_at date,
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id         text primary key,
  name       text not null default '',
  status     text not null default 'Confirmado',
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;
alter table public.highlights enable row level security;
alter table public.members enable row level security;
alter table public.games enable row level security;
alter table public.albums enable row level security;
alter table public.album_photos enable row level security;
alter table public.posts enable row level security;
alter table public.attendance enable row level security;

insert into public.site_settings (id) values ('main')
on conflict (id) do nothing;

insert into public.highlights (id) values ('main')
on conflict (id) do nothing;
