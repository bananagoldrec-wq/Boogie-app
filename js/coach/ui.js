/* Coach — utilidades de interface: criação de elementos, folha deslizante,
   aviso rápido e os poucos ícones que o app usa. */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);

/* --------------------------------------------------------------------- toast */

let toastTimer = 0;
export function toast(message) {
  const node = $("#toast");
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  node.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.classList.remove("is-on");
    setTimeout(() => { node.hidden = true; }, 260);
  }, 2600);
}

/* --------------------------------------------------------------------- sheet */

/** Folha que sobe de baixo — usada pra detalhes de palavra e de conversa. */
export function sheet(title, content) {
  const host = $("#sheet");
  const body = $("#sheet-body");
  const head = $("#sheet-title");
  if (!host) return;
  head.textContent = title;
  body.replaceChildren(...[].concat(content));
  host.hidden = false;
  requestAnimationFrame(() => host.classList.add("is-on"));
}

export function closeSheet() {
  const host = $("#sheet");
  if (!host) return;
  host.classList.remove("is-on");
  setTimeout(() => { host.hidden = true; }, 240);
}

/* --------------------------------------------------------------------- misc */

export function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return m ? `${m} min${s % 60 >= 30 ? " 30s" : ""}` : `${s}s`;
}

export function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtDate(iso) {
  const d = new Date(iso);
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  const yesterday = new Date(today.getTime() - 86400000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (same) return `Today, ${time}`;
  if (yesterday) return `Yesterday, ${time}`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + `, ${time}`;
}

/** Mini-gráfico de tendência em SVG (sem biblioteca). */
export function sparkline(values, { width = 260, height = 56 } = {}) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "spark");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  if (!values.length) return svg;

  const pad = 6;
  const lo = Math.min(...values, 50);
  const hi = Math.max(...values, 100);
  const span = Math.max(1, hi - lo);
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const pts = values.map((v, i) => [
    pad + i * step,
    height - pad - ((v - lo) / span) * (height - pad * 2),
  ]);

  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = document.createElementNS(ns, "path");
  area.setAttribute("d", `${d} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`);
  area.setAttribute("class", "spark-area");
  svg.append(area);

  const line = document.createElementNS(ns, "path");
  line.setAttribute("d", d);
  line.setAttribute("class", "spark-line");
  svg.append(line);

  const last = document.createElementNS(ns, "circle");
  last.setAttribute("cx", pts[pts.length - 1][0].toFixed(1));
  last.setAttribute("cy", pts[pts.length - 1][1].toFixed(1));
  last.setAttribute("r", "3.4");
  last.setAttribute("class", "spark-dot");
  svg.append(last);
  return svg;
}

/** Barra de porcentagem usada nas notas da conversa. */
export function meter(label, value) {
  return el("div", { class: "meter" }, [
    el("div", { class: "meter-top" }, [
      el("span", { class: "meter-label", text: label }),
      el("span", { class: "meter-value", text: `${value}%` }),
    ]),
    el("div", { class: "meter-track" }, [
      el("i", { class: "meter-fill", style: `width:${Math.max(4, Math.min(100, value))}%` }),
    ]),
  ]);
}
