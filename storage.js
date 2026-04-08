// Storage abstraction: 'fs' (local) ou 's3' (Cloudflare R2 / S3)
// Selecionado por env var STORAGE_BACKEND. Default = "fs".
//
// Interface (todas async, paths normalizados com "/"):
//   exists(key)            -> boolean
//   read(key)              -> string
//   write(key, content)    -> void
//   delete(key)            -> void
//   list(prefix)           -> string[]  (lista de keys que começam com prefix)
//
// Keys são paths "virtuais" tipo "clients/jec-advogados/config.json".
// O backend fs mapeia pra arquivos reais; o s3 mapeia pra objetos no bucket.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = (process.env.STORAGE_BACKEND || "fs").toLowerCase();

// =============== Backend FS (local) ===============
const fsBackend = {
  name: "fs",
  baseDir: __dirname,

  toLocal(key) {
    return path.join(this.baseDir, ...key.split("/"));
  },

  async exists(key) {
    try {
      await fs.access(this.toLocal(key));
      return true;
    } catch {
      return false;
    }
  },

  async read(key) {
    return await fs.readFile(this.toLocal(key), "utf8");
  },

  async write(key, content) {
    const filepath = this.toLocal(key);
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, content, "utf8");
  },

  async delete(key) {
    try {
      await fs.unlink(this.toLocal(key));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  },

  async list(prefix) {
    // Lista recursiva de arquivos sob prefix
    const baseAbs = path.join(this.baseDir, ...prefix.split("/"));
    const out = [];
    async function walk(dir, relParts) {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (e) {
        if (e.code === "ENOENT") return;
        throw e;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const rel = [...relParts, e.name];
        if (e.isDirectory()) {
          await walk(full, rel);
        } else if (e.isFile()) {
          out.push([prefix, ...rel].join("/"));
        }
      }
    }
    await walk(baseAbs, []);
    return out;
  },

  // Helper só pra usar no listClients (ainda lista pastas no top-level)
  async listDirs(prefix) {
    const baseAbs = path.join(this.baseDir, ...prefix.split("/"));
    try {
      const entries = await fs.readdir(baseAbs, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  },
};

// =============== Backend S3 / Cloudflare R2 ===============
let s3Client = null;
let s3Bucket = null;

function getS3() {
  if (!s3Client) {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    s3Bucket = process.env.R2_BUCKET;
    if (!endpoint || !accessKeyId || !secretAccessKey || !s3Bucket) {
      throw new Error(
        "Faltam variáveis R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET"
      );
    }
    s3Client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      // R2 não tem cert SSL pra subdomínios de bucket — usar path-style
      forcePathStyle: true,
    });
  }
  return { client: s3Client, bucket: s3Bucket };
}

const s3Backend = {
  name: "s3",

  async exists(key) {
    const { client, bucket } = getS3();
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (e) {
      if (e.$metadata?.httpStatusCode === 404 || e.name === "NotFound") return false;
      throw e;
    }
  },

  async read(key) {
    const { client, bucket } = getS3();
    const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    // r.Body é um Readable. Vamos coletar como string.
    const chunks = [];
    for await (const chunk of r.Body) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  },

  async write(key, content) {
    const { client, bucket } = getS3();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: content,
        ContentType: key.endsWith(".json") ? "application/json" : "text/markdown; charset=utf-8",
      })
    );
  },

  async delete(key) {
    const { client, bucket } = getS3();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },

  async list(prefix) {
    const { client, bucket } = getS3();
    const keys = [];
    let token = undefined;
    do {
      const r = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: token,
        })
      );
      for (const obj of r.Contents || []) {
        if (obj.Key) keys.push(obj.Key);
      }
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return keys;
  },

  async listDirs(prefix) {
    // Em S3 não há dirs reais. Lista usando Delimiter pra pegar "pastas".
    const { client, bucket } = getS3();
    const dirs = new Set();
    let token = undefined;
    const normalizedPrefix = prefix.endsWith("/") ? prefix : prefix + "/";
    do {
      const r = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: normalizedPrefix,
          Delimiter: "/",
          ContinuationToken: token,
        })
      );
      for (const cp of r.CommonPrefixes || []) {
        if (cp.Prefix) {
          // cp.Prefix = "clients/jec-advogados/" → extrai "jec-advogados"
          const name = cp.Prefix.slice(normalizedPrefix.length).replace(/\/$/, "");
          if (name) dirs.add(name);
        }
      }
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return Array.from(dirs);
  },
};

// =============== Selecionado ===============
const storage = BACKEND === "s3" ? s3Backend : fsBackend;

console.log(`📦 Storage backend: ${storage.name}`);

export default storage;
