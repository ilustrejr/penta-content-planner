// CRUD de cliente + biblioteca, agnóstico de backend de storage
import storage from "./storage.js";

// ---------- Helpers ----------
function slugify(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeFilename(name) {
  const cleaned = (name || "").replace(/[^a-z0-9-_.]/gi, "");
  if (!cleaned || cleaned.startsWith(".")) throw new Error("nome de arquivo inválido");
  return cleaned;
}

function clientKey(id, ...parts) {
  const safe = slugify(id);
  if (!safe) throw new Error("id inválido");
  return ["clients", safe, ...parts].join("/");
}

function libraryKey(id, type, filename) {
  if (!["posts", "transcripts"].includes(type)) {
    throw new Error(`type inválido: ${type}`);
  }
  return clientKey(id, type, filename);
}

// ---------- READ ----------
export async function listClients() {
  const dirs = await storage.listDirs("clients");
  const out = [];
  for (const dirName of dirs) {
    if (dirName.startsWith("_")) continue;
    const configPath = ["clients", dirName, "config.json"].join("/");
    try {
      const raw = await storage.read(configPath);
      const c = JSON.parse(raw);
      out.push({ id: c.id, name: c.name, instagram: c.instagram });
    } catch (err) {
      console.warn(`Erro lendo ${configPath}: ${err.message}`);
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return out;
}

export async function getClient(id) {
  const raw = await storage.read(clientKey(id, "config.json"));
  return JSON.parse(raw);
}

export async function getClientLibrary(id) {
  const result = { posts: [], transcripts: [] };
  for (const folder of ["posts", "transcripts"]) {
    const prefix = clientKey(id, folder);
    let keys;
    try {
      keys = await storage.list(prefix);
    } catch {
      continue;
    }
    // Filtra: só .md/.txt, ignora _README, etc.
    const validKeys = keys
      .filter((k) => k.endsWith(".md") || k.endsWith(".txt"))
      .filter((k) => {
        const fname = k.split("/").pop();
        return !fname.startsWith("_");
      })
      .sort();

    for (const k of validKeys) {
      try {
        const content = await storage.read(k);
        const filename = k.split("/").pop();
        result[folder].push({ filename, content: content.trim() });
      } catch {}
    }
  }
  return result;
}

export async function getLibraryItem(id, type, filename) {
  const safe = safeFilename(filename);
  return await storage.read(libraryKey(id, type, safe));
}

// ---------- WRITE ----------
export async function createClient(config) {
  if (!config.id || !config.name) throw new Error("id e name são obrigatórios");
  config.id = slugify(config.id);
  if (!config.id) throw new Error("id inválido");

  const configPath = clientKey(config.id, "config.json");
  if (await storage.exists(configPath)) {
    throw new Error(`Já existe um cliente com id "${config.id}"`);
  }

  const filled = {
    id: config.id,
    name: config.name,
    instagram: config.instagram || "",
    website: config.website || "",
    description: config.description || "",
    seriesName: config.seriesName || "",
    tone: config.tone || "",
    captionStructure: config.captionStructure || "",
    forbiddenTopics: config.forbiddenTopics || [],
    requiredBalance: config.requiredBalance || [],
    preferredFormats: config.preferredFormats || ["vídeo", "carrossel", "estatico"],
    referenceProfiles: config.referenceProfiles || [],
    hashtagsBase: config.hashtagsBase || [],
    extraInstructions: config.extraInstructions || "",
    newsFeeds: config.newsFeeds || [],
    newsKeywords: config.newsKeywords || [],
    newsExclude: config.newsExclude || [],
    recentPostsFallback: config.recentPostsFallback || "",
  };

  await storage.write(configPath, JSON.stringify(filled, null, 2));
  return filled;
}

export async function updateClient(id, updates) {
  const configPath = clientKey(id, "config.json");
  const current = JSON.parse(await storage.read(configPath));
  delete updates.id;
  const merged = { ...current, ...updates };
  await storage.write(configPath, JSON.stringify(merged, null, 2));
  return merged;
}

export async function saveLibraryItem(clientId, type, filename, content) {
  if (!content || !content.trim()) throw new Error("conteúdo vazio");
  if (!["posts", "transcripts"].includes(type)) throw new Error(`type inválido: ${type}`);

  let base = (filename || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!base) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    base = `item-${stamp}`;
  }

  // Gera nome único: lista existentes e evita colisão
  const existingKeys = await storage.list(clientKey(clientId, type)).catch(() => []);
  const existingNames = new Set(existingKeys.map((k) => k.split("/").pop()));

  let final = `${base}.md`;
  let n = 2;
  while (existingNames.has(final)) {
    final = `${base}-${n}.md`;
    n++;
  }

  const key = libraryKey(clientId, type, final);
  await storage.write(key, content.trim() + "\n");
  return { filename: final, filepath: key };
}

export async function updateLibraryItem(clientId, type, filename, content) {
  const safe = safeFilename(filename);
  const key = libraryKey(clientId, type, safe);
  await storage.write(key, content);
  return { filename: safe };
}

export async function deleteLibraryItem(clientId, type, filename) {
  const safe = safeFilename(filename);
  await storage.delete(libraryKey(clientId, type, safe));
  return { ok: true };
}
