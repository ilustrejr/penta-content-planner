// Script de migração: sobe os arquivos locais (clients/ e output/) pro Cloudflare R2.
// Uso:
//   1. Garante que .env tem as credenciais R2_*
//   2. node migrate-to-r2.js
//
// Este script SEMPRE usa o backend S3 (independente de STORAGE_BACKEND).

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const endpoint = process.env.R2_ENDPOINT;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;

if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
  console.error("❌ Faltam variáveis R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET no .env");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  // R2 não tem cert SSL pra subdomínios de bucket — usar path-style
  forcePathStyle: true,
});

const FOLDERS_TO_MIGRATE = ["clients", "output"];
let uploaded = 0;
let skipped = 0;
let errors = 0;

async function exists(key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e) {
    if (e.$metadata?.httpStatusCode === 404 || e.name === "NotFound") return false;
    throw e;
  }
}

async function uploadFile(absPath, key) {
  // Pula _README, .DS_Store, etc.
  const fname = key.split("/").pop();
  if (fname.startsWith("_README") || fname === ".DS_Store") {
    skipped++;
    return;
  }

  const overwrite = process.argv.includes("--force");
  if (!overwrite && (await exists(key))) {
    console.log(`  ⊝  ${key} (já existe — use --force pra sobrescrever)`);
    skipped++;
    return;
  }

  try {
    const content = await fs.readFile(absPath);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: content,
        ContentType: key.endsWith(".json")
          ? "application/json"
          : "text/markdown; charset=utf-8",
      })
    );
    console.log(`  ✓  ${key}`);
    uploaded++;
  } catch (e) {
    console.error(`  ✗  ${key}: ${e.message}`);
    errors++;
  }
}

async function walkDir(dir, prefixParts = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === "ENOENT") return;
    throw e;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("_") && entry.isFile()) continue;
    const full = path.join(dir, entry.name);
    const newParts = [...prefixParts, entry.name];
    if (entry.isDirectory()) {
      await walkDir(full, newParts);
    } else if (entry.isFile()) {
      const key = newParts.join("/");
      await uploadFile(full, key);
    }
  }
}

async function main() {
  console.log(`📦 Migração local → R2 (bucket: ${bucket})`);
  console.log("");

  for (const folder of FOLDERS_TO_MIGRATE) {
    const localPath = path.join(__dirname, folder);
    console.log(`\n📁 ${folder}/`);
    await walkDir(localPath, [folder]);
  }

  console.log("");
  console.log("══════════════════════════════════════");
  console.log(`✓ Enviados:    ${uploaded}`);
  console.log(`⊝ Pulados:     ${skipped}`);
  console.log(`✗ Erros:       ${errors}`);
  console.log("══════════════════════════════════════");
  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Erro fatal:", e);
  process.exit(1);
});
