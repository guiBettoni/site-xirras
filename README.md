# Site Xirras

Arquitetura separando o front do acesso ao banco, com deploy na Vercel e Supabase como banco.

## Estrutura

- `index.html`: interface principal.
- `dev` rota: painel administrativo separado via `/dev`.
- `styles.css`: estilos do site.
- `support.js`: runtime do componente.
- `api/state.js`: função serverless da Vercel para ler e gravar o estado.
- `api/upload.js`: função serverless que envia imagens para o Supabase Storage (sem base64 no banco).
- `server/index.js`: servidor Node para desenvolvimento local.
- `supabase/schema.sql`: schema normalizado do banco.
- `supabase/storage.sql`: cria o bucket público `media` para as imagens.
- `public/`: imagens públicas.
- `uploads/`: imagens do projeto.

## Variáveis de ambiente

Crie um `.env` na raiz com:

```env
PORT=3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=media
ADMIN_USERNAME=admin
ADMIN_PASSWORD_SALT=...
ADMIN_PASSWORD_HASH=...
ADMIN_SESSION_SECRET=...
```

> `SUPABASE_STORAGE_BUCKET` é opcional (padrão `media`). Rode `supabase/schema.sql` e `supabase/storage.sql` uma vez no SQL Editor do Supabase antes do primeiro uso. O `schema.sql` é idempotente: rode de novo após atualizar para aplicar as colunas novas (`config`, `game_time`, `mvp`, `photos`, `attendance.game_id`).

## Painel administrável (CMS)

Quase todo o conteúdo é editável em `/dev` (login), sem tocar no código:

- **Marca/textos:** logo, imagem do topo, textos do hero e do "Sobre", Pix, fundação.
- **SEO e compartilhamento:** título, descrição e imagem (Open Graph/Twitter) — aplicados dinamicamente; favicon automático.
- **Redes e contato:** Instagram, WhatsApp, e-mail e endereço (aparecem no rodapé).
- **Seções do site:** reordenar (subir/descer) e mostrar/ocultar cada bloco da home.
- **Integrantes, Ranking, Destaque, Mural, Galeria.**
- **Jogos:** cadastro completo (data, horário, tipo, local, times, placar, resultado, destaque, **MVP** e **fotos** da partida).
- **Presença por jogo:** cada confirmação fica vinculada a uma partida; a home mostra os confirmados do próximo jogo.
- **Imagens** vão para o Supabase Storage (bucket `media`); o banco guarda só a URL.

## Rodar local

```bash
npm start
```

## Fluxo de dados

- O navegador conversa só com `/api/state` (conteúdo) e `/api/upload` (imagens).
- A Vercel lê e grava no Supabase com a `service role key`.
- As imagens enviadas pelo painel vão para o Supabase Storage (bucket `media`); o banco guarda apenas a URL pública, não o base64.
- O painel de edição fica em `/dev` e exige login com sessão assinada no servidor.
- As tabelas ficam normalizadas e os dados são agregados no servidor para o painel.

### Como gerar o hash do admin

Use um salt novo e gere o hash com scrypt:

```bash
node -e "const crypto=require('node:crypto'); const password='SUA_SENHA'; const salt='SEU_SALT'; console.log(crypto.scryptSync(password, salt, 64).toString('hex'));"
```

## Deploy

- Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nas environment variables da Vercel.
- Configure também `ADMIN_USERNAME`, `ADMIN_PASSWORD_SALT`, `ADMIN_PASSWORD_HASH` e `ADMIN_SESSION_SECRET`.
- Faça deploy do repositório na Vercel.
- O `index.html` e os assets estáticos sobem junto com a função em `api/state.js`.
