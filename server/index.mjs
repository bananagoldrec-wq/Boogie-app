/* Coach — servidor.

   Faz duas coisas:
   1. Expõe /api/* pro app, guardando a chave da Anthropic aqui dentro.
   2. Opcionalmente serve os arquivos estáticos do repositório, pra rodar o
      app inteiro com um comando só (`npm start` e abrir localhost:8787).

   Em produção você provavelmente vai servir o app no GitHub Pages (ou em
   qualquer CDN) e rodar só a parte /api aqui. Os dois casos funcionam: o
   CORS abaixo libera a origem que você configurar em COACH_ORIGIN. */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import * as coach from "./coach.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(HERE, "..");                       // raiz do repositório
const PORT = Number(process.env.PORT || 8787);
const ORIGIN = process.env.COACH_ORIGIN || "*";      // ex.: https://user.github.io
const SERVE_STATIC = process.env.COACH_STATIC !== "0";
const MAX_BODY = 512 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".ico": "image/x-icon",
};

const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

const send = (res, status, payload, headers = {}) => {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...cors,
    ...headers,
  });
  res.end(body);
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("body-too-large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error("bad-json")); }
    });
    req.on("error", reject);
  });
}

/* Limite simples por IP: evita que uma chave vire conta aberta. */
const hits = new Map();
const RATE_WINDOW = 60_000;
const RATE_MAX = Number(process.env.COACH_RATE_LIMIT || 40);

function overLimit(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE_MAX;
}

/* --------------------------------------------------------------- estáticos */

async function serveStatic(url, res) {
  let path = decodeURIComponent(url.pathname);
  if (path === "/") path = "/coach.html";
  const target = normalize(join(ROOT, path));
  if (!target.startsWith(ROOT)) {
    send(res, 403, { error: "forbidden" });
    return;
  }
  try {
    const info = await stat(target);
    if (info.isDirectory()) throw new Error("dir");
    const data = await readFile(target);
    res.writeHead(200, {
      "Content-Type": MIME[extname(target).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  } catch {
    send(res, 404, { error: "not-found" });
  }
}

/* ------------------------------------------------------------------ rotas */

const ROUTES = {
  "/api/open": coach.opening,
  "/api/reply": coach.reply,
  "/api/debrief": coach.debrief,
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  if (url.pathname === "/api/health") {
    send(res, 200, {
      ok: true,
      hasKey: Boolean(process.env.ANTHROPIC_API_KEY),
      model: coach.MODEL,
    });
    return;
  }

  const handler = ROUTES[url.pathname];
  if (handler) {
    if (req.method !== "POST") return send(res, 405, { error: "method-not-allowed" });
    if (!process.env.ANTHROPIC_API_KEY) return send(res, 503, { error: "no-api-key" });

    const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || "?";
    if (overLimit(ip)) return send(res, 429, { error: "slow-down" });

    try {
      const body = await readBody(req);
      const out = await handler(body);
      send(res, 200, out);
    } catch (err) {
      /* o app tem professor local: devolve o erro e ele segue a conversa */
      const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500;
      console.error(`[coach] ${url.pathname}:`, err?.message || err);
      send(res, status, { error: err?.message || "server-error" });
    }
    return;
  }

  if (url.pathname.startsWith("/api/")) return send(res, 404, { error: "not-found" });
  if (SERVE_STATIC) return serveStatic(url, res);
  send(res, 404, { error: "not-found" });
});

server.listen(PORT, () => {
  const key = process.env.ANTHROPIC_API_KEY ? "com chave" : "SEM CHAVE (o app usa o professor local)";
  console.log(`coach server on http://localhost:${PORT}  ·  ${coach.MODEL}  ·  ${key}`);
  if (SERVE_STATIC) console.log(`app: http://localhost:${PORT}/coach.html`);
});
