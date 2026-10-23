(() => {
  "use strict";

  const CARD_SIZE = 5;
  const MIN_TEAMS = 2;
  const MAX_TEAMS = 6;
  const LETTERS = "ABCDEF";
  const KEYS = {
    game: "study30.game", custom: "study30.custom", prefs: "study30.prefs", focus: "study30.focus",
    pile: "study30.pile", quizGame: "study30.quizgame", quizSeen: "study30.quizseen", quizPrefs: "study30.quizprefs",
  };
  const LIMITS = { target: [5, 100], seconds: [10, 90] };

  // What a term is. Every pack uses these, so a card can mix subjects and
  // still cover five different kinds of thing.
  const CATS = {
    dx: "Diagnosis", sign: "Sign & symptom", test: "Investigation",
    drug: "Drug & treatment", physio: "Mechanism", classic: "Eponym & classic",
  };
  const LEVELS = [[1, "Core"], [2, "+ Clinical"], [3, "+ Deep cuts"]];
  const OWN = "own"; // the topic key for terms added on this phone

  // The classic die takes 0, 1 or 2 off the turn. The Chaos die keeps one of
  // each and swaps the duplicates for faces that change the rules instead.
  const CLASSIC_DIE = [0, 0, 1, 1, 2, 2];
  const CHAOS_DIE = [0, 1, 2, "mime", "three", "double"];
  const TWISTS = {
    mime: { face: "MIME", big: "Mime it", banner: "Mime it · no talking", receipt: "Mime it",
      note: "No talking this turn. Act everything out: signs, procedures, the lot. Nothing comes off." },
    three: { face: "3 WORDS", big: "3 words", banner: "Three words per clue", receipt: "3 words",
      note: "Every clue is three words or fewer. Nothing comes off." },
    double: { face: "×2", big: "×2", banner: "Double points", receipt: "Double",
      note: "Double points this turn, and nothing comes off." },
  };
  const PIPS = { 0: [], 1: [4], 2: [2, 6] };

  // One highlighter per team, with a text colour that passes contrast on it.
  const TEAM_INKS = [
    { bg: "#0E8C83", fg: "#FFFFFF" },
    { bg: "#FFD84D", fg: "#1D2B53" },
    { bg: "#FF8FB1", fg: "#1D2B53" },
    { bg: "#1D2B53", fg: "#FFFFFF" },
    { bg: "#7FD1C4", fg: "#1D2B53" },
    { bg: "#E2553E", fg: "#FFFFFF" },
  ];
  const AWARD_INKS = [TEAM_INKS[0], TEAM_INKS[1], TEAM_INKS[2], TEAM_INKS[3]];
  const BURST = "22,1 25.8,5.4 31.1,3.1 32.6,8.7 38.4,8.9 37.3,14.6 42.5,17.3 39,22 42.5,26.7 37.3,29.4 38.4,35.1 32.6,35.3 31.1,40.9 25.8,38.6 22,43 18.2,38.6 12.9,40.9 11.4,35.3 5.6,35.1 6.7,29.4 1.5,26.7 5,22 1.5,17.3 6.7,14.6 5.6,8.9 11.4,8.7 12.9,3.1 18.2,5.4";

  const $ = (sel) => document.querySelector(sel);

  let setup = null;  // { names, target, seconds, chaos }
  let game = null;   // { teams, target, seconds, chaos, current, deck, history }
  let turn = null;   // { die, card: [term + got], from }
  let timerId = null;
  let wakeLock = null;
  let pendingImport = [];
  let pickedCat = "dx";

  // ------------------------------------------------------------------ helpers

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "style") Object.assign(node.style, value);
      else node.setAttribute(key, value);
    }
    node.append(...children.filter((c) => c != null));
    return node;
  }

  // Static, trusted SVG markup only.
  function svg(markup) {
    const t = document.createElement("template");
    t.innerHTML = markup.trim();
    return t.content.firstChild;
  }

  const ARROW = '<svg class="arrow" aria-hidden="true" width="22" height="16" viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 8h18M13 2l6 6-6 6"/></svg>';
  const TICK = '<svg aria-hidden="true" width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" stroke-width="3"><path d="M1.5 6.5l3.5 3.5 7.5-8.5"/></svg>';

  const pad = (n) => String(n).padStart(2, "0");
  const rand = (n) => Math.floor(Math.random() * n);
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const termKey = (term) => term.trim().toLowerCase();
  // Looser key for spotting duplicates: "Nephrotic syndrome" and
  // "nephrotic-syndrome" are the same term.
  const dupKey = (term) => {
    const key = termKey(term).normalize("NFKD").replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");
    return key || termKey(term);
  };

  function clampInt(value, min, max, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function setPlates(node, text) {
    node.textContent = text;
    node.dataset.text = text;
  }

  // The browser tab follows the game: whose turn it is, and the clock while
  // it's running, so a glance at the tab says what's happening.
  const TAB = "Study · 30 Seconds";
  function tabTitle(name) {
    const team = game && game.teams[game.current] ? game.teams[game.current].name : "";
    const quizTeamName = quiz && quiz.teams[quiz.current] ? quiz.teams[quiz.current].name : "";
    return {
      deck: "Add terms · Study 30",
      import: "New terms · Study 30",
      handoff: `${team} up next · Study 30`,
      review: "Time's up · Study 30",
      winner: `🏆 ${team} win · Study 30`,
      "quiz-setup": "The quiz · Study 30",
      "quiz-turn": `${quizTeamName} up next · Study 30 quiz`,
      "quiz-reveal": "The answer · Study 30 quiz",
      "quiz-end": "🏆 The podium · Study 30 quiz",
      revise: "Revise · Study 30",
      cards: "Flashcards · Study 30",
    }[name] || TAB;
  }

  function tabClock(seconds, who) {
    document.title = `${seconds <= 5 ? "🔴" : "⏱"} ${seconds}s · ${who}`;
  }

  function show(name) {
    if (!["play", "quiz-q"].includes(name)) document.title = tabTitle(name);
    document.body.dataset.screen = name;
    for (const screen of document.querySelectorAll("#app > .screen")) {
      screen.hidden = screen.id !== name;
      screen.classList.toggle("feed", screen.id === name);
    }
    window.scrollTo(0, 0);
  }

  let toastTimer = null;
  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.hidden = true; }, 2600);
  }

  const store = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch {}
    },
  };

  // ------------------------------------------------------------------ packs
  //
  // Each file in packs/ pushes one subject onto PACKS: its topics, its terms
  // ([term, category, topic, level, note]) and its quiz questions. See
  // packs/README.md for the format.

  const ALL_PACKS = (typeof PACKS !== "undefined" && Array.isArray(PACKS) ? PACKS : [])
    .filter((p) => p && p.id && p.name && p.topics);
  const PACK = new Map(ALL_PACKS.map((p) => [p.id, p]));

  const BANK_TERMS = [];  // [{ term, cat, pack, topic, level, why }]
  for (const p of ALL_PACKS) {
    for (const row of Array.isArray(p.terms) ? p.terms : []) {
      if (!Array.isArray(row) || typeof row[0] !== "string" || !row[0].trim()) continue;
      const [term, cat, topic, level, note] = row;
      BANK_TERMS.push({
        term: term.trim(), cat: CATS[cat] ? cat : "dx", pack: p.id,
        topic: p.topics[topic] ? topic : Object.keys(p.topics)[0],
        level: clampInt(level, 1, 3, 2), why: typeof note === "string" ? note.trim() : "",
      });
    }
  }

  const topicName = (pack, topic) => (topic === OWN ? "Your own terms" : PACK.get(pack)?.topics[topic] || "");
  const topicId = (pack, topic) => (topic === OWN ? OWN : `${pack}:${topic}`);

  // focus: which subjects are on, which of their topics are switched off, and
  // the hardest level to include.
  let focus = null;
  function loadFocus() {
    const saved = store.get(KEYS.focus, {}) || {};
    const packs = (Array.isArray(saved.packs) ? saved.packs : []).filter((id) => PACK.has(id));
    focus = {
      packs: packs.length ? packs : ALL_PACKS.slice(0, 1).map((p) => p.id),
      off: Array.isArray(saved.off) ? saved.off.map(String) : [],
      level: clampInt(saved.level, 1, 3, 3),
    };
  }
  const saveFocus = () => store.set(KEYS.focus, focus);

  function inFocus(item) {
    if (item.topic === OWN) return !focus.off.includes(OWN);
    return focus.packs.includes(item.pack) && !focus.off.includes(topicId(item.pack, item.topic))
      && item.level <= focus.level;
  }

  function customTerms() {
    const list = store.get(KEYS.custom, []);
    return Array.isArray(list)
      ? list.filter((t) => t && typeof t.term === "string" && t.term.trim())
        .map((t) => ({ term: t.term.trim(), cat: CATS[t.cat] ? t.cat : "dx", pack: "", topic: OWN, level: 1, why: String(t.why || "") }))
      : [];
  }

  // Every term in play right now, with duplicates across subjects dropped.
  function allTerms() {
    const seen = new Set();
    const out = [];
    for (const t of [...BANK_TERMS, ...customTerms()]) {
      if (!inFocus(t)) continue;
      const key = dupKey(t.term);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out;
  }

  // Related terms give each other away ("Nephrotic syndrome" next to
  // "Nephrotic-range proteinuria"), so no two terms on a card share a
  // meaningful word. Words every subject uses don't count.
  const STOPWORDS = new Set(("the and for from with not you your are was who what why how when this that " +
    "its into out off over than then also very too all one two type syndrome disease disorder acute chronic " +
    "primary secondary test sign signs score criteria failure injury left right high low") .split(" "));

  function familiesOf(term) {
    const fams = new Set();
    const words = term.toLowerCase().replace(/['’]s\b/g, "").split(/[^a-z0-9]+/);
    for (const w of words) if (w.length >= 3 && !STOPWORDS.has(w)) fams.add(w.replace(/(ic|al|y|s)$/, ""));
    return fams;
  }

  // Deals five terms from the top of the deck, skipping any that clash with
  // the card so far. The first pass also wants five different categories;
  // later passes relax that, then the word rule, so a card always fills.
  function drawCard() {
    if (game.deck.length < CARD_SIZE * 3) {
      const left = new Set(game.deck.map((t) => termKey(t.term)));
      game.deck.push(...shuffle(allTerms().filter((t) => !left.has(termKey(t.term)))));
    }
    const picked = [];
    const taken = new Set();
    const cats = new Set();
    const pass = (newCategory, newFamilies) => {
      for (let i = 0; i < game.deck.length && picked.length < CARD_SIZE; i++) {
        const t = game.deck[i];
        if (!t || (newCategory && cats.has(t.cat))) continue;
        const fams = familiesOf(t.term);
        if (newFamilies && [...fams].some((f) => taken.has(f))) continue;
        picked.push(t);
        fams.forEach((f) => taken.add(f));
        cats.add(t.cat);
        game.deck[i] = null;
      }
    };
    pass(true, true);
    pass(false, true);
    pass(false, false);
    game.deck = game.deck.filter(Boolean);
    return picked.map((t) => ({ ...t, got: false }));
  }

  // Share links carry terms in the URL hash as base64url-encoded JSON, so no
  // server is needed: #add=<code>
  function encodeTerms(list) {
    const json = JSON.stringify(list.map((t) => [t.term, t.cat, t.why || ""]));
    let bin = "";
    new TextEncoder().encode(json).forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decodeTerms(code) {
    try {
      const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
      const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
      const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
      if (!Array.isArray(data)) return [];
      return data
        .filter((row) => Array.isArray(row) && typeof row[0] === "string")
        .slice(0, 500)
        .map(([term, cat, why]) => ({
          term: term.trim().slice(0, 80),
          cat: CATS[cat] ? cat : "dx",
          why: String(why || "").trim().slice(0, 160),
        }))
        .filter((t) => t.term);
    } catch {
      return [];
    }
  }

  // ------------------------------------------------------------------ the revision pile
  //
  // Every term a team missed and every quiz question answered wrong lands
  // here, with its fact, for the flashcards later. Stored on this phone.

  function pile() {
    const list = store.get(KEYS.pile, []);
    return Array.isArray(list) ? list.filter((p) => p && p.id && p.front) : [];
  }

  function addToPile(items) {
    const list = pile();
    for (const item of items) {
      const old = list.find((p) => p.id === item.id);
      if (old) { old.misses = (old.misses || 1) + 1; old.at = Date.now(); }
      else list.push({ ...item, misses: 1, at: Date.now() });
    }
    store.set(KEYS.pile, list.slice(-400));
  }

  function removeFromPile(id) {
    store.set(KEYS.pile, pile().filter((p) => p.id !== id));
  }

  const termCard = (t) => ({
    id: `t:${dupKey(t.term)}`, front: t.term, back: t.why,
    sub: [CATS[t.cat], topicName(t.pack, t.topic)].filter(Boolean).join(" · "),
  });

  // ------------------------------------------------------------------ sound + device

  let audio = null;

  function unlockAudio() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
    } catch {}
  }

  function beep(freq, duration, volume = 0.2) {
    if (!audio) return;
    try {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(audio.destination);
      const now = audio.currentTime;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.start(now);
      osc.stop(now + duration);
    } catch {}
  }

  function haptic(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {}
  }

  async function keepScreenOn(on) {
    try {
      if (on && "wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
      else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch {}
  }

  function fanfare() {
    haptic([60, 40, 60, 40, 120]);
    beep(523, 0.15);
    setTimeout(() => beep(659, 0.15), 150);
    setTimeout(() => beep(784, 0.3), 300);
  }

  // ------------------------------------------------------------------ saving

  function saveGame() { store.set(KEYS.game, game); }

  function loadSaved() {
    const data = store.get(KEYS.game, null);
    if (!data || !Array.isArray(data.teams) || data.teams.length < MIN_TEAMS) return null;
    data.teams.forEach((t, i) => { if (typeof t.ink !== "number") t.ink = i % TEAM_INKS.length; });
    if (!Array.isArray(data.history)) data.history = [];
    data.chaos = !!data.chaos;
    if (!Array.isArray(data.deck)) data.deck = shuffle(allTerms());
    data.current = clampInt(data.current, 0, data.teams.length - 1, 0);
    return data;
  }

  // ------------------------------------------------------------------ setup

  function initSetup(prefill) {
    const prefs = store.get(KEYS.prefs, {}) || {};
    const savedNames = Array.isArray(prefs.names) && prefs.names.length >= MIN_TEAMS ? prefs.names : null;
    setup = {
      names: (prefill?.names ?? savedNames ?? ["Team 1", "Team 2"]).slice(0, MAX_TEAMS),
      target: clampInt(prefill?.target ?? prefs.target, ...LIMITS.target, 25),
      seconds: clampInt(prefill?.seconds ?? prefs.seconds, ...LIMITS.seconds, 30),
      chaos: !!(prefill?.chaos ?? prefs.chaos),
    };
    renderTeamInputs();
    renderSettings();
    renderFocus();
    $("#resume").hidden = !loadSaved();
  }

  const DECK_SHORT = `Pick more topics: a game needs at least ${CARD_SIZE} terms.`;

  function setupError(message) {
    const node = $("#setup-error");
    node.textContent = message || "";
    node.hidden = !message;
  }

  function chip(label, pressed, onClick, extra = {}) {
    const b = el("button", { type: "button", "aria-pressed": String(pressed), text: label, ...extra });
    b.addEventListener("click", onClick);
    return b;
  }

  // "What you're revising": subjects, their topics, and how deep to go.
  function renderFocus() {
    $("#pack-chips").replaceChildren(...ALL_PACKS.map((p) => chip(p.name, focus.packs.includes(p.id), () => {
      const on = focus.packs.includes(p.id);
      if (on && focus.packs.length === 1) return toast("Keep at least one subject on.");
      focus.packs = on ? focus.packs.filter((id) => id !== p.id) : [...focus.packs, p.id];
      saveFocus();
      renderFocus();
    })));

    const topics = [];
    for (const id of focus.packs) {
      const p = PACK.get(id);
      for (const [key, name] of Object.entries(p.topics)) topics.push([topicId(id, key), focus.packs.length > 1 ? `${name}` : name]);
    }
    if (customTerms().length) topics.push([OWN, "Your own terms"]);
    const allOn = topics.every(([id]) => !focus.off.includes(id));
    $("#topic-chips").replaceChildren(
      chip("All topics", allOn, () => {
        const ids = topics.map(([id]) => id);
        focus.off = allOn ? focus.off.concat(ids.slice(1)) : focus.off.filter((id) => !ids.includes(id));
        saveFocus();
        renderFocus();
      }, { class: "all" }),
      ...topics.map(([id, name]) => chip(name, !focus.off.includes(id), () => {
        focus.off = focus.off.includes(id) ? focus.off.filter((x) => x !== id) : [...focus.off, id];
        saveFocus();
        renderFocus();
      })));

    $("#level-chips").replaceChildren(...LEVELS.map(([n, label]) => chip(`${"●".repeat(n)} ${label}`, focus.level === n, () => {
      focus.level = n;
      saveFocus();
      renderFocus();
    })));

    const terms = allTerms().length;
    const questions = quizBank().length;
    $("#focus-info").textContent = `${plural(terms, "term")} · ${plural(questions, "quiz question")} in this selection`;
    const subjects = focus.packs.map((id) => PACK.get(id).name);
    $("#deck-info").textContent = subjects.length > 2 ? `${subjects.length} subjects` : subjects.join(" + ");
    const enough = terms >= CARD_SIZE;
    $("#start-game").disabled = !enough;
    setupError(enough ? "" : ALL_PACKS.length ? DECK_SHORT : "No subject packs loaded.");
  }

  function renderTeamInputs() {
    renderTeamList($("#team-list"), $("#add-team"), setup.names, renderTeamInputs, MIN_TEAMS);
  }

  // The editable list of team names, shared by the game and the quiz.
  function renderTeamList(list, addBtn, names, rerender, min) {
    list.replaceChildren(...names.map((name, i) => {
      const ink = TEAM_INKS[i % TEAM_INKS.length];
      const input = el("input", { type: "text", maxlength: "30", autocomplete: "off", enterkeyhint: "next" });
      input.value = name;
      input.addEventListener("input", () => { names[i] = input.value; });
      const label = el("label", {}, el("span", { class: "sr-only", text: `Team ${LETTERS[i]} name` }), input);
      const li = el("li", {},
        el("span", { class: "chip", "aria-hidden": "true", style: { background: ink.bg, color: ink.fg }, text: LETTERS[i] }),
        label);
      if (names.length > min) {
        const remove = el("button", { type: "button", class: "remove", "aria-label": `Remove team ${LETTERS[i]}`, text: "×" });
        remove.addEventListener("click", () => {
          names.splice(i, 1);
          rerender();
        });
        li.append(remove);
      }
      return li;
    }));
    addBtn.hidden = names.length >= MAX_TEAMS;
  }

  function renderSettings() {
    for (const key of ["target", "seconds"]) {
      $("#" + key).textContent = setup[key];
      for (const btn of document.querySelectorAll(`[data-setting="${key}"]`)) {
        const step = Number(btn.dataset.step);
        btn.disabled = step < 0 ? setup[key] <= LIMITS[key][0] : setup[key] >= LIMITS[key][1];
      }
    }
    $("#chaos").setAttribute("aria-checked", String(setup.chaos));
  }

  document.querySelectorAll("[data-setting]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.setting;
      setup[key] = clampInt(setup[key] + Number(btn.dataset.step), ...LIMITS[key], setup[key]);
      renderSettings();
    });
  });

  $("#chaos").addEventListener("click", () => {
    setup.chaos = !setup.chaos;
    renderSettings();
  });

  $("#add-team").addEventListener("click", () => {
    setup.names.push(`Team ${setup.names.length + 1}`);
    renderTeamInputs();
    const input = $("#team-list li:last-child input");
    input.focus();
    input.select();
  });

  $("#start-game").addEventListener("click", () => {
    const names = setup.names.map((n, i) => n.trim() || `Team ${i + 1}`);
    const lower = names.map((n) => n.toLowerCase());
    if (new Set(lower).size !== lower.length) return setupError("Give each team a different name.");
    setupError("");
    store.set(KEYS.prefs, { names, target: setup.target, seconds: setup.seconds, chaos: setup.chaos });
    unlockAudio();
    startGame({ ...setup, names });
  });

  $("#resume").addEventListener("click", () => {
    game = loadSaved();
    if (!game) return initSetup();
    showHandoff();
  });

  function startGame({ names, target, seconds, chaos }, deck) {
    game = {
      teams: names.map((name, i) => ({ name, score: 0, ink: i % TEAM_INKS.length })),
      target,
      seconds,
      chaos,
      current: 0,
      deck: deck && deck.length >= CARD_SIZE ? deck : shuffle(allTerms()),
      history: [],
    };
    saveGame();
    showHandoff();
  }

  // ------------------------------------------------------------------ add your own terms

  function openDeck() {
    renderDeck();
    show("deck");
  }

  function renderDeck() {
    $("#cat-chips").replaceChildren(...Object.entries(CATS).map(([key, label]) =>
      chip(label, key === pickedCat, () => { pickedCat = key; renderDeck(); })));

    const mine = store.get(KEYS.custom, []);
    $("#mine-list").replaceChildren(...mine.map((t, i) => ({ t, i })).reverse().map(({ t, i }) => {
      const remove = el("button", { type: "button", class: "x", "aria-label": `Remove ${t.term}`, text: "×" });
      remove.addEventListener("click", () => {
        const list = store.get(KEYS.custom, []);
        list.splice(i, 1);
        store.set(KEYS.custom, list);
        renderDeck();
      });
      return el("li", {},
        el("span", { class: "tw" }, el("span", { class: "t", text: t.term }), t.why ? el("span", { class: "why", text: t.why }) : null),
        el("span", { class: "c", text: CATS[t.cat] || "" }), remove);
    }));
    $("#mine-count").textContent = mine.length;
    $("#mine-empty").hidden = mine.length > 0;
    $("#deck-total").textContent = `${plural(mine.length, "term")} of your own`;
  }

  // Adds terms to this phone's own list, skipping any already in a pack.
  function addTerms(list) {
    const mine = store.get(KEYS.custom, []);
    const existing = new Set([...BANK_TERMS, ...mine].map((t) => dupKey(t.term)));
    let added = 0;
    for (const t of list) {
      const term = String(t.term || "").trim().slice(0, 80);
      const key = dupKey(term);
      if (!term || existing.has(key)) continue;
      existing.add(key);
      mine.push({ term, cat: CATS[t.cat] ? t.cat : "dx", why: String(t.why || "").trim().slice(0, 160) });
      added++;
    }
    store.set(KEYS.custom, mine);
    // New terms join the game straight away.
    focus.off = focus.off.filter((id) => id !== OWN);
    saveFocus();
    return added;
  }

  function addedMessage(added, tried) {
    const skipped = tried - added;
    if (!added) return tried === 1 ? "That one's already in the deck." : "All of those are already in the deck.";
    return `Added ${plural(added, "term")}${skipped ? `, skipped ${skipped} already in` : ""}.`;
  }

  $("#add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#new-term");
    const term = input.value.trim();
    if (!term) return input.focus();
    const added = addTerms([{ term, cat: pickedCat, why: $("#new-note").value }]);
    if (added) {
      haptic(15);
      input.value = "";
      $("#new-note").value = "";
      toast(`Added “${term}”.`);
    } else {
      toast("That one's already in the deck.");
    }
    renderDeck();
    input.focus();
  });

  $("#new-term").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); $("#new-note").focus(); }
  });

  $("#paste-toggle").addEventListener("click", () => {
    const panel = $("#paste-panel");
    panel.hidden = !panel.hidden;
    $("#paste-toggle").setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) $("#paste-text").focus();
  });

  $("#paste-add").addEventListener("click", () => {
    const lines = $("#paste-text").value
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 300);
    if (!lines.length) return $("#paste-text").focus();
    const list = lines.map((line) => {
      const [term, ...rest] = line.split(/\s+[–—-]\s+|\s*:\s+/);
      return { term, why: rest.join(" – "), cat: pickedCat };
    });
    toast(addedMessage(addTerms(list), list.length));
    $("#paste-text").value = "";
    $("#paste-panel").hidden = true;
    $("#paste-toggle").setAttribute("aria-expanded", "false");
    renderDeck();
  });

  $("#share-link").addEventListener("click", async () => {
    const mine = store.get(KEYS.custom, []);
    if (!mine.length) return toast("Add a few terms first, then share them.");
    const url = `${location.href.split("#")[0]}#add=${encodeTerms(mine)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Study 30 Seconds", text: `${plural(mine.length, "term")} for the deck`, url });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied. Paste it in the study group chat.");
    } catch {
      window.prompt("Copy this link and send it to your study group:", url);
    }
  });

  $("#deck-back").addEventListener("click", () => {
    renderFocus();
    show("setup");
  });

  // ------------------------------------------------------------------ incoming share links

  function checkIncoming() {
    const match = location.hash.match(/^#add=([A-Za-z0-9_-]+)$/);
    if (!match) return false;
    history.replaceState(null, "", location.pathname + location.search);

    const incoming = decodeTerms(match[1]);
    if (!incoming.length) {
      toast("That link didn't have any terms in it.");
      return false;
    }
    const seen = new Set([...BANK_TERMS, ...customTerms()].map((t) => dupKey(t.term)));
    pendingImport = incoming.filter((t) => {
      const key = dupKey(t.term);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!pendingImport.length) {
      toast("You already have all of those terms.");
      return false;
    }

    const n = pendingImport.length;
    setPlates($("#import-title"), `${plural(n, "new term")}`);
    const preview = pendingImport.slice(0, 12);
    $("#import-list").replaceChildren(...preview.map((t) =>
      el("li", {}, el("span", { class: "t", text: t.term }), el("span", { class: "c", text: CATS[t.cat] }))));
    $("#import-more").textContent = n > preview.length ? `…and ${n - preview.length} more.` : "";
    show("import");
    return true;
  }

  $("#import-yes").addEventListener("click", () => {
    const tried = pendingImport.length;
    const added = addTerms(pendingImport);
    pendingImport = [];
    initSetup();
    show("setup");
    toast(addedMessage(added, tried));
  });

  $("#import-no").addEventListener("click", () => {
    pendingImport = [];
    show("setup");
  });

  window.addEventListener("hashchange", () => {
    if (!timerId) checkIncoming();
  });

  // ------------------------------------------------------------------ standings

  function progress(score, target, color) {
    if (target <= 50) {
      const cols = Math.min(target, 25);
      const dots = el("div", { class: "dots", "aria-hidden": "true",
        style: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: `${cols * 18}px` } });
      for (let n = 0; n < target; n++) dots.append(el("i", { style: n < score ? { background: color } : {} }));
      return dots;
    }
    return el("div", { class: "bar", "aria-hidden": "true" },
      el("i", { style: { width: `${Math.min(100, (score / target) * 100)}%`, background: color } }));
  }

  function renderStandings(container, highlight) {
    container.replaceChildren(...game.teams.map((t, i) => {
      const ink = TEAM_INKS[t.ink];
      return el("div", { class: "team-row" + (i === highlight ? " current" : "") },
        el("div", { class: "team-head" },
          el("span", { class: "chip", "aria-hidden": "true", style: { background: ink.bg, color: ink.fg }, text: LETTERS[i] }),
          el("span", { class: "team-name" }, el("span", { text: t.name })),
          el("span", { class: "team-score", text: String(t.score) }),
          el("span", { class: "team-of", text: `/${game.target}` })),
        progress(t.score, game.target, ink.bg));
    }));
  }

  // ------------------------------------------------------------------ handoff + die

  const currentTeam = () => game.teams[game.current];
  const turnNumber = () => game.history.length + 1;

  function showHandoff() {
    turn = { die: null, card: null };
    $("#turn-no").textContent = `Turn ${pad(turnNumber())}`;
    $("#first-to").textContent = `First to ${game.target}`;
    renderStandings($("#standings"), game.current);
    setPlates($("#team-up"), currentTeam().name);
    renderDie(null);
    $("#die-big").textContent = "Roll";
    $("#die-note").textContent = game.chaos
      ? "Chaos die is on. Some faces change the rules for this turn."
      : "Whatever it lands on comes off this turn's score.";
    $("#roll").hidden = false;
    $("#roll").disabled = false;
    $("#go-wrap").hidden = true;
    show("handoff");
  }

  function renderDie(face, shaking = false) {
    const die = $("#die");
    die.className = "die";
    if (face === null) {
      die.replaceChildren(el("span", { class: "q", text: "?" }));
      die.setAttribute("aria-label", "Die not rolled yet");
      return;
    }
    if (typeof face === "number") {
      const pips = el("span", { class: "pips" });
      for (let i = 0; i < 9; i++) pips.append(el("i", { class: PIPS[face].includes(i) ? "on" : "" }));
      die.replaceChildren(pips);
      die.setAttribute("aria-label", `Die shows ${face}`);
    } else {
      die.classList.add("twist", face);
      die.replaceChildren(el("span", { class: "face" + (face === "double" ? " big" : ""), text: TWISTS[face].face }));
      die.setAttribute("aria-label", `Die shows ${TWISTS[face].big}`);
    }
    die.classList.add(shaking ? "shake" : "landed");
  }

  function describeDie(face) {
    if (typeof face === "number") {
      $("#die-big").textContent = face ? `−${face}` : "0";
      $("#die-note").textContent = ["Lucky. Nothing comes off this turn.",
        "One comes off whatever you score.", "Two come off whatever you score."][face];
    } else {
      $("#die-big").textContent = TWISTS[face].big;
      $("#die-note").textContent = TWISTS[face].note;
    }
  }

  function dieLabel(face) {
    if (typeof face !== "number") return TWISTS[face].big;
    return face ? `Die −${face}` : "Die 0";
  }

  $("#roll").addEventListener("click", () => {
    unlockAudio();
    const faces = game.chaos ? CHAOS_DIE : CLASSIC_DIE;
    const result = faces[rand(faces.length)];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let flips = reduceMotion ? 0 : 8;
    $("#roll").disabled = true;

    const step = () => {
      if (flips-- > 0) {
        renderDie(faces[rand(faces.length)], true);
        beep(300 + Math.random() * 200, 0.03, 0.08);
        return setTimeout(step, 70);
      }
      turn.die = result;
      renderDie(result);
      describeDie(result);
      haptic(30);
      $("#roll").hidden = true;
      $("#go-wrap").hidden = false;
      $("#go").focus();
    };
    step();
  });

  $("#quit").addEventListener("click", () => {
    if (!window.confirm("End this game? The scores will be lost.")) return;
    store.remove(KEYS.game);
    game = null;
    initSetup();
    show("setup");
  });

  // ------------------------------------------------------------------ play

  function gotCount() {
    return turn.card.filter((t) => t.got).length;
  }

  function turnPoints(got, face) {
    if (face === "double") return got * 2;
    if (typeof face === "number") return Math.max(0, got - face);
    return got;
  }

  // Tap toggles a term; a swipe to the right always marks it as got.
  function attachSwipe(node, onSwipe, onTap) {
    const body = node.querySelector(".body");
    let startX = 0, startY = 0, dx = 0;
    let tracking = false, dragging = false, swallowClick = false;

    node.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      tracking = true;
      dragging = false;
      swallowClick = false;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
    });
    node.addEventListener("pointermove", (e) => {
      if (!tracking) return;
      dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        dragging = true;
        node.classList.add("dragging");
        try { node.setPointerCapture(e.pointerId); } catch {}
      }
      if (dragging) body.style.transform = `translateX(${Math.max(0, Math.min(dx, 140))}px)`;
    });
    const reset = () => {
      node.classList.remove("dragging");
      body.style.transform = "";
    };
    node.addEventListener("pointerup", () => {
      if (!tracking) return;
      tracking = false;
      if (dragging) {
        swallowClick = true;
        reset();
        if (dx > 60) onSwipe();
      }
      dragging = false;
    });
    node.addEventListener("pointercancel", () => {
      tracking = false;
      dragging = false;
      reset();
    });
    node.addEventListener("click", () => {
      if (swallowClick) { swallowClick = false; return; }
      onTap();
    });
  }

  // "Investigation · ●●": the dots are the term's level.
  function categoryLabel(item) {
    return item.topic === OWN ? `${CATS[item.cat]} · yours` : `${CATS[item.cat]} · ${"●".repeat(item.level)}`;
  }

  const termSetters = [];

  function termRow(item, i) {
    const btn = el("button", { type: "button", class: "term", "aria-pressed": String(item.got) },
      el("span", { class: "num", "aria-hidden": "true", text: pad(i + 1) }),
      el("span", { class: "body" },
        el("span", { class: "word", text: item.term }),
        el("span", { class: "cat", text: categoryLabel(item) })),
      svg(ARROW),
      el("span", { class: "stamp", "aria-hidden": "true", text: "GOT IT!" }));

    const set = (value) => {
      if (item.got === value) return;
      item.got = value;
      btn.setAttribute("aria-pressed", String(value));
      if (value) {
        beep(660, 0.08, 0.12);
        haptic(15);
      }
      updatePlayCount(value);
    };
    termSetters[i] = () => set(!item.got);
    attachSwipe(btn, () => set(true), () => set(!item.got));
    return el("li", {}, btn);
  }

  $("#go").addEventListener("click", () => {
    unlockAudio();
    turn.card = drawCard();
    turn.from = 0;
    saveGame(); // remember which terms were used, even if the page reloads mid-turn

    $("#play-team").textContent = currentTeam().name;
    $("#play-die").textContent = dieLabel(turn.die);
    const twist = TWISTS[turn.die];
    $("#twist").hidden = !twist;
    $("#twist").textContent = twist ? twist.banner : "";
    renderCard();

    show("play");
    keepScreenOn(true);
    startTimer();
  });

  function renderCard() {
    termSetters.length = 0;
    $("#terms").replaceChildren(...turn.card.slice(turn.from).map(termRow));
    $("#deck-left").textContent = `${game.deck.length} left in the deck`;
    updatePlayCount(false);
  }

  // Once every term on the card is got, the describer can deal another card
  // and keep going on the same clock.
  function updatePlayCount(justGot) {
    const cardNo = turn.from / CARD_SIZE + 1;
    $("#got-count").textContent = gotCount();
    $("#got-of").textContent = turn.card.length;
    $("#card-no").textContent = cardNo > 1 ? `Card ${cardNo} · ` : "";
    const cleared = turn.card.slice(turn.from).every((t) => t.got);
    const wrap = $("#next-card-wrap");
    if (cleared && wrap.hidden && justGot) {
      beep(990, 0.12, 0.15);
      haptic([30, 40, 30]);
    }
    wrap.hidden = !cleared;
  }

  $("#next-card").addEventListener("click", () => {
    if (!timerId) return;
    turn.from = turn.card.length;
    turn.card.push(...drawCard());
    saveGame();
    renderCard();
  });

  function startTimer() {
    const total = game.seconds * 1000;
    const endsAt = Date.now() + total;
    const clock = $("#clock");
    let lastWhole = null;

    const tick = () => {
      const left = Math.max(0, endsAt - Date.now());
      const whole = Math.ceil(left / 1000);
      if (whole !== lastWhole) {
        setPlates(clock, String(whole));
        $("#clock-sr").textContent = `${whole} seconds left`;
        tabClock(whole, currentTeam().name);
        $("#play").classList.toggle("urgent", whole <= 5);
        if (lastWhole !== null && whole > 0 && whole <= 5) beep(880, 0.06, 0.12);
        lastWhole = whole;
      }
      $("#fuse").style.width = `${(left / total) * 100}%`;
      if (left <= 0) endTurn(true);
    };

    clearInterval(timerId);
    tick();
    timerId = setInterval(tick, 100);
  }

  function endTurn(timeUp) {
    clearInterval(timerId);
    timerId = null;
    keepScreenOn(false);
    $("#play").classList.remove("urgent");
    if (timeUp) {
      beep(440, 0.6, 0.3);
      haptic([200, 100, 200]);
    }
    renderReview(timeUp);
    show("review");
  }

  $("#end-early").addEventListener("click", () => endTurn(false));

  // ------------------------------------------------------------------ review

  function renderReview(timeUp) {
    $("#review-team").textContent = currentTeam().name;
    $("#review-turn").textContent = `Turn ${pad(turnNumber())}`;
    $("#review-title").textContent = timeUp ? "Time's up" : "Turn over";

    $("#review-terms").replaceChildren(...turn.card.map((item) => {
      const status = el("span", { class: "s", text: item.got ? "Got" : "Missed" });
      const topic = topicName(item.pack, item.topic);
      const btn = el("button", { type: "button", class: "check", "aria-pressed": String(item.got) },
        el("span", { class: "box" }, svg(TICK)),
        el("span", { class: "tw" },
          el("span", { class: "t", text: item.term }),
          item.why ? el("span", { class: "why", text: item.why }) : null,
          topic ? el("span", { class: "where", text: topic }) : null),
        status);
      btn.addEventListener("click", () => {
        item.got = !item.got;
        btn.setAttribute("aria-pressed", String(item.got));
        status.textContent = item.got ? "Got" : "Missed";
        renderReceipt();
      });
      return el("li", {}, btn);
    }));
    renderReceipt();
  }

  function renderReceipt() {
    const team = currentTeam();
    const got = gotCount();
    const points = turnPoints(got, turn.die);
    const face = turn.die;
    const missed = turn.card.length - got;
    const dieValue = face === "double" ? "×2" : typeof face === "number" && face > 0 ? `−${face}` : "0";
    const dieName = typeof face === "number" ? "Die" : `Die: ${TWISTS[face].receipt}`;
    const line = (left, right, cls = "") => el("div", { class: "r-line " + cls }, el("span", { text: left }), right);

    $("#receipt").replaceChildren(
      el("div", { class: "r-head", text: "RESULTS · STUDY 30" }),
      el("div", { class: "r-sub", text: `Turn ${pad(turnNumber())} · ${team.name}` }),
      el("div", { class: "r-rule", "aria-hidden": "true" }),
      line("Guessed", el("span", { text: String(got) })),
      line(dieName, el("span", { text: dieValue })),
      missed ? line("To the revision pile", el("span", { text: String(missed) })) : null,
      el("div", { class: "r-rule double", "aria-hidden": "true" }),
      line("This turn", el("b", { text: `+${points}` }), "r-total"),
      line("New total", el("span", { text: `${team.score + points} / ${game.target}` })));
    $("#confirm-label").textContent = `Bank ${plural(points, "point")}`;
  }

  $("#confirm").addEventListener("click", () => {
    const team = currentTeam();
    const got = gotCount();
    const points = turnPoints(got, turn.die);
    const missed = turn.card.filter((t) => !t.got);
    team.score += points;
    addToPile(missed.map(termCard));
    game.history.push({
      team: game.current,
      got,
      die: turn.die,
      points,
      missed: missed.map((t) => t.term),
      seen: turn.card.length,
    });

    if (team.score >= game.target) return showWinner(team);

    game.current = (game.current + 1) % game.teams.length;
    saveGame();
    showHandoff();
  });

  // ------------------------------------------------------------------ winner

  function burst(ink, label) {
    const NS = "http://www.w3.org/2000/svg";
    const root = document.createElementNS(NS, "svg");
    root.setAttribute("width", "44");
    root.setAttribute("height", "44");
    root.setAttribute("viewBox", "0 0 44 44");
    root.setAttribute("aria-hidden", "true");
    const shape = document.createElementNS(NS, "polygon");
    shape.setAttribute("points", BURST);
    shape.setAttribute("fill", ink.bg);
    const text = document.createElementNS(NS, "text");
    for (const [k, v] of Object.entries({ x: "22", y: "27", "text-anchor": "middle", "font-family": "Space Mono, monospace",
      "font-weight": "700", "font-size": "13", fill: ink.fg })) text.setAttribute(k, v);
    text.textContent = label;
    root.append(shape, text);
    return root;
  }

  function awardList(list, awards) {
    list.replaceChildren(...awards.map((a, i) =>
      el("li", {},
        burst(AWARD_INKS[i % AWARD_INKS.length], a.badge),
        el("span", { class: "a-text" },
          el("span", { class: "mini", text: a.label }),
          el("span", { class: "a-value", text: a.value })))));
  }

  function computeAwards() {
    const h = game.history;
    const name = (i) => game.teams[i].name;
    const awards = [];

    let best = null;
    h.forEach((t, i) => { if (!best || t.points > best.points) best = { ...t, n: i + 1 }; });
    if (best) awards.push({ label: "Best turn", value: `${name(best.team)}, turn ${best.n} (+${best.points})`, badge: `+${best.points}` });

    const counts = new Map();
    h.flatMap((t) => t.missed).forEach((term) => counts.set(term, (counts.get(term) || 0) + 1));
    if (counts.size) {
      const top = Math.max(...counts.values());
      const worst = [...counts].filter(([, c]) => c === top).map(([term]) => term);
      const term = worst[rand(worst.length)];
      awards.push({ label: "Revise this tonight", value: top > 1 ? `${term} (missed ${top} times)` : term, badge: "?" });
    } else {
      awards.push({ label: "Clean sheet", value: "Not one term missed all game", badge: "0" });
    }

    const lost = game.teams.map(() => 0);
    h.forEach((t) => { if (typeof t.die === "number") lost[t.team] += Math.min(t.die, t.got); });
    const unluckiest = lost.indexOf(Math.max(...lost));
    if (lost[unluckiest] > 0) {
      awards.push({ label: "Worst luck with the die", value: `${name(unluckiest)} (lost ${lost[unluckiest]})`, badge: `−${lost[unluckiest]}` });
    }

    const mimes = h.filter((t) => t.die === "mime");
    if (mimes.length) {
      const m = mimes.reduce((a, b) => (b.got > a.got ? b : a));
      awards.push({ label: "Best mime", value: `${name(m.team)} (${m.got} in silence)`, badge: String(m.got) });
    }
    return awards;
  }

  function pileNote(node) {
    const n = pile().length;
    node.textContent = n ? `${plural(n, "term")} on your revision pile. Open Flashcards from the cover to go through them.` : "";
  }

  function showWinner(team) {
    store.remove(KEYS.game);
    const h = game.history;
    $("#final-meta").textContent = `${plural(h.length, "turn")} · ${h.reduce((n, t) => n + (t.seen || CARD_SIZE), 0)} terms`;
    setPlates($("#winner-name"), team.name);
    awardList($("#awards"), computeAwards());

    const ranked = game.teams.slice().sort((a, b) => b.score - a.score);
    $("#final-scores").replaceChildren(...ranked.map((t, i) =>
      el("li", {}, el("span", { text: `${i + 1}. ${t.name}` }), el("span", { text: String(t.score) }))));
    pileNote($("#winner-pile"));

    show("winner");
    fanfare();
  }

  $("#rematch").addEventListener("click", () => {
    // Carry on through the same deck so a rematch doesn't repeat terms straight away.
    const { teams, target, seconds, chaos, deck } = game;
    startGame({ names: teams.map((t) => t.name), target, seconds, chaos }, deck);
  });

  $("#new-game").addEventListener("click", () => {
    const { teams, target, seconds, chaos } = game;
    game = null;
    initSetup({ names: teams.map((t) => t.name), target, seconds, chaos });
    show("setup");
  });

  // ------------------------------------------------------------------ the quiz
  //
  // Pass-the-phone single best answer. Each turn a team spins for a
  // category, then answers one question against the clock: 500 for a right
  // answer, up to 500 more for speed, and a streak bonus on top. The last
  // round is worth double.

  const QUIZ_KINDS = {
    vignette: { wheel: "Spot diagnosis", title: "Spot diagnosis" },
    test: { wheel: "Investigations", title: "Investigations" },
    manage: { wheel: "Management", title: "What next?" },
    pharm: { wheel: "Pharmacology", title: "Pharmacology" },
    mech: { wheel: "Mechanisms", title: "How it works" },
    numbers: { wheel: "Numbers", title: "Numbers & cut-offs" },
    classic: { wheel: "Classics", title: "Classic signs" },
  };

  // How long the wheel ticks between each highlight: twice round, slowing
  // down, then the landing.
  const SPIN_MS = 1800;
  function spinTicks(kinds, landed) {
    const steps = kinds.length * 2 + Math.max(0, kinds.indexOf(landed));
    const weights = Array.from({ length: steps }, (_, i) => 1.12 ** i);
    const total = weights.reduce((sum, w) => sum + w, 0) || 1;
    return weights.map((w) => (w / total) * SPIN_MS);
  }

  // Picks the category a spin lands on. One that came up lately is far less
  // likely, so the wheel moves round the categories.
  function pickKind(kinds, recent = []) {
    const weight = (k) => {
      const last = recent.lastIndexOf(k);
      if (last < 0) return 1;
      const ago = recent.length - last;
      return Math.min(1, ago / kinds.length) ** 2;
    };
    let roll = Math.random() * kinds.reduce((sum, k) => sum + weight(k), 0);
    for (const k of kinds) {
      roll -= weight(k);
      if (roll < 0) return k;
    }
    return kinds[kinds.length - 1];
  }
  const QUIZ_LIMITS = { rounds: [1, 30], seconds: [10, 90] };
  const SCORE = { right: 500, speed: 500, streakStep: 100, streakMax: 500 };
  // Kahoot's four answer colours and shapes.
  const TILES = [
    { shape: "▲", bg: "#E2553E", fg: "#FFFFFF" },
    { shape: "◆", bg: "#1D5FA8", fg: "#FFFFFF" },
    { shape: "●", bg: "#FFD84D", fg: "#1D2B53" },
    { shape: "■", bg: "#0E8C83", fg: "#FFFFFF" },
  ];

  const QUIZ_ALL = [];  // [{ key, kind, pack, topic, prompt, options, answer, why, level }]
  for (const p of ALL_PACKS) {
    (Array.isArray(p.quiz) ? p.quiz : []).forEach((r, i) => {
      if (!r || !QUIZ_KINDS[r.kind] || typeof r.prompt !== "string" || !r.prompt.trim()) return;
      const options = Array.isArray(r.options) ? r.options.map((o) => String(o ?? "").trim()) : [];
      if (options.length !== 4 || options.some((o) => !o)) return;
      const answer = options.indexOf(String(r.answer ?? "").trim());
      if (answer < 0) return;
      QUIZ_ALL.push({
        key: `${p.id}:${i}:${dupKey(r.prompt).slice(0, 24)}`,
        kind: r.kind, pack: p.id, topic: p.topics[r.topic] ? r.topic : Object.keys(p.topics)[0],
        prompt: r.prompt.trim(), options, answer,
        why: typeof r.why === "string" ? r.why.trim() : "",
        level: clampInt(r.level, 1, 3, 2),
      });
    });
  }
  const quizBank = () => QUIZ_ALL.filter(inFocus);

  let QUIZ_BANK = [];          // the questions in play for this quiz
  let quizSetup = null;        // { names, rounds, seconds }
  let quiz = null;             // { teams, rounds, seconds, round, current, used, history, keys }
  let qturn = null;            // { key, kind, hidden, chosen, ms, points, parts }
  let quizTimer = null;

  const findQuestion = (key) => QUIZ_ALL.find((q) => q.key === key);
  const quizTeam = () => quiz.teams[quiz.current];
  const isFinalRound = () => quiz.round === quiz.rounds;
  const solo = () => quiz.teams.length === 1;

  function saveQuiz() { store.set(KEYS.quizGame, quiz); }

  function loadQuiz() {
    const data = store.get(KEYS.quizGame, null);
    if (!data || !Array.isArray(data.teams) || data.teams.length < 1) return null;
    if (!Array.isArray(data.used)) data.used = [];
    if (!Array.isArray(data.history)) data.history = [];
    if (!Array.isArray(data.keys)) data.keys = quizBank().map((q) => q.key);
    data.current = clampInt(data.current, 0, data.teams.length - 1, 0);
    return data;
  }

  function useQuizBank(keys) {
    const set = new Set(keys);
    QUIZ_BANK = QUIZ_ALL.filter((q) => set.has(q.key));
  }

  // ---- setup

  function openQuiz() {
    const prefs = store.get(KEYS.quizPrefs, {}) || {};
    const gamePrefs = store.get(KEYS.prefs, {}) || {};
    const names = [prefs.names, gamePrefs.names].find((n) => Array.isArray(n) && n.length >= 1);
    quizSetup = {
      names: (names || ["Team 1", "Team 2"]).slice(0, MAX_TEAMS),
      rounds: clampInt(prefs.rounds, ...QUIZ_LIMITS.rounds, 5),
      seconds: clampInt(prefs.seconds, ...QUIZ_LIMITS.seconds, 30),
    };
    renderQuizTeams();
    renderQuizSettings();
    const n = quizBank().length;
    $("#quiz-info").textContent = `${plural(n, "question")} picked`;
    quizError(n ? "" : "No quiz questions in the topics you picked. Go back and add some.");
    $("#quiz-resume").hidden = !loadQuiz();
    show("quiz-setup");
  }

  function renderQuizTeams() {
    renderTeamList($("#quiz-team-list"), $("#quiz-add-team"), quizSetup.names, renderQuizTeams, 1);
  }

  function renderQuizSettings() {
    $("#rounds").textContent = quizSetup.rounds;
    $("#qseconds").textContent = quizSetup.seconds;
    for (const btn of document.querySelectorAll("[data-qsetting]")) {
      const key = btn.dataset.qsetting;
      const step = Number(btn.dataset.step);
      btn.disabled = step < 0 ? quizSetup[key] <= QUIZ_LIMITS[key][0] : quizSetup[key] >= QUIZ_LIMITS[key][1];
    }
  }

  function quizError(message) {
    $("#quiz-error").textContent = message || "";
    $("#quiz-error").hidden = !message;
  }

  document.querySelectorAll("[data-qsetting]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.qsetting;
      quizSetup[key] = clampInt(quizSetup[key] + Number(btn.dataset.step), ...QUIZ_LIMITS[key], quizSetup[key]);
      renderQuizSettings();
    });
  });

  $("#open-quiz").addEventListener("click", openQuiz);
  $("#quiz-back").addEventListener("click", () => { renderFocus(); show("setup"); });

  $("#quiz-add-team").addEventListener("click", () => {
    quizSetup.names.push(`Team ${quizSetup.names.length + 1}`);
    renderQuizTeams();
    const input = $("#quiz-team-list li:last-child input");
    input.focus();
    input.select();
  });

  $("#quiz-start").addEventListener("click", () => {
    const names = quizSetup.names.map((n, i) => n.trim() || `Team ${i + 1}`);
    const lower = names.map((n) => n.toLowerCase());
    if (new Set(lower).size !== lower.length) return quizError("Give each team a different name.");
    if (!quizBank().length) return quizError("No quiz questions in the topics you picked. Go back and add some.");
    quizError("");
    store.set(KEYS.quizPrefs, { names, rounds: quizSetup.rounds, seconds: quizSetup.seconds });
    unlockAudio();
    startQuiz({ names, rounds: quizSetup.rounds, seconds: quizSetup.seconds });
  });

  $("#quiz-resume").addEventListener("click", () => {
    quiz = loadQuiz();
    if (!quiz) return openQuiz();
    useQuizBank(quiz.keys);
    showQuizTurn();
  });

  function startQuiz({ names, rounds, seconds }) {
    quiz = {
      teams: names.map((name, i) => ({
        name, ink: i % TEAM_INKS.length, score: 0, streak: 0, best: 0, right: 0, wrong: 0, fifty: true,
      })),
      rounds,
      seconds,
      round: 1,
      current: 0,
      used: [],
      history: [],
      keys: quizBank().map((q) => q.key),
    };
    useQuizBank(quiz.keys);
    saveQuiz();
    showQuizTurn();
  }

  // ---- scoreboard

  function renderQuizStandings(container, highlight) {
    const top = Math.max(1, ...quiz.teams.map((t) => t.score));
    container.replaceChildren(...quiz.teams.map((t, i) => {
      const ink = TEAM_INKS[t.ink];
      return el("div", { class: "team-row" + (i === highlight ? " current" : "") },
        el("div", { class: "team-head" },
          el("span", { class: "chip", "aria-hidden": "true", style: { background: ink.bg, color: ink.fg }, text: LETTERS[i] }),
          el("span", { class: "team-name" }, el("span", { text: t.name })),
          t.streak > 1 ? el("span", { class: "mini streak", text: `🔥${t.streak}` }) : null,
          el("span", { class: "team-score", text: t.score.toLocaleString("en") })),
        el("div", { class: "bar", "aria-hidden": "true" },
          el("i", { style: { width: `${(t.score / top) * 100}%`, background: ink.bg } })));
    }));
  }

  // ---- the spin

  // Questions this phone has already asked, oldest first, so a new quiz
  // reaches for fresh ones before it repeats.
  function seenKeys() {
    const list = store.get(KEYS.quizSeen, []);
    return Array.isArray(list) ? list : [];
  }

  function markSeen(key) {
    const list = seenKeys().filter((k) => k !== key);
    list.push(key);
    store.set(KEYS.quizSeen, list.slice(-Math.max(50, QUIZ_ALL.length - 10)));
  }

  function openKinds() {
    const used = new Set(quiz.used);
    const kinds = new Set(QUIZ_BANK.filter((q) => !used.has(q.key)).map((q) => q.kind));
    return Object.keys(QUIZ_KINDS).filter((k) => kinds.has(k));
  }

  // The difficulty to aim for: core questions early, deep cuts late.
  const wantedLevel = (round, rounds) => (rounds < 2 ? 2 : 1 + Math.round((2 * (round - 1)) / (rounds - 1)));

  // A question of this kind that this quiz hasn't used yet: ones this device
  // has never asked first, then the ones it asked longest ago, and among
  // those the closest to the wanted difficulty.
  function pickQuestion(kind) {
    const skip = new Set(quiz.used);
    const seen = new Map(seenKeys().map((k, i) => [k, i + 1]));
    const wanted = wantedLevel(quiz.round, quiz.rounds);
    const pool = shuffle(QUIZ_BANK.filter((q) => q.kind === kind && !skip.has(q.key)));
    pool.sort((a, b) => (seen.get(a.key) || 0) - (seen.get(b.key) || 0)
      || Math.abs(a.level - wanted) - Math.abs(b.level - wanted));
    return pool[0] || null;
  }

  function showQuizTurn() {
    qturn = null;
    const team = quizTeam();
    $("#qt-round").textContent = solo() ? `Question ${quiz.round} of ${quiz.rounds}` : `Round ${quiz.round} of ${quiz.rounds}`;
    $("#qt-left").textContent = `${QUIZ_BANK.length - quiz.used.length} questions left`;
    renderQuizStandings($("#quiz-standings"), quiz.current);
    setPlates($("#qt-team"), team.name);
    $("#qt-double").hidden = !isFinalRound();
    $("#qt-double").textContent = solo() ? "Last question · double points" : "Final round · double points";
    if (!openKinds().length) quiz.used = []; // ran out: let the questions come round again
    renderWheel(openKinds(), null);
    $("#spin").hidden = false;
    $("#spin").disabled = false;
    $("#ask-wrap").hidden = true;
    show("quiz-turn");
  }

  function renderWheel(kinds, lit) {
    $("#wheel").replaceChildren(...kinds.map((k) =>
      el("li", { class: k === lit ? "lit" : "", text: QUIZ_KINDS[k].wheel })));
  }

  $("#spin").addEventListener("click", () => {
    unlockAudio();
    const kinds = openKinds();
    const landed = pickKind(kinds, quiz.history.map((h) => h.kind));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ticks = reduceMotion ? [] : spinTicks(kinds, landed);
    let at = 0;
    $("#spin").disabled = true;
    const step = () => {
      if (at < ticks.length) {
        renderWheel(kinds, kinds[at % kinds.length]);
        beep(500 + (at % 2) * 120, 0.025, 0.07);
        return setTimeout(step, ticks[at++]);
      }
      renderWheel(kinds, landed);
      haptic(30);
      const q = pickQuestion(landed);
      qturn = { key: q.key, kind: landed, hidden: [], chosen: null, ms: 0, points: 0, parts: [] };
      $("#spin").hidden = true;
      $("#ask-wrap").hidden = false;
      $("#ask").focus();
    };
    step();
  });

  $("#quiz-quit").addEventListener("click", () => {
    if (!window.confirm("End this quiz? The scores will be lost.")) return;
    store.remove(KEYS.quizGame);
    quiz = null;
    openQuiz();
  });

  // ---- the question

  function tileButton(q, i, onPick) {
    const tile = TILES[i];
    const btn = el("button", { type: "button", class: "tile", style: { background: tile.bg, color: tile.fg } },
      el("span", { class: "shape", "aria-hidden": "true", text: tile.shape }),
      el("span", { class: "opt", text: q.options[i] }));
    if (onPick) btn.addEventListener("click", () => onPick(i));
    return btn;
  }

  function renderTiles(q) {
    $("#tiles").replaceChildren(...q.options.map((_, i) => {
      const btn = tileButton(q, i, answer);
      if (qturn.hidden.includes(i)) {
        btn.disabled = true;
        btn.classList.add("out");
      }
      return el("li", {}, btn);
    }));
  }

  $("#ask").addEventListener("click", () => {
    const q = findQuestion(qturn.key);
    if (!q) return showQuizTurn();
    quiz.used.push(q.key);
    markSeen(q.key);
    saveQuiz(); // a refresh mid-question spins a fresh one rather than replaying this

    const team = quizTeam();
    $("#qq-team").textContent = team.name;
    $("#qq-kind").textContent = QUIZ_KINDS[q.kind].title;
    $("#qq-topic").textContent = `${PACK.get(q.pack).name} · ${topicName(q.pack, q.topic)} · ${"●".repeat(q.level)}`;
    $("#qq-prompt").textContent = q.prompt;
    $("#qq-prompt").classList.toggle("long", q.prompt.length > 120);
    $("#qq-worth").textContent = isFinalRound() ? "Double points" : "";
    $("#qq-streak").textContent = team.streak ? `Streak ${team.streak} 🔥` : "";
    $("#fifty").hidden = !team.fifty;
    $("#fifty").disabled = false;
    renderTiles(q);
    show("quiz-q");
    keepScreenOn(true);
    startQuizTimer();
  });

  function useFifty() {
    const q = findQuestion(qturn.key);
    const team = quizTeam();
    if (!q || !team.fifty || qturn.chosen !== null) return;
    team.fifty = false;
    const wrong = shuffle([0, 1, 2, 3].filter((i) => i !== q.answer));
    qturn.hidden = wrong.slice(0, 2);
    $("#fifty").disabled = true;
    haptic(20);
    renderTiles(q);
  }
  $("#fifty").addEventListener("click", useFifty);

  function startQuizTimer() {
    const total = quiz.seconds * 1000;
    const startedAt = Date.now();
    const clock = $("#q-clock");
    let lastWhole = null;
    qturn.total = total;
    qturn.startedAt = startedAt;

    const tick = () => {
      const left = Math.max(0, total - (Date.now() - startedAt));
      const whole = Math.ceil(left / 1000);
      if (whole !== lastWhole) {
        setPlates(clock, String(whole));
        $("#q-clock-sr").textContent = `${whole} seconds left`;
        tabClock(whole, quizTeam().name);
        $("#quiz-q").classList.toggle("urgent", whole <= 5);
        if (lastWhole !== null && whole > 0 && whole <= 5) beep(880, 0.06, 0.12);
        lastWhole = whole;
      }
      $("#q-fuse").style.width = `${(left / total) * 100}%`;
      if (left <= 0) answer(null);
    };
    clearInterval(quizTimer);
    tick();
    quizTimer = setInterval(tick, 100);
  }

  function stopQuizTimer() {
    clearInterval(quizTimer);
    quizTimer = null;
    keepScreenOn(false);
    $("#quiz-q").classList.remove("urgent");
  }

  // Kahoot-style: 500 for being right, up to 500 more for speed, then the
  // streak bonus, and the whole lot doubles in the final round.
  function scoreAnswer(team, correct, ms) {
    if (!correct) return { points: 0, parts: [] };
    const speed = Math.round(SCORE.speed * Math.max(0, 1 - ms / (quiz.seconds * 1000)));
    const streak = Math.min(SCORE.streakMax, SCORE.streakStep * (team.streak - 1));
    const parts = [["Right answer", SCORE.right], [`Speed (${(ms / 1000).toFixed(1)}s)`, speed]];
    if (streak > 0) parts.push([`Streak ×${team.streak}`, streak]);
    let points = SCORE.right + speed + streak;
    if (isFinalRound()) {
      parts.push(["Final round", "×2"]);
      points *= 2;
    }
    return { points, parts };
  }

  function answer(choice) {
    if (!qturn || qturn.chosen !== null || !quizTimer) return;
    const ms = Math.min(qturn.total, Date.now() - qturn.startedAt);
    stopQuizTimer();
    const q = findQuestion(qturn.key);
    const team = quizTeam();
    const correct = choice === q.answer;
    qturn.chosen = choice === null ? -1 : choice;
    qturn.ms = ms;
    qturn.lostStreak = correct ? 0 : team.streak;

    if (correct) {
      team.right++;
      team.streak++;
      team.best = Math.max(team.best, team.streak);
    } else {
      team.wrong++;
      team.streak = 0;
      addToPile([{ id: `q:${q.key}`, front: q.prompt, back: `${q.options[q.answer]}. ${q.why}`.trim(),
        sub: `${QUIZ_KINDS[q.kind].title} · ${topicName(q.pack, q.topic)}` }]);
    }
    const { points, parts } = scoreAnswer(team, correct, ms);
    team.score += points;
    qturn.points = points;
    qturn.parts = parts;
    quiz.history.push({ team: quiz.current, round: quiz.round, key: q.key, kind: q.kind, correct, timeUp: choice === null, ms, points });
    saveQuiz();

    if (correct) {
      beep(660, 0.1, 0.15);
      setTimeout(() => beep(990, 0.18, 0.15), 110);
      haptic(30);
    } else {
      beep(200, 0.4, 0.2);
      haptic([120, 60, 120]);
    }
    renderReveal(q, correct, choice === null);
    show("quiz-reveal");
  }

  // ---- the reveal

  function renderReveal(q, correct, timeUp) {
    const team = quizTeam();
    $("#qr-team").textContent = team.name;
    $("#qr-round").textContent = solo() ? `Question ${quiz.round} of ${quiz.rounds}` : `Round ${quiz.round} of ${quiz.rounds}`;
    $("#qr-title").textContent = correct ? "Correct" : timeUp ? "Time's up" : "Wrong";
    $("#qr-title").classList.toggle("wrong", !correct);
    $("#qr-prompt").textContent = q.prompt;
    $("#qr-tiles").replaceChildren(...q.options.map((_, i) => {
      const btn = tileButton(q, i, null);
      btn.disabled = true;
      if (i === q.answer) btn.classList.add("right");
      else btn.classList.add("out");
      if (i === qturn.chosen) btn.append(el("span", { class: "pick mini", text: i === q.answer ? "Your answer ✓" : "Your answer" }));
      return el("li", {}, btn);
    }));

    const line = (left, right, cls = "") => el("div", { class: "r-line " + cls }, el("span", { text: left }), right);
    const rule = (cls = "") => el("div", { class: `r-rule ${cls}`, "aria-hidden": "true" });
    $("#q-receipt").replaceChildren(...[
      el("div", { class: "r-head", text: "RESULTS · THE QUIZ" }),
      el("div", { class: "r-sub", text: `${solo() ? "Question" : "Round"} ${quiz.round} · ${team.name}` }),
      rule(),
      el("div", { class: "r-answer" }, el("span", { class: "mini", text: "The answer" }), el("b", { text: q.options[q.answer] })),
      q.why ? el("p", { class: "r-why", text: q.why }) : null,
      rule(),
      ...(correct
        ? qturn.parts.map(([k, v]) => line(k, el("span", { text: typeof v === "number" ? `+${v}` : v })))
        : [line(timeUp ? "Too slow" : "Wrong answer", el("span", { text: "0" })),
          qturn.lostStreak ? line(`Streak of ${qturn.lostStreak}`, el("span", { text: "lost" })) : null,
          line("To the revision pile", el("span", { text: "+1" }))]),
      rule("double"),
      line("This question", el("b", { text: `+${qturn.points.toLocaleString("en")}` }), "r-total"),
      line("New total", el("span", { text: team.score.toLocaleString("en") })),
    ].filter(Boolean));

    renderQuizStandings($("#qr-standings"), quiz.current);
    $("#qr-standings").hidden = solo();
    const last = quiz.current === quiz.teams.length - 1;
    $("#q-next-label").textContent = last && isFinalRound() ? (solo() ? "See your score" : "See the podium")
      : solo() ? "Next question" : last ? `On to round ${quiz.round + 1}` : "Next team";
  }

  $("#q-next").addEventListener("click", () => {
    if (quiz.current === quiz.teams.length - 1) {
      if (isFinalRound()) return showPodium();
      quiz.round++;
    }
    quiz.current = (quiz.current + 1) % quiz.teams.length;
    saveQuiz();
    showQuizTurn();
  });

  // ---- the podium

  function quizAwards() {
    const h = quiz.history;
    const name = (i) => quiz.teams[i].name;
    const awards = [];

    const fastest = h.filter((t) => t.correct).sort((a, b) => a.ms - b.ms)[0];
    if (fastest) awards.push({ label: "Fastest finger", value: `${name(fastest.team)} (${(fastest.ms / 1000).toFixed(1)}s)`, badge: "⚡" });

    const streaker = quiz.teams.reduce((a, b) => (b.best > a.best ? b : a));
    if (streaker.best > 1) awards.push({ label: "Hot streak", value: `${streaker.name} (${streaker.best} in a row)`, badge: String(streaker.best) });

    const byKind = {};
    for (const t of h) {
      const k = (byKind[t.kind] ||= { right: 0, all: 0 });
      k.all++;
      if (t.correct) k.right++;
    }
    const kinds = Object.entries(byKind).filter(([k, v]) => QUIZ_KINDS[k] && v.all > 1);
    const hardest = kinds.slice().sort((a, b) => a[1].right / a[1].all - b[1].right / b[1].all)[0];
    if (hardest && hardest[1].right < hardest[1].all) {
      awards.push({ label: "Weakest category", value: `${QUIZ_KINDS[hardest[0]].wheel} (${hardest[1].right} of ${hardest[1].all})`, badge: "✗" });
    }
    const best = kinds.slice().sort((a, b) => b[1].right / b[1].all - a[1].right / a[1].all)[0];
    if (best && best[1].right && best !== hardest) {
      awards.push({ label: "Strongest category", value: `${QUIZ_KINDS[best[0]].wheel} (${best[1].right} of ${best[1].all})`, badge: "✓" });
    }

    if (!solo()) {
      const lost = quiz.teams.slice().sort((a, b) => b.wrong - a.wrong)[0];
      if (lost && lost.wrong) awards.push({ label: "Back to the library", value: `${lost.name} (${lost.wrong} wrong)`, badge: "?" });
      const brave = quiz.teams.filter((t) => t.fifty);
      if (brave.length && brave.length < quiz.teams.length) {
        awards.push({ label: "Never needed the 50:50", value: brave.map((t) => t.name).join(", "), badge: "50" });
      }
    }
    return awards;
  }

  function showPodium() {
    store.remove(KEYS.quizGame);
    const ranked = quiz.teams.slice().sort((a, b) => b.score - a.score || b.right - a.right);
    const top = ranked[0];
    const tied = ranked.filter((t) => t.score === top.score);
    $("#qe-meta").textContent = `${plural(quiz.history.length, "question")}`;
    if (solo()) {
      setPlates($("#qe-winner"), `${top.right} / ${top.right + top.wrong}`);
      $("#qe-word").textContent = top.right === top.right + top.wrong ? "Flawless." : top.right * 2 >= top.right + top.wrong ? "Pass." : "Resit.";
    } else {
      setPlates($("#qe-winner"), tied.length > 1 ? tied.map((t) => t.name).join(" & ") : top.name);
      $("#qe-word").textContent = "Top of the year.";
    }

    // Second, first, third: the classic podium shape.
    const places = solo() ? [] : [[1, "2nd"], [0, "1st"], [2, "3rd"]].filter(([i]) => ranked[i]);
    $("#podium").hidden = solo();
    $("#podium").replaceChildren(...places.map(([i, label]) => {
      const t = ranked[i];
      const ink = TEAM_INKS[t.ink];
      return el("li", { class: `step p${i + 1}` },
        el("span", { class: "p-name", text: t.name }),
        el("span", { class: "p-score", text: t.score.toLocaleString("en") }),
        el("span", { class: "p-block", style: { background: ink.bg, color: ink.fg } }, el("span", { text: label })));
    }));

    awardList($("#q-awards"), quizAwards());
    $("#q-final").replaceChildren(...ranked.map((t, i) =>
      el("li", {}, el("span", { text: `${solo() ? "" : `${i + 1}. `}${t.name} · ${t.right}/${t.right + t.wrong} right` }), el("span", { text: t.score.toLocaleString("en") }))));
    const n = pile().length;
    $("#quiz-pile").textContent = n ? `${plural(n, "card")} on your revision pile, with the explanations. Open Flashcards from the cover to go through them.` : "";

    show("quiz-end");
    fanfare();
  }

  $("#q-rematch").addEventListener("click", () => {
    const { teams, rounds, seconds } = quiz;
    startQuiz({ names: teams.map((t) => t.name), rounds, seconds });
  });

  $("#q-home").addEventListener("click", () => {
    quiz = null;
    initSetup();
    show("setup");
  });

  // ------------------------------------------------------------------ revise
  //
  // Two tabs: the revision pile (what you've missed, with the facts) and a
  // study guide of every term in the subjects you picked, topic by topic.

  let reviseTab = "pile";

  function openRevise(tab) {
    if (tab) reviseTab = tab;
    renderRevise();
    show("revise");
  }

  function renderRevise() {
    const list = pile();
    $("#revise-info").textContent = `${plural(list.length, "card")} on the pile`;
    $("#revise-tabs").replaceChildren(...[["pile", `Revision pile (${list.length})`], ["guide", "Study guide"]].map(([id, label]) =>
      chip(label, id === reviseTab, () => { reviseTab = id; renderRevise(); })));
    $("#revise-body").replaceChildren(...(reviseTab === "pile" ? revisePile(list) : studyGuide()));
  }

  function revisePile(list) {
    if (!list.length) {
      return [el("p", { class: "small", text: "Nothing on the pile. Terms your team misses in 30 Seconds, and quiz questions you get wrong, land here with the fact to remember." })];
    }
    const drill = el("div", { class: "cta" }, el("button", { type: "button", class: "btn btn-primary" },
      el("span", { text: `Flashcards · ${plural(list.length, "card")}` }), svg('<svg aria-hidden="true" width="30" height="20" viewBox="0 0 30 20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="M2 10h24M18 2l8 8-8 8"/></svg>')));
    drill.querySelector("button").addEventListener("click", () => startCards(pile(), true, "revise"));
    const items = list.slice().sort((a, b) => (b.misses || 1) - (a.misses || 1) || b.at - a.at).map((p) => {
      const remove = el("button", { type: "button", class: "x", "aria-label": `Take ${p.front} off the pile`, text: "×" });
      remove.addEventListener("click", () => { removeFromPile(p.id); renderRevise(); });
      return el("li", {},
        el("span", { class: "tw" },
          el("span", { class: "t", text: p.front }),
          p.back ? el("span", { class: "why", text: p.back }) : null,
          el("span", { class: "where", text: [p.sub, p.misses > 1 ? `missed ${p.misses}×` : ""].filter(Boolean).join(" · ") })),
        remove);
    });
    const clear = el("button", { type: "button", class: "link-btn center", text: "Clear the pile" });
    clear.addEventListener("click", () => {
      if (!window.confirm("Clear the whole revision pile?")) return;
      store.set(KEYS.pile, []);
      renderRevise();
    });
    return [drill, el("ul", { class: "mine-list pile-list" }, ...items), clear];
  }

  function studyGuide() {
    const out = [el("p", { class: "small", text: "Every term in the subjects you picked on the cover, topic by topic, with its fact." })];
    for (const id of focus.packs) {
      const p = PACK.get(id);
      out.push(el("h2", { class: "label guide-pack" }, el("span", { class: "num", text: p.name })));
      for (const [key, name] of Object.entries(p.topics)) {
        const terms = BANK_TERMS.filter((t) => t.pack === id && t.topic === key).sort((a, b) => a.level - b.level);
        if (!terms.length) continue;
        out.push(el("details", { class: "dossier" },
          el("summary", {}, el("span", { class: "d-name" },
            el("span", { class: "d-title", text: name }),
            el("span", { class: "d-aka", text: `${plural(terms.length, "term")} · ${plural(QUIZ_ALL.filter((q) => q.pack === id && q.topic === key).length, "question")}` }))),
          el("ul", { class: "mine-list guide-list" }, ...terms.map((t) => el("li", {},
            el("span", { class: "tw" },
              el("span", { class: "t", text: t.term }),
              el("span", { class: "why", text: t.why }),
              el("span", { class: "where", text: `${CATS[t.cat]} · ${"●".repeat(t.level)}` })))))));
      }
    }
    return out;
  }

  $("#open-revise").addEventListener("click", () => openRevise());
  $("#revise-back").addEventListener("click", () => { renderFocus(); show("setup"); });

  // ------------------------------------------------------------------ flashcards
  //
  // Front: the term (or the question). Say the answer out loud, then show
  // it. "Knew it" takes a pile card off the pile; "Not yet" sends it to the
  // back of the stack.

  let cards = null; // { queue, total, knew, fromPile, back }

  function startCards(items, fromPile, back) {
    if (!items.length) return toast("Nothing to go through yet.");
    cards = { queue: shuffle(items.slice()), total: items.length, knew: 0, fromPile, back };
    show("cards");
    renderFlash();
  }

  function renderFlash() {
    const card = cards.queue[0];
    const done = cards.total - cards.queue.length;
    $("#cards-count").textContent = `${done} / ${cards.total} · ${cards.knew} known`;
    $("#cards-fuse").style.width = `${(done / cards.total) * 100}%`;
    if (!card) {
      $("#flash-sub").textContent = "Done";
      $("#flash-front").textContent = cards.fromPile
        ? (pile().length ? `${plural(pile().length, "card")} still on the pile.` : "The pile's empty. Nice.")
        : `${cards.knew} of ${cards.total} first time.`;
      $("#flash-back").hidden = true;
      $("#flash-show-wrap").hidden = true;
      $("#flash-rate").hidden = true;
      $("#flash-hint").textContent = "Tap Done to head back.";
      fanfare();
      return;
    }
    $("#flash-sub").textContent = card.sub || "";
    $("#flash-front").textContent = card.front;
    $("#flash-front").classList.toggle("long", card.front.length > 60);
    $("#flash-back").hidden = true;
    $("#flash-back").textContent = card.back || "No fact saved for this one.";
    $("#flash-show-wrap").hidden = false;
    $("#flash-rate").hidden = true;
    $("#flash-hint").textContent = "Say it out loud first: what's the one thing to remember?";
  }

  function flipFlash() {
    if (!cards || !cards.queue.length) return;
    $("#flash-back").hidden = false;
    $("#flash-show-wrap").hidden = true;
    $("#flash-rate").hidden = false;
    $("#flash-hint").textContent = "Be honest.";
  }

  function rateFlash(knew) {
    if (!cards || !cards.queue.length || $("#flash-rate").hidden) return;
    const card = cards.queue.shift();
    if (knew) {
      cards.knew++;
      if (cards.fromPile) removeFromPile(card.id);
      haptic(15);
    } else {
      cards.queue.push(card);
      cards.total++;
      if (!cards.fromPile) addToPile([card]);
    }
    renderFlash();
  }

  $("#flash-show").addEventListener("click", flipFlash);
  $("#flash").addEventListener("click", flipFlash);
  $("#flash-knew").addEventListener("click", () => rateFlash(true));
  $("#flash-again").addEventListener("click", () => rateFlash(false));
  $("#cards-back").addEventListener("click", () => {
    const back = cards && cards.back;
    cards = null;
    if (back === "revise") return openRevise();
    renderFocus();
    show("setup");
  });

  // From the cover: the pile first if there is one, otherwise the terms
  // in the topics you picked.
  $("#open-cards").addEventListener("click", () => {
    const list = pile();
    startCards(list.length ? list : allTerms().map(termCard), !!list.length);
  });

  // ------------------------------------------------------------------ keyboard

  // On a PC: 1–5 mark terms and N deals the next card; 1–4 or A–D answer a
  // quiz question and F is the 50:50; Space flips a flashcard, K / J rate it.
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
    const screen = document.body.dataset.screen;
    const key = e.key.toLowerCase();
    if (screen === "play" && timerId) {
      if (/^[1-5]$/.test(key) && termSetters[key - 1]) { e.preventDefault(); termSetters[key - 1](); }
      else if (key === "n" && !$("#next-card-wrap").hidden) $("#next-card").click();
    } else if (screen === "quiz-q" && quizTimer) {
      const i = "1234".indexOf(key) >= 0 ? "1234".indexOf(key) : "abcd".indexOf(key);
      if (i >= 0 && !qturn.hidden.includes(i)) { e.preventDefault(); answer(i); }
      else if (key === "f") useFifty();
    } else if (screen === "cards") {
      if (key === " " || key === "enter") { e.preventDefault(); $("#flash-rate").hidden ? flipFlash() : rateFlash(true); }
      else if (key === "k") rateFlash(true);
      else if (key === "j") rateFlash(false);
    }
  });

  // Don't lose a turn to an accidental refresh or back-swipe.
  window.addEventListener("beforeunload", (e) => {
    if (timerId || quizTimer) e.preventDefault();
  });

  $("#open-deck").addEventListener("click", openDeck);

  loadFocus();
  initSetup();
  if (!checkIncoming()) show("setup");
})();
