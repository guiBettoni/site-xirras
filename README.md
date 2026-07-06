# Site Xirras

Arquitetura separando o front do acesso ao banco, com deploy na Vercel e Supabase como banco.

## Estrutura

- `index.html`: interface principal.
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
```

## Rodar local

```bash
npm start
```

## Fluxo de dados

- O navegador conversa só com `/api/state`.
- A Vercel lê e grava no Supabase com a `service role key`.
- As tabelas ficam normalizadas e os dados são agregados no servidor para o painel.

## Deploy

- Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nas environment variables da Vercel.
- Faça deploy do repositório na Vercel.
- O `index.html` e os assets estáticos sobem junto com a função em `api/state.js`.
