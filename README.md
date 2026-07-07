# Site Xirras

Arquitetura separando o front do acesso ao banco, com deploy na Vercel e Supabase como banco.

## Estrutura

- `index.html`: interface principal.
- `dev` rota: painel administrativo separado via `/dev`.
- `styles.css`: estilos do site.
- `support.js`: runtime do componente.
- `api/state.js`: função serverless da Vercel para ler e gravar o estado.
- `server/index.js`: servidor Node para desenvolvimento local.
- `supabase/schema.sql`: schema normalizado do banco.
- `public/`: imagens públicas.
- `uploads/`: imagens do projeto.

## Variáveis de ambiente

Crie um `.env` na raiz com:

```env
PORT=3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_USERNAME=admin
ADMIN_PASSWORD_SALT=...
ADMIN_PASSWORD_HASH=...
ADMIN_SESSION_SECRET=...
```

## Rodar local

```bash
npm start
```

## Fluxo de dados

- O navegador conversa só com `/api/state`.
- A Vercel lê e grava no Supabase com a `service role key`.
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
