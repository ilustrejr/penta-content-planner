// Servidor Express - PENTA Content Planner
import "dotenv/config";

import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";

import storage from "./storage.js";
import { scrapeWebsite, scrapeInstagramProfile, fetchNews } from "./scrapers.js";
import { montarBriefing } from "./briefing.js";
import {
  listClients,
  getClient,
  getClientLibrary,
  saveLibraryItem,
  createClient,
  updateClient,
  getLibraryItem,
  updateLibraryItem,
  deleteLibraryItem,
} from "./clients.js";
import { getUpcomingThemes } from "./themed-dates.js";
import {
  authMiddleware,
  loginRoute,
  logoutRoute,
  statusRoute,
  authEnabled,
} from "./auth.js";
import { gerarConteudoComIA, aiEnabled } from "./ai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

// Rotas públicas (login)
app.post("/login", loginRoute);
app.post("/logout", logoutRoute);
app.get("/auth/status", statusRoute);

// Auth middleware (protege tudo dali pra frente se APP_PASSWORD estiver setada)
app.use(authMiddleware);

// Static (depois do auth pra proteger app.js, etc — exceto rotas públicas
// já liberadas dentro do middleware)
app.use(express.static(path.join(__dirname, "public")));

// =============== CLIENTES ===============
app.get("/clients", async (_req, res) => {
  try {
    res.json(await listClients());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/clients/:id", async (req, res) => {
  try {
    res.json(await getClient(req.params.id));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.post("/clients", async (req, res) => {
  try {
    const created = await createClient(req.body);
    res.json({ ok: true, client: created });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.put("/clients/:id", async (req, res) => {
  try {
    const updated = await updateClient(req.params.id, req.body);
    res.json({ ok: true, client: updated });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// =============== BIBLIOTECA ===============
app.get("/library/:id", async (req, res) => {
  try {
    const lib = await getClientLibrary(req.params.id);
    res.json({
      posts: lib.posts.map((p) => ({ filename: p.filename, length: p.content.length })),
      transcripts: lib.transcripts.map((t) => ({ filename: t.filename, length: t.content.length })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/library/:id/:type/:filename", async (req, res) => {
  try {
    const content = await getLibraryItem(req.params.id, req.params.type, req.params.filename);
    res.json({ ok: true, content });
  } catch (e) {
    res.status(404).json({ ok: false, error: e.message });
  }
});

app.post("/library/:id/:type", async (req, res) => {
  try {
    const result = await saveLibraryItem(
      req.params.id,
      req.params.type,
      req.body.filename,
      req.body.content
    );
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.put("/library/:id/:type/:filename", async (req, res) => {
  try {
    const result = await updateLibraryItem(
      req.params.id,
      req.params.type,
      req.params.filename,
      req.body.content
    );
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.delete("/library/:id/:type/:filename", async (req, res) => {
  try {
    await deleteLibraryItem(req.params.id, req.params.type, req.params.filename);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// =============== STATUS DO SISTEMA ===============
app.get("/system/status", (_req, res) => {
  res.json({
    authEnabled,
    aiEnabled,
  });
});

// =============== HELPER: monta o briefing pra reuso ===============
async function buildBriefing(req) {
  const clientId = req.body.clientId;
  if (!clientId) throw new Error("Selecione um cliente primeiro");
  const client = await getClient(clientId);

  const dias = parseInt(req.body.dias || 7, 10);
  const formato = req.body.formato || "video";
  const incluirNoticias = !!req.body.incluirNoticias && (client.newsFeeds?.length > 0);
  const semanaAnterior = !!req.body.semanaAnterior;
  const sugerirDataTematica = !!req.body.sugerirDataTematica;

  const siteText = await scrapeWebsite(client.website);

  let clientPosts;
  if (client.recentPostsFallback) {
    clientPosts = client.recentPostsFallback
      .split("---")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((caption) => ({ caption }));
  } else {
    clientPosts = await scrapeInstagramProfile(client.instagram, 15);
  }

  const referencePosts = [];
  for (const ref of client.referenceProfiles || []) {
    const posts = await scrapeInstagramProfile(ref.handle, 8);
    referencePosts.push({ handle: ref.handle, label: ref.label, posts });
  }

  const noticias = incluirNoticias
    ? await fetchNews({
        useLastWeekToo: semanaAnterior,
        keywords: client.newsKeywords || [],
        exclude: client.newsExclude || [],
        feeds: client.newsFeeds || [],
      })
    : [];

  const library = await getClientLibrary(clientId);

  const datasTematicas = sugerirDataTematica
    ? getUpcomingThemes(Math.max(45, dias + 14))
    : [];

  const fontes = { siteText, clientPosts, referencePosts, noticias, library, datasTematicas };
  const briefing = montarBriefing({
    client,
    dias,
    formato,
    incluirNoticias,
    sugerirDataTematica,
    fontes,
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filepath = `output/${clientId}/briefing-${stamp}.md`;
  await storage.write(filepath, briefing);

  return {
    client,
    briefing,
    filepath,
    resumo: {
      cliente: client.name,
      formato,
      noticiasEncontradas: noticias.length,
      postsClienteLidos: clientPosts.filter((p) => !p.error).length,
      libraryPosts: library.posts.length,
      libraryTranscripts: library.transcripts.length,
      datasTematicas: datasTematicas.length,
      bytesBriefing: briefing.length,
    },
  };
}

// =============== GERAR BRIEFING (cole no Claude Code) ===============
app.post("/gerar", async (req, res) => {
  try {
    const result = await buildBriefing(req);
    res.json({ ok: true, briefing: result.briefing, filepath: result.filepath, resumo: result.resumo });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// =============== GERAR COM IA (Claude Sonnet 4.6 direto) ===============
app.post("/gerar-com-ia", async (req, res) => {
  try {
    const built = await buildBriefing(req);
    const ai = await gerarConteudoComIA(built.briefing);

    // Salva o resultado da IA junto
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const aiPath = `output/${built.client.id}/roteiros-${stamp}.md`;
    await storage.write(aiPath, ai.text);

    res.json({
      ok: true,
      briefing: built.briefing,
      briefingPath: built.filepath,
      ai: {
        text: ai.text,
        usage: ai.usage,
        model: ai.model,
        stop_reason: ai.stop_reason,
        filepath: aiPath,
      },
      resumo: built.resumo,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = parseInt(process.env.PORT || "5000", 10);
app.listen(PORT, () => {
  console.log(`\n🥃 PENTA Content Planner rodando em http://localhost:${PORT}`);
  console.log(`   Auth: ${authEnabled ? "🔒 protegido por senha" : "⚠️  desabilitado (sem APP_PASSWORD)"}`);
  console.log(`   Claude IA: ${aiEnabled ? "✅ ativado (Sonnet 4.6)" : "⚠️  desabilitado (sem ANTHROPIC_API_KEY)"}\n`);
});
