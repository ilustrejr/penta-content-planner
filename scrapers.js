// Coleta de fontes: site, Instagram, notícias — agnóstico a cliente
import * as cheerio from "cheerio";
import Parser from "rss-parser";

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

// ---------- Site genérico ----------
export async function scrapeWebsite(url) {
  if (!url) return "[sem website configurado]";
  try {
    const r = await fetch(url, { headers: UA });
    const html = await r.text();
    const $ = cheerio.load(html);
    $("script, style, noscript").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();
    return text.slice(0, 4000);
  } catch (e) {
    return `[erro ao acessar ${url}: ${e.message}]`;
  }
}

// ---------- Instagram público (frágil) ----------
export async function scrapeInstagramProfile(username, maxPosts = 12) {
  try {
    const url = `https://www.instagram.com/${username}/`;
    const r = await fetch(url, { headers: UA });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();

    const captions = [];
    const metaMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    if (metaMatch) captions.push({ caption: metaMatch[1] });

    const jsonMatches = html.match(/"edge_owner_to_timeline_media":\s*{[^}]*"edges":\s*\[(.*?)\]/s);
    if (jsonMatches) {
      const captionRegex = /"text":\s*"((?:[^"\\]|\\.)*)"/g;
      let m;
      let count = 0;
      while ((m = captionRegex.exec(jsonMatches[1])) !== null && count < maxPosts) {
        try {
          const decoded = JSON.parse(`"${m[1]}"`);
          if (decoded && decoded.length > 20) {
            captions.push({ caption: decoded.slice(0, 600) });
            count++;
          }
        } catch {}
      }
    }

    if (captions.length === 0) {
      return [{ error: `Instagram bloqueou leitura de @${username}. Cole legendas manualmente no campo de texto.` }];
    }
    return captions;
  } catch (e) {
    return [{ error: `Falha ao ler @${username}: ${e.message}. Cole manualmente.` }];
  }
}

// ---------- Notícias parametrizadas por cliente ----------
const parser = new Parser({ headers: UA });

export async function fetchNews({ useLastWeekToo = false, keywords = [], exclude = [], feeds = [] } = {}) {
  if (!feeds.length || !keywords.length) return [];

  const cutoffDays = useLastWeekToo ? 14 : 7;
  const cutoff = Date.now() - cutoffDays * 24 * 60 * 60 * 1000;
  const items = [];

  const kwRegex = keywords.map((s) => new RegExp(s, "i"));
  const exRegex = exclude.map((s) => new RegExp(s, "i"));

  for (const url of feeds) {
    try {
      const feed = await parser.parseURL(url);
      for (const entry of feed.items.slice(0, 40)) {
        const pub = entry.isoDate ? new Date(entry.isoDate).getTime() : Date.now();
        if (pub < cutoff) continue;
        const title = entry.title || "";
        const summary = (entry.contentSnippet || entry.content || "").replace(/<[^>]+>/g, "");
        const blob = title + " " + summary;
        if (!kwRegex.some((rx) => rx.test(blob))) continue;
        if (exRegex.some((rx) => rx.test(blob))) continue;
        items.push({
          title,
          summary: summary.slice(0, 300),
          link: entry.link || "",
          source: new URL(url).hostname,
        });
      }
    } catch {}
  }
  return items.slice(0, 25);
}
