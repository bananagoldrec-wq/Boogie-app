/* Tarefas — listas simples por assunto, no estilo do Notes.
   Tudo fica salvo no próprio aparelho (localStorage). */
(() => {
  "use strict";

  const STORE_KEY = "tarefas-v1";
  const DEFAULT_LISTS = ["Casa", "Banana Gold", "Produção Musical", "DJ"];

  const $ = (id) => document.getElementById(id);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---------- estado ---------- */
  function freshState() {
    const lists = DEFAULT_LISTS.map((name) => ({ id: uid(), name, items: [] }));
    return { lists, active: lists[0].id, doneCollapsed: false };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.lists) && s.lists.length) return s;
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
  const CHECK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5 10 17l9-10"/></svg>';

  function renderTabs() {
    const nav = $("tabs");
    nav.innerHTML = "";
    state.lists.forEach((list) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tab";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(list.id === state.active));
      b.dataset.id = list.id;
      const pending = list.items.filter((i) => !i.done).length;
      b.textContent = list.name;
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
    add.textContent = "+";
    add.title = "Nova lista";
    add.setAttribute("aria-label", "Nova lista");
    add.dataset.action = "new";
    nav.appendChild(add);

    const sel = nav.querySelector('[aria-selected="true"]');
    if (sel) sel.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function itemEl(item) {
    const li = document.createElement("li");
    li.className = "item" + (item.done ? " is-done" : "");
    li.dataset.id = item.id;

    const check = document.createElement("button");
    check.type = "button";
    check.className = "check";
    check.setAttribute("aria-label", item.done ? "Desmarcar" : "Marcar como feita");
    check.innerHTML = CHECK_SVG;

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
    del.textContent = "×";

    li.append(check, text, del);
    return li;
  }

  function autosize(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  function render() {
    const list = activeList();
    state.active = list.id;
    renderTabs();

    $("list-title").textContent = list.name;
    document.title = list.name + " · Tarefas";

    const todo = list.items.filter((i) => !i.done);
    const done = list.items.filter((i) => i.done);

    $("count").textContent = todo.length
      ? todo.length + (todo.length === 1 ? " pendente" : " pendentes")
      : "";

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
    $("done-count").textContent = "(" + done.length + ")";

    document.querySelectorAll(".text").forEach(autosize);
  }

  /* ---------- tarefas ---------- */
  const findItem = (id) => activeList().items.find((i) => i.id === id);

  $("add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("add-input");
    const text = input.value.trim();
    if (!text) return;
    // novas tarefas entram no topo da lista
    activeList().items.unshift({ id: uid(), text, done: false });
    input.value = "";
    save();
    render();
    input.focus();
  });

  function onListClick(e) {
    const li = e.target.closest(".item");
    if (!li) return;
    const item = findItem(li.dataset.id);
    if (!item) return;

    if (e.target.closest(".check")) {
      item.done = !item.done;
      item.doneAt = item.done ? Date.now() : undefined;
      // ao concluir, vai pro topo das feitas; ao desmarcar, volta pro fim das pendentes
      const items = activeList().items;
      items.splice(items.indexOf(item), 1);
      // (os dois casos caem na fronteira entre pendentes e feitas)
      const firstDone = items.findIndex((i) => i.done);
      items.splice(firstDone === -1 ? items.length : firstDone, 0, item);
      save();
      render();
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
    withUndo(n === 1 ? "1 feita removida" : n + " feitas removidas", () => {
      list.items = list.items.filter((i) => !i.done);
    });
  });

  /* ---------- abas ---------- */
  const dialog = $("tab-dialog");
  let editingId = null; // null = nova lista

  function openTabDialog(listId) {
    editingId = listId;
    const list = listId && state.lists.find((l) => l.id === listId);
    $("tab-dialog-title").textContent = list ? "Editar lista" : "Nova lista";
    $("tab-name").value = list ? list.name : "";
    $("tab-delete").hidden = !list || state.lists.length <= 1;
    $("tab-save").textContent = list ? "Salvar" : "Criar";
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
      if (list) list.name = name;
    } else {
      const list = { id: uid(), name, items: [] };
      state.lists.push(list);
      state.active = list.id;
    }
    save();
    render();
  });

  $("tab-delete").addEventListener("click", () => {
    const list = state.lists.find((l) => l.id === editingId);
    if (!list) return;
    dialog.returnValue = "cancel";
    dialog.close();
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

  render();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw-tarefas.js").catch(() => {});
    });
  }
})();
