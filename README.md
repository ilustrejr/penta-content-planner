# PENTA. Content Planner

App web pra planejar conteúdo de Instagram de múltiplos clientes da agência. Coleta site, perfis Instagram, notícias, biblioteca local, monta um briefing markdown completo, e (opcionalmente) gera os roteiros direto via Claude API.

## Setup local

```bash
cd C:\Users\ilust\jec-content-planner
npm install
copy .env.example .env
notepad .env
```

Edite o `.env` com:
- `APP_PASSWORD` — senha de acesso (deixe vazio em dev pra rodar sem login)
- `SESSION_SECRET` — string aleatória (gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `ANTHROPIC_API_KEY` — chave da Anthropic
- `STORAGE_BACKEND=fs` — em dev usa o disco local

Rodar:
```bash
npm start
```

Abre em http://localhost:5000.

## Como usar

1. **Login** (se `APP_PASSWORD` setada)
2. Selecione o cliente no dropdown ou clique **➕ Adicionar cliente**
3. **Painel Biblioteca:** edite a descrição, adicione legendas/transcrições, visualize/edite/remova arquivos
4. **Painel Gerar planejamento:** período, formato, notícias, data temática
5. Dois botões:
   - **📋 Gerar briefing** — produz markdown e salva em `output/{cliente}/`
   - **🤖 Gerar com IA agora** — gera o briefing E roda direto na Claude Sonnet 4.6

## Estrutura

```
jec-content-planner/
├── clients/                    # Cada cliente em sua pasta (storage fs)
│   ├── jec-advogados/
│   │   ├── config.json
│   │   ├── posts/
│   │   └── transcripts/
├── output/                     # Briefings e roteiros gerados
├── public/                     # UI estática
├── server.js                   # Express + auth + endpoints
├── auth.js                     # Senha única + cookie HMAC
├── ai.js                       # Integração Claude Sonnet 4.6
├── briefing.js                 # Monta o markdown
├── scrapers.js                 # Site/Instagram/notícias
├── clients.js                  # CRUD de cliente + library
├── storage.js                  # Abstração fs|s3
├── themed-dates.js             # Datas comemorativas BR
├── migrate-to-r2.js            # Script: sobe arquivos locais pro R2
├── render.yaml                 # Config de deploy no Render
└── .env                        # NÃO COMMITAR
```

---

# 🚀 Deploy no Render Free + Cloudflare R2 (custo R$0)

Stack final:
- **Render** — hospedagem do Node.js no free tier (web service dorme após 15min sem uso, acorda em ~30s)
- **Cloudflare R2** — storage persistente (10GB gratuitos pra sempre)
- **Domínio próprio** com subdomínio apontando pro Render

## Etapa 1 — Cloudflare R2 (storage)

1. **Crie conta gratuita** em [cloudflare.com](https://cloudflare.com)
2. No painel, vá em **R2** no menu lateral. Aceite os termos (não precisa cartão pra free tier)
3. Clique em **Create bucket**:
   - **Name:** `penta-planner` (ou outro nome único pra você)
   - **Location:** Automatic
   - Clique **Create bucket**
4. Volte na home do R2 e clique em **Manage R2 API tokens** (canto superior direito)
5. Clique em **Create API token**:
   - **Token name:** `penta-planner`
   - **Permissions:** Object Read & Write
   - **Specify bucket(s):** escolha o `penta-planner`
   - **TTL:** Forever
   - Clique **Create API token**
6. Copie e guarde:
   - **Access Key ID**
   - **Secret Access Key**
   - **Endpoint** (formato: `https://SEU_ACCOUNT_ID.r2.cloudflarestorage.com`)
   - O **Account ID** aparece no canto direito da home do R2

## Etapa 2 — Migrar dados locais pro R2

Antes de subir pro Render, vamos popular o R2 com os clientes que você já tem localmente.

```bash
# Edita o .env e adiciona:
R2_ENDPOINT=https://SEU_ACCOUNT_ID.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=cole-aqui
R2_SECRET_ACCESS_KEY=cole-aqui
R2_BUCKET=penta-planner

# Roda o script de migração
node migrate-to-r2.js
```

Saída esperada:
```
📦 Migração local → R2 (bucket: penta-planner)

📁 clients/
  ✓  clients/jec-advogados/config.json
  ✓  clients/jec-advogados/posts/serie-busca-apreensao.md
  ✓  clients/toca-do-rato/config.json
  ...

══════════════════════════════════════
✓ Enviados:    N
⊝ Pulados:     M
✗ Erros:       0
══════════════════════════════════════
```

Pra rodar de novo sobrescrevendo: `node migrate-to-r2.js --force`

## Etapa 3 — Subir o código pro GitHub

O Render deploy a partir de um repositório. Se ainda não tem:

```bash
cd C:\Users\ilust\jec-content-planner
git init
git add .
git commit -m "PENTA Content Planner inicial"

# Cria repo no github.com (privado!) e:
git remote add origin git@github.com:SEU_USER/penta-planner.git
git push -u origin main
```

⚠️ **NUNCA** commite o `.env` (já está no `.gitignore`).

## Etapa 4 — Render

1. Crie conta gratuita em [render.com](https://render.com) (pode logar com GitHub)
2. No dashboard, clique **New + → Blueprint**
3. Conecte seu repositório GitHub do `penta-planner`
4. O Render detecta automaticamente o `render.yaml` e cria o service
5. Antes de finalizar, ele vai pedir os valores das **env vars marcadas como `sync: false`**:
   - `APP_PASSWORD` — uma senha forte
   - `SESSION_SECRET` — gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `ANTHROPIC_API_KEY` — sk-ant-api03-...
   - `R2_ENDPOINT` — o endpoint do passo 1
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET` — `penta-planner`
6. Clique **Apply**
7. O Render builda e sobe. Demora ~3-5 min na primeira vez.
8. Quando aparecer **Live**, você terá uma URL tipo `https://penta-content-planner.onrender.com`
9. **Teste**: abre essa URL no navegador, faz login, e verifica que os clientes aparecem (puxados do R2)

## Etapa 5 — Apontar seu subdomínio

1. No painel do Render, abra o serviço → **Settings** → **Custom Domains**
2. Clique **Add Custom Domain** e digite `planner.suaagencia.com`
3. O Render mostra um registro **CNAME** pra você criar
4. No painel do seu provedor de domínio, crie:
   - **Tipo:** CNAME
   - **Nome:** `planner` (ou o subdomínio que escolher)
   - **Valor:** o que o Render mostrou (algo tipo `penta-content-planner.onrender.com`)
   - **TTL:** 3600
5. Aguarde alguns minutos pra propagar
6. Volta no Render e clica **Verify** — quando der ✅, o HTTPS é gerado automaticamente (Let's Encrypt)

## Etapa 6 — Updates futuros

Quando quiser deployar uma nova versão:
```bash
git add .
git commit -m "atualização X"
git push
```
O Render detecta o push e faz redeploy automático em ~2 min.

## ⚠️ Sobre o "free tier dorme"

O Render free tier desliga o container após **15 minutos sem requisições**. Quando alguém acessar depois disso, leva **~30 segundos** pra acordar (cold start).

Como mitigar:
- **Aceitar** — pra uso interno de agência, 30s ocasional não é grave
- **Pingar de tempos em tempos** — usar [UptimeRobot](https://uptimerobot.com) (free) pra fazer um GET no `/auth/status` a cada 5min e manter o app acordado
- **Pagar $7/mo** no Render Starter (sem sleep)

## 💸 Custos reais

| Item | Custo |
|---|---|
| Render Web Service Free | R$0 |
| Cloudflare R2 (até 10GB + 1M reads/mês) | R$0 |
| Subdomínio (você já tem) | R$0 |
| HTTPS (Let's Encrypt) | R$0 |
| **Hospedagem** | **R$0/mês** |
| Claude Sonnet 4.6 (~$0.12 por geração de briefing) | ~R$0,60/geração |
| 100 gerações/mês | ~R$60/mês |
| **Total operacional** | **~R$60/mês** (só o que você consome de IA) |

## Backup do R2

A pasta `clients/` no R2 contém TODOS os dados. Backup periódico:

```bash
# Da sua máquina local:
node download-from-r2.js  # (se quiser, posso criar esse script depois)

# Ou via Cloudflare dashboard: Buckets → penta-planner → ⋮ → Download all
```

## Segurança

- O `.env` **nunca** vai pro git
- Cookies de sessão são httpOnly + signed com HMAC
- HTTPS automático via Render
- O R2 token tem permissão **apenas** no bucket específico
- A senha do app fica só no painel do Render (variável de ambiente)
