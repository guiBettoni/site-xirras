-- ============================================================
--  XIRRAS - Supabase Storage (imagens sem base64 no banco)
-- ============================================================
--  Rode no SQL Editor do Supabase (uma vez). Cria um bucket
--  publico "media" onde as imagens enviadas pelo painel ficam
--  guardadas. O upload e feito pelo servidor com a service role
--  key (via /api/upload); o site le as imagens pela URL publica.
--
--  Se preferir outro nome de bucket, ajuste aqui E defina
--  SUPABASE_STORAGE_BUCKET no ambiente (Vercel / .env).
-- ============================================================

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

-- Leitura publica dos arquivos do bucket (o site mostra as imagens).
drop policy if exists "media leitura publica" on storage.objects;
create policy "media leitura publica"
  on storage.objects for select
  using (bucket_id = 'media');

-- Observacao: o envio (INSERT/UPDATE) e feito pelo servidor com a
-- service role key, que ignora RLS. Por isso NAO criamos politica
-- de escrita publica - so o painel autenticado envia imagens.
