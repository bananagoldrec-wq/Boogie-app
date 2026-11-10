/* Tarefas — listas simples por assunto, com visual de app da Apple.
   Tudo fica salvo no próprio aparelho (localStorage). */
(() => {
  "use strict";

  const STORE_KEY = "tarefas-v1";
  const COLORS = ["orange", "yellow", "purple", "pink", "blue", "green", "teal", "indigo", "red", "brown"];
  const LIGHT_COLORS = new Set(["yellow"]); // cores claras pedem texto escuro
  const DEFAULT_LISTS = [
    ["Casa", "orange"],
    ["Banana Gold", "yellow"],
    ["Produção Musical", "purple"],
    ["DJ", "pink"],
    ["Frisson", "blue"],
    ["Burocracia", "brown"],
    ["Santa Teresa", "green"],
    ["Imóveis", "teal"],
  ];
  // listas que já vinham no app antes de ganhar a lista "seeded"
  const FIRST_DEFAULTS = ["Casa", "Banana Gold", "Produção Musical", "DJ"];

  const $ = (id) => document.getElementById(id);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---------- estado ---------- */
  function freshState() {
    const lists = DEFAULT_LISTS.map(([name, color]) => ({ id: uid(), name, color, items: [] }));
    return { lists, active: lists[0].id, doneCollapsed: false, seeded: DEFAULT_LISTS.map(([n]) => n) };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.lists) && s.lists.length) {
          // listas antigas (sem cor): usa a cor padrão pelo nome, ou a próxima da roda
          s.lists.forEach((l, i) => {
            if (!COLORS.includes(l.color)) {
              const def = DEFAULT_LISTS.find(([n]) => n === l.name);
              l.color = def ? def[1] : COLORS[i % COLORS.length];
            }
          });
          // listas padrão novas aparecem uma vez; se apagar, não voltam
          if (!Array.isArray(s.seeded)) s.seeded = FIRST_DEFAULTS.slice();
          DEFAULT_LISTS.forEach(([name, color]) => {
            if (s.seeded.includes(name)) return;
            s.seeded.push(name);
            if (!s.lists.some((l) => l.name === name)) {
              s.lists.push({ id: uid(), name, color, items: [] });
            }
          });
          return s;
        }
      }
    } catch (_) {}
    return freshState();
  }

  let state = load();

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  const activeList = () =>
    state.lists.find((l) => l.id === state.active) || state.lists[0];

  /* ---------- desfazer ---------- */
  let undoSnapshot = null;
  let toastTimer = null;

  function withUndo(message, change) {
    undoSnapshot = JSON.stringify(state);
    change();
    save();
    render();
    $("toast-msg").textContent = message;
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 5000);
  }

  function hideToast() {
    $("toast").hidden = true;
    undoSnapshot = null;
  }

  $("toast-undo").addEventListener("click", () => {
    if (!undoSnapshot) return;
    state = JSON.parse(undoSnapshot);
    save();
    render();
    hideToast();
  });

  /* ---------- render ---------- */
  const PLUS_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const XMARK_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="var(--bg)" stroke-width="2" stroke-linecap="round"/></svg>';

  const colorVar = (c) => "var(--c-" + c + ")";

  function renderTabs() {
    const nav = $("tabs");
    nav.innerHTML = "";
    state.lists.forEach((list) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tab" + (LIGHT_COLORS.has(list.color) ? " on-light" : "");
      b.style.setProperty("--c", colorVar(list.color));
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(list.id === state.active));
      b.dataset.id = list.id;

      const dot = document.createElement("span");
      dot.className = "dot";
      const name = document.createElement("span");
      name.textContent = list.name;
      b.append(dot, name);

      const pending = list.items.filter((i) => !i.done).length;
      if (pending) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = pending;
        b.appendChild(badge);
      }
      nav.appendChild(b);
    });
    const add = document.createElement("button");
    add.type = "button";
    add.className = "tab add-tab";
    add.innerHTML = PLUS_SVG;
    add.title = "Nova lista";
    add.setAttribute("aria-label", "Nova lista");
    add.dataset.action = "new";
    nav.appendChild(add);

    const sel = nav.querySelector('[aria-selected="true"]');
    if (sel) {
      const r = sel.getBoundingClientRect();
      if (r.left < 0 || r.right > window.innerWidth) {
        nav.scrollTo({ left: sel.offsetLeft - 16, behavior: "smooth" });
      }
    }
  }

  function itemEl(item) {
    const li = document.createElement("li");
    li.className = "item" + (item.done ? " is-done" : "");
    li.dataset.id = item.id;

    const check = document.createElement("button");
    check.type = "button";
    check.className = "check";
    check.setAttribute("role", "checkbox");
    check.setAttribute("aria-checked", String(item.done));
    check.setAttribute("aria-label", "Concluída");

    const body = document.createElement("div");
    body.className = "body";

    const text = document.createElement("textarea");
    text.className = "text";
    text.rows = 1;
    text.value = item.text;
    text.setAttribute("aria-label", "Tarefa");
    text.enterKeyHint = "done";

    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.setAttribute("aria-label", "Apagar");
    del.innerHTML = XMARK_SVG;
    // mantém o foco no texto ao tocar no ×, senão o blur re-renderiza antes do clique
    del.addEventListener("pointerdown", (e) => e.preventDefault());

    body.append(text, del);
    li.append(check, body);
    return li;
  }

  function autosize(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  function render() {
    const list = activeList();
    state.active = list.id;
    document.documentElement.style.setProperty("--tint", colorVar(list.color));
    renderTabs();

    $("list-title").textContent = list.name;
    document.title = list.name + " · Tarefas";

    const todo = list.items.filter((i) => !i.done);
    const done = list.items.filter((i) => i.done);

    $("count").textContent = todo.length || "";

    const todoUl = $("todo");
    todoUl.innerHTML = "";
    todo.forEach((i) => todoUl.appendChild(itemEl(i)));

    const doneUl = $("done");
    doneUl.innerHTML = "";
    done.forEach((i) => doneUl.appendChild(itemEl(i)));

    $("empty").hidden = list.items.length > 0;
    $("done-wrap").hidden = done.length === 0;
    $("done-wrap").classList.toggle("collapsed", !!state.doneCollapsed);
    $("done-toggle").setAttribute("aria-expanded", String(!state.doneCollapsed));
    $("done-toggle").textContent = state.doneCollapsed ? "Mostrar" : "Ocultar";
    $("done-count").textContent = done.length + (done.length === 1 ? " concluída" : " concluídas");

    document.querySelectorAll(".text").forEach(autosize);
  }

  /* ---------- tarefas ---------- */
  const findItem = (id) => activeList().items.find((i) => i.id === id);

  // posição entre as pendentes e as concluídas
  const boundary = (items) => {
    const i = items.findIndex((x) => x.done);
    return i === -1 ? items.length : i;
  };

  $("add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("add-input");
    const text = input.value.trim();
    if (!text) return;
    // nova tarefa entra no fim das pendentes, logo acima do campo
    const items = activeList().items;
    items.splice(boundary(items), 0, { id: uid(), text, done: false });
    input.value = "";
    save();
    render();
    input.focus();
  });

  $("new-btn").addEventListener("click", () => {
    const input = $("add-input");
    input.focus();
    input.scrollIntoView({ block: "center", behavior: "smooth" });
  });

  function onListClick(e) {
    const li = e.target.closest(".item");
    if (!li) return;
    const item = findItem(li.dataset.id);
    if (!item) return;

    if (e.target.closest(".check")) {
      const items = activeList().items;
      items.splice(items.indexOf(item), 1);
      item.done = !item.done;
      item.doneAt = item.done ? Date.now() : undefined;
      // concluída vai pro topo das concluídas; desmarcada volta pro fim das pendentes
      items.splice(boundary(items), 0, item);
      li.classList.toggle("is-done", item.done);
      save();
      // deixa a bolinha preencher antes de mudar a tarefa de lugar
      setTimeout(render, item.done ? 280 : 0);
    } else if (e.target.closest(".del")) {
      withUndo("Tarefa apagada", () => {
        const items = activeList().items;
        items.splice(items.indexOf(item), 1);
      });
    }
  }

  function onListInput(e) {
    if (!e.target.classList.contains("text")) return;
    autosize(e.target);
    const item = findItem(e.target.closest(".item").dataset.id);
    if (item) { item.text = e.target.value; save(); }
  }

  function onListKey(e) {
    if (!e.target.classList.contains("text")) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.target.blur();
    }
  }

  function onListBlur(e) {
    if (!e.target.classList.contains("text")) return;
    const li = e.target.closest(".item");
    const item = li && findItem(li.dataset.id);
    if (!item) return;
    const t = e.target.value.replace(/\s+/g, " ").trim();
    if (!t) {
      // apagou o texto todo: some com a tarefa
      withUndo("Tarefa apagada", () => {
        const items = activeList().items;
        items.splice(items.indexOf(item), 1);
      });
    } else if (t !== item.text) {
      item.text = t;
      e.target.value = t;
      save();
    }
  }

  ["todo", "done"].forEach((id) => {
    const ul = $(id);
    ul.addEventListener("click", onListClick);
    ul.addEventListener("input", onListInput);
    ul.addEventListener("keydown", onListKey);
    ul.addEventListener("focusout", onListBlur);
  });

  $("done-toggle").addEventListener("click", () => {
    state.doneCollapsed = !state.doneCollapsed;
    save();
    render();
  });

  $("clear-done").addEventListener("click", () => {
    const list = activeList();
    const n = list.items.filter((i) => i.done).length;
    if (!n) return;
    withUndo(n === 1 ? "1 concluída removida" : n + " concluídas removidas", () => {
      list.items = list.items.filter((i) => !i.done);
    });
  });

  /* ---------- listas (abas) ---------- */
  const dialog = $("tab-dialog");
  let editingId = null; // null = nova lista
  let pickedColor = COLORS[0];

  function renderSwatches() {
    const box = $("colors");
    box.innerHTML = "";
    COLORS.forEach((c) => {
      const s = document.createElement("button");
      s.type = "button";
      s.className = "swatch";
      s.style.setProperty("--c", colorVar(c));
      s.setAttribute("role", "radio");
      s.setAttribute("aria-checked", String(c === pickedColor));
      s.setAttribute("aria-label", c);
      s.addEventListener("click", () => { pickedColor = c; renderSwatches(); });
      box.appendChild(s);
    });
  }

  function openTabDialog(listId) {
    editingId = listId;
    const list = listId && state.lists.find((l) => l.id === listId);
    $("tab-dialog-title").textContent = list ? "Editar lista" : "Nova lista";
    $("tab-name").value = list ? list.name : "";
    $("tab-delete").hidden = !list || state.lists.length <= 1;
    $("tab-save").textContent = list ? "Salvar" : "Criar";
    // lista nova ganha a primeira cor ainda não usada
    const used = new Set(state.lists.map((l) => l.color));
    pickedColor = list ? list.color : COLORS.find((c) => !used.has(c)) || COLORS[0];
    renderSwatches();
    dialog.returnValue = "";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    setTimeout(() => $("tab-name").focus(), 30);
  }

  dialog.addEventListener("close", () => {
    if (dialog.returnValue !== "ok") return;
    const name = $("tab-name").value.trim();
    if (!name) return;
    if (editingId) {
      const list = state.lists.find((l) => l.id === editingId);
      if (list) { list.name = name; list.color = pickedColor; }
    } else {
      const list = { id: uid(), name, color: pickedColor, items: [] };
      state.lists.push(list);
      state.active = list.id;
    }
    save();
    render();
  });

  $("tab-delete").addEventListener("click", () => {
    const list = state.lists.find((l) => l.id === editingId);
    if (!list) return;
    dialog.close("cancel");
    withUndo("Lista “" + list.name + "” apagada", () => {
      const idx = state.lists.indexOf(list);
      state.lists.splice(idx, 1);
      if (state.active === list.id) {
        state.active = state.lists[Math.max(0, idx - 1)].id;
      }
    });
  });

  // toque troca de aba; tocar de novo na aba aberta (ou segurar) edita
  let pressTimer = null;
  let longPressed = false;
  const tabs = $("tabs");

  tabs.addEventListener("pointerdown", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab || tab.dataset.action) return;
    longPressed = false;
    pressTimer = setTimeout(() => {
      longPressed = true;
      if (navigator.vibrate) navigator.vibrate(10);
      openTabDialog(tab.dataset.id);
    }, 550);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) =>
    tabs.addEventListener(ev, () => clearTimeout(pressTimer))
  );
  tabs.addEventListener("scroll", () => clearTimeout(pressTimer), { passive: true });
  tabs.addEventListener("contextmenu", (e) => e.preventDefault());

  tabs.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    if (longPressed) { longPressed = false; return; }
    if (tab.dataset.action === "new") return openTabDialog(null);
    if (tab.dataset.id === state.active) return openTabDialog(tab.dataset.id);
    state.active = tab.dataset.id;
    save();
    render();
    window.scrollTo({ top: 0 });
  });

  // linha fina sob a barra quando a lista rola, como no iOS
  const top = document.querySelector(".top");
  const onScroll = () => top.classList.toggle("scrolled", window.scrollY > 4);
  window.addEventListener("scroll", onScroll, { passive: true });

  render();
  onScroll();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw-tarefas.js", { scope: "./tarefas.html" }).catch(() => {});
    });
  }
})();
