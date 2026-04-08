// Auth simples com senha única + cookie HMAC
import crypto from "node:crypto";

const APP_PASSWORD = process.env.APP_PASSWORD || "";
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const COOKIE_NAME = "penta_auth";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 dias

export const authEnabled = !!APP_PASSWORD;

function expectedToken() {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update("PENTA_AUTH_V1:" + APP_PASSWORD)
    .digest("hex");
}

function isAuthenticated(req) {
  if (!authEnabled) return true;
  const token = req.cookies?.[COOKIE_NAME];
  return !!token && token === expectedToken();
}

// Middleware: protege tudo exceto /login, /login.html, /styles.css e fontes
const PUBLIC_PATHS = new Set([
  "/login",
  "/login.html",
  "/logout",
  "/styles.css",
  "/favicon.ico",
]);

export function authMiddleware(req, res, next) {
  if (!authEnabled) return next();
  if (PUBLIC_PATHS.has(req.path)) return next();
  if (isAuthenticated(req)) return next();

  // HTML → redirect; API → 401
  const wantsHtml = req.method === "GET" && (req.headers.accept || "").includes("text/html");
  if (wantsHtml) return res.redirect("/login.html");
  return res.status(401).json({ ok: false, error: "Não autenticado" });
}

export function loginRoute(req, res) {
  if (!authEnabled) return res.json({ ok: true, note: "Auth desabilitada" });
  const password = (req.body?.password || "").trim();
  if (password !== APP_PASSWORD) {
    return res.status(401).json({ ok: false, error: "Senha incorreta" });
  }
  res.cookie(COOKIE_NAME, expectedToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
  });
  res.json({ ok: true });
}

export function logoutRoute(req, res) {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
}

export function statusRoute(req, res) {
  res.json({
    authEnabled,
    authenticated: isAuthenticated(req),
  });
}
