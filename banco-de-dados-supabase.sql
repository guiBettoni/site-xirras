-- ============================================================
--  XIRRAS VOLEIBOL CLUB — Banco de dados (Supabase / Postgres)
-- ============================================================
--
-- COMO USAR:
-- 1) Entre no seu projeto em https://supabase.com
-- 2) Menu lateral: "SQL Editor" -> "New query"
-- 3) Cole TODO este arquivo e clique em "Run"
-- 4) Depois, no site: botao "Admin" -> aba "Dados" -> "Banco de dados (Supabase)"
--    Cole a Project URL e a chave "anon public" (em: Project Settings -> API)
--    e clique em "Conectar e sincronizar".
--
-- MODELO: uma unica linha (id = 'main') guarda todo o estado do site em JSON.
-- Simples, confiavel e facil de dar backup.
-- ============================================================

create table if not exists public.xirras_state (
  id         text primary key default 'main',
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Habilita a seguranca por linha (RLS)
alter table public.xirras_state enable row level security;

-- ATENCAO: politicas ABERTAS (leitura e escrita para qualquer visitante).
-- Isso e proposital por enquanto ("painel aberto, so o grupo tem o link").
-- Quando quiser trancar o painel com login, me avise que eu troco estas
-- politicas para exigir usuario autenticado.

drop policy if exists "xirras leitura publica"  on public.xirras_state;
drop policy if exists "xirras insercao publica" on public.xirras_state;
drop policy if exists "xirras update publico"   on public.xirras_state;

create policy "xirras leitura publica"
  on public.xirras_state for select
  using (true);

create policy "xirras insercao publica"
  on public.xirras_state for insert
  with check (true);

create policy "xirras update publico"
  on public.xirras_state for update
  using (true) with check (true);

-- Cria a linha inicial (se ainda nao existir)
insert into public.xirras_state (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;
