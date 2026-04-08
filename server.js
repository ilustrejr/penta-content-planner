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

// Helper: loga erro completo no stderr e responde com mensagem
function handleError(res, e, status = 500, label = "endpoint") {
  console.error(`[ERROR ${label}]`, e);
  res.status(status).json({ ok: false, error: e.message });
}

// =============== CLIENTES ===============
app.get("/clients", async (_req, res) => {
  try {
    res.json(await listClients());
  } catch (e) {
    handleError(res, e, 500, "GET /clients");
  }
});

app.get("/clients/:id", async (req, res) => {
  try {
    res.json(await getClient(req.params.id));
  } catch (e) {
    handleError(res, e, 404, "GET /clients/:id");
  }
});

app.post("/clients", async (req, res) => {
  try {
    const created = await createClient(req.body);
    res.json({ ok: true, client: created });
  } catch (e) {
    handleError(res, e, 400, "POST /clients");
  }
});

app.put("/clients/:id", async (req, res) => {
  try {
    const updated = await updateClient(req.params.id, req.body);
    res.json({ ok: true, client: updated });
  } catch (e) {
    handleError(res, e, 400, "PUT /clients/:id");
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
    handleError(res, e, 500, "GET /library/:id");
  }
});

app.get("/library/:id/:type/:filename", async (req, res) => {
  try {
    const content = await getLibraryItem(req.params.id, req.params.type, req.params.filename);
    res.json({ ok: true, content });
  } catch (e) {
    handleError(res, e, 404, "GET /library/:id/:type/:filename");
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
    handleError(res, e, 400, "POST /library/:id/:type");
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
    handleError(res, e, 400, "PUT /library/:id/:type/:filename");
  }
});

app.delete("/library/:id/:type/:filename", async (req, res) => {
  try {
    await deleteLibraryItem(req.params.id, req.params.type, req.params.filename);
    res.json({ ok: true });
  } catch (e) {
    handleError(res, e, 400, "DELETE /library/:id/:type/:filename");
  }
});

// =============== DEBUG TLS CRU PRO R2 (sem SDK, sem credenciais) ===============
app.get("/debug/r2-tls", async (_req, res) => {
  const tls = await import("node:tls");
  const url = await import("node:url");
  const endpoint = process.env.R2_ENDPOINT || "";
  let host = "";
  try {
    host = new url.URL(endpoint).hostname;
  } catch (e) {
    return res.json({ ok: false, error: "R2_ENDPOINT inválida: " + e.message });
  }

  const result = { host, tests: {} };

  // Test A: TLS handshake cru, observa o cert
  result.tests.tlsHandshake = await new Promise((resolve) => {
    const socket = tls.connect(
      { host, port: 443, servername: host, rejectUnauthorized: false, timeout: 8000 },
      () => {
        const cert = socket.getPeerCertificate(true);
        resolve({
          ok: true,
          authorized: socket.authorized,
          authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
          cipher: socket.getCipher(),
          protocol: socket.getProtocol(),
          cert: {
            subject: cert.subject,
            issuer: cert.issuer,
            valid_from: cert.valid_from,
            valid_to: cert.valid_to,
            subjectaltname: cert.subjectaltname,
          },
        });
        socket.end();
      }
    );
    socket.on("error", (e) => {
      resolve({
        ok: false,
        errorName: e.name,
        errorCode: e.code,
        errorMessage: e.message,
      });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, error: "timeout" });
    });
  });

  // Test B: fetch HTTPS cru no endpoint
  try {
    const r = await fetch(endpoint, { method: "GET" });
    result.tests.fetchRoot = { ok: true, status: r.status, statusText: r.statusText };
  } catch (e) {
    result.tests.fetchRoot = {
      ok: false,
      errorName: e.name,
      errorCode: e.code,
      errorMessage: e.message,
      cause: e.cause?.message || null,
    };
  }

  // Test C: DNS resolution
  try {
    const dns = await import("node:dns/promises");
    const addrs = await dns.lookup(host, { all: true });
    result.tests.dns = { ok: true, addresses: addrs };
  } catch (e) {
    result.tests.dns = { ok: false, errorMessage: e.message };
  }

  res.json(result);
});

// =============== DEBUG R2 (temporário) ===============
app.get("/debug/r2", async (_req, res) => {
  const result = {
    env: {
      STORAGE_BACKEND: process.env.STORAGE_BACKEND || null,
      R2_ENDPOINT: process.env.R2_ENDPOINT || null,
      R2_BUCKET: process.env.R2_BUCKET || null,
      R2_ACCESS_KEY_ID_length: process.env.R2_ACCESS_KEY_ID?.length || 0,
      R2_ACCESS_KEY_ID_prefix: process.env.R2_ACCESS_KEY_ID?.slice(0, 4) || null,
      R2_SECRET_ACCESS_KEY_length: process.env.R2_SECRET_ACCESS_KEY?.length || 0,
    },
    tests: {},
  };

  // Test 1: importar S3 client e tentar ListBuckets (não exige permissão de bucket)
  try {
    const { S3Client, ListBucketsCommand, ListObjectsV2Command, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });

    // Test 1: list buckets
    try {
      const r = await client.send(new ListBucketsCommand({}));
      result.tests.listBuckets = {
        ok: true,
        bucketsFound: r.Buckets?.map((b) => b.Name) || [],
      };
    } catch (e) {
      console.error("[DEBUG R2] ListBuckets error:", e);
      result.tests.listBuckets = {
        ok: false,
        errorName: e.name,
        errorMessage: e.message,
        errorCode: e.code,
        httpStatus: e.$metadata?.httpStatusCode,
        cause: e.cause?.message || null,
      };
    }

    // Test 2: list objects on bucket (mais restrito)
    try {
      const r = await client.send(
        new ListObjectsV2Command({
          Bucket: process.env.R2_BUCKET,
          MaxKeys: 5,
        })
      );
      result.tests.listObjects = {
        ok: true,
        objectCount: r.KeyCount || 0,
        sample: r.Contents?.slice(0, 3).map((o) => o.Key) || [],
      };
    } catch (e) {
      console.error("[DEBUG R2] ListObjects error:", e);
      result.tests.listObjects = {
        ok: false,
        errorName: e.name,
        errorMessage: e.message,
        errorCode: e.code,
        httpStatus: e.$metadata?.httpStatusCode,
        cause: e.cause?.message || null,
      };
    }

    // Test 3: tentar put de teste
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: "_debug-test.txt",
          Body: "ok",
          ContentType: "text/plain",
        })
      );
      result.tests.putObject = { ok: true };
    } catch (e) {
      console.error("[DEBUG R2] PutObject error:", e);
      result.tests.putObject = {
        ok: false,
        errorName: e.name,
        errorMessage: e.message,
        errorCode: e.code,
        httpStatus: e.$metadata?.httpStatusCode,
        cause: e.cause?.message || null,
      };
    }
  } catch (e) {
    console.error("[DEBUG R2] Outer error:", e);
    result.tests.outer = {
      ok: false,
      errorName: e.name,
      errorMessage: e.message,
    };
  }

  res.json(result);
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
