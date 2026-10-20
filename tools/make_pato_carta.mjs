/* Gera pato-carta-dj.pdf a partir de tools/pato-carta-dj.html.
   Uso: node tools/make_pato_carta.mjs   (precisa do Playwright/Chromium)
   Depois de gerar, suba o ?v= do CARTA_URL em js/pato.js. */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await playwright.chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(path.join(root, "tools", "pato-carta-dj.html")).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: path.join(root, "pato-carta-dj.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log("pato-carta-dj.pdf gerado");
