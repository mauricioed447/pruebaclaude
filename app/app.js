"use strict";

/* ---------- Persistence ---------- */

const STORAGE_KEY = "mentactiva-scores-v1";

function loadScores() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveScores(scores) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  } catch (e) {
    /* storage unavailable, ignore */
  }
}

const scores = loadScores();
scores.total = scores.total || 0;

function addPoints(n) {
  scores.total += n;
  saveScores(scores);
  renderTotalScore();
}

function setBest(key, value, higherIsBetter = true) {
  const current = scores[key];
  if (current === undefined || (higherIsBetter ? value > current : value < current)) {
    scores[key] = value;
    saveScores(scores);
  }
}

function renderTotalScore() {
  document.getElementById("total-score").textContent = scores.total;
}

/* ---------- View routing ---------- */

const views = document.querySelectorAll(".view");
function showView(id) {
  views.forEach((v) => v.classList.toggle("active", v.id === id));
}

document.querySelectorAll("[data-back]").forEach((btn) => {
  btn.addEventListener("click", () => {
    stopReactionTimers();
    showView("view-menu");
  });
});

/* ---------- Result screen helper ---------- */

let lastGameRestart = null;

function showResult(title, points, detail, restartFn) {
  document.getElementById("result-title").textContent = title;
  document.getElementById("result-score").textContent = `+${points}`;
  document.getElementById("result-detail").textContent = detail;
  addPoints(points);
  lastGameRestart = restartFn;
  showView("view-result");
}

document.getElementById("result-retry").addEventListener("click", () => {
  if (lastGameRestart) lastGameRestart();
});

/* ---------- Game catalogue / menu ---------- */

const GAMES = [
  {
    id: "memory",
    icon: "🧩",
    title: "Memoria",
    desc: "Encuentra todas las parejas con el menor número de movimientos.",
    bestKey: "memory",
    bestLabel: (v) => (v ? `Mejor: ${v} mov.` : ""),
    start: () => startMemory(),
  },
  {
    id: "math",
    icon: "➗",
    title: "Cálculo Rápido",
    desc: "Resuelve 10 operaciones antes de que se acabe el tiempo.",
    bestKey: "math",
    bestLabel: (v) => (v ? `Mejor racha: ${v}` : ""),
    start: () => startMath(),
  },
  {
    id: "sequence",
    icon: "🔢",
    title: "Secuencia Lógica",
    desc: "Descubre el patrón numérico y sigue subiendo de nivel.",
    bestKey: "sequence",
    bestLabel: (v) => (v ? `Mejor nivel: ${v}` : ""),
    start: () => startSequence(),
  },
  {
    id: "word",
    icon: "🔤",
    title: "Palabras Revueltas",
    desc: "Ordena las letras para formar la palabra correcta.",
    bestKey: "word",
    bestLabel: (v) => (v ? `Mejor: ${v}/8` : ""),
    start: () => startWord(),
  },
  {
    id: "reaction",
    icon: "⚡",
    title: "Tiempo de Reacción",
    desc: "Mide qué tan rápido reaccionas ante el estímulo visual.",
    bestKey: "reaction",
    bestLabel: (v) => (v ? `Mejor: ${v} ms` : ""),
    start: () => startReaction(),
  },
];

function renderMenu() {
  const grid = document.getElementById("game-grid");
  grid.innerHTML = "";
  GAMES.forEach((g) => {
    const card = document.createElement("button");
    card.className = "game-card";
    const best = scores[g.bestKey];
    card.innerHTML = `
      <span class="game-icon">${g.icon}</span>
      <h3>${g.title}</h3>
      <p>${g.desc}</p>
      <span class="game-best">${g.bestLabel(best)}</span>
    `;
    card.addEventListener("click", g.start);
    grid.appendChild(card);
  });
}

/* ================= MEMORY GAME ================= */

const MEMORY_ICONS = ["🍎", "🚀", "🎵", "🐳", "🌟", "🍩", "🎲", "🌵", "🦉", "⚙️"];

let memoryState = null;
let memoryTimerInterval = null;

const memDiffButtons = [
  { label: "Fácil", pairs: 4 },
  { label: "Normal", pairs: 6 },
  { label: "Difícil", pairs: 8 },
];
let memDifficultyIndex = 1;

function renderMemDifficulty() {
  const wrap = document.getElementById("mem-diff");
  wrap.innerHTML = "";
  memDiffButtons.forEach((d, i) => {
    const btn = document.createElement("button");
    btn.className = "diff-btn" + (i === memDifficultyIndex ? " active" : "");
    btn.textContent = d.label;
    btn.addEventListener("click", () => {
      memDifficultyIndex = i;
      startMemory();
    });
    wrap.appendChild(btn);
  });
}

function startMemory() {
  showView("view-memory");
  renderMemDifficulty();
  const pairs = memDiffButtons[memDifficultyIndex].pairs;
  const icons = MEMORY_ICONS.slice(0, pairs);
  const deck = shuffle([...icons, ...icons]).map((icon, idx) => ({
    id: idx,
    icon,
    flipped: false,
    matched: false,
  }));

  memoryState = {
    deck,
    firstPick: null,
    secondPick: null,
    moves: 0,
    matchedCount: 0,
    lockBoard: false,
    startTime: Date.now(),
  };

  document.getElementById("mem-moves").textContent = "0";
  document.getElementById("mem-time").textContent = "0s";
  document.getElementById("mem-feedback").textContent = "";
  document.getElementById("mem-feedback").className = "feedback";
  const best = scores.memory;
  document.getElementById("mem-best").textContent = best ? `${best} mov.` : "—";

  const gridEl = document.getElementById("memory-grid");
  gridEl.style.gridTemplateColumns = pairs <= 4 ? "repeat(4, 1fr)" : pairs <= 6 ? "repeat(4, 1fr)" : "repeat(4, 1fr)";
  renderMemoryGrid();

  clearInterval(memoryTimerInterval);
  memoryTimerInterval = setInterval(() => {
    const secs = Math.floor((Date.now() - memoryState.startTime) / 1000);
    document.getElementById("mem-time").textContent = `${secs}s`;
  }, 500);
}

function renderMemoryGrid() {
  const gridEl = document.getElementById("memory-grid");
  gridEl.innerHTML = "";
  memoryState.deck.forEach((tile) => {
    const el = document.createElement("button");
    el.className =
      "memory-tile" + (tile.matched ? " matched" : "") + (tile.flipped ? " flipped" : "");
    el.textContent = tile.flipped || tile.matched ? tile.icon : "";
    el.addEventListener("click", () => flipMemoryTile(tile.id));
    gridEl.appendChild(el);
  });
}

function flipMemoryTile(id) {
  const state = memoryState;
  if (state.lockBoard) return;
  const tile = state.deck.find((t) => t.id === id);
  if (!tile || tile.flipped || tile.matched) return;

  tile.flipped = true;

  if (!state.firstPick) {
    state.firstPick = tile;
    renderMemoryGrid();
    return;
  }

  state.secondPick = tile;
  state.moves += 1;
  document.getElementById("mem-moves").textContent = state.moves;
  state.lockBoard = true;
  renderMemoryGrid();

  if (state.firstPick.icon === state.secondPick.icon) {
    state.firstPick.matched = true;
    state.secondPick.matched = true;
    state.matchedCount += 1;
    resetMemoryPicks();
    renderMemoryGrid();

    if (state.matchedCount === state.deck.length / 2) {
      clearInterval(memoryTimerInterval);
      const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
      setBest("memory", state.moves, false);
      const points = Math.max(10, 100 - state.moves * 3);
      showResult(
        "¡Memoria completada!",
        points,
        `${state.moves} movimientos en ${elapsed}s`,
        startMemory
      );
    }
  } else {
    setTimeout(() => {
      state.firstPick.flipped = false;
      state.secondPick.flipped = false;
      resetMemoryPicks();
      renderMemoryGrid();
    }, 700);
  }
}

function resetMemoryPicks() {
  memoryState.firstPick = null;
  memoryState.secondPick = null;
  memoryState.lockBoard = false;
}

/* ================= MATH GAME ================= */

let mathState = null;

function startMath() {
  showView("view-math");
  mathState = { index: 0, correct: 0, total: 10 };
  document.getElementById("math-correct").textContent = "0";
  document.getElementById("math-feedback").textContent = "";
  document.getElementById("math-feedback").className = "feedback";
  nextMathQuestion();
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateMathQuestion() {
  const ops = ["+", "-", "×"];
  const op = ops[randInt(0, ops.length - 1)];
  let a, b, answer;
  if (op === "+") {
    a = randInt(10, 90);
    b = randInt(10, 90);
    answer = a + b;
  } else if (op === "-") {
    a = randInt(20, 99);
    b = randInt(1, a);
    answer = a - b;
  } else {
    a = randInt(2, 12);
    b = randInt(2, 12);
    answer = a * b;
  }
  const options = new Set([answer]);
  while (options.size < 4) {
    const delta = randInt(-10, 10);
    const fake = answer + delta * randInt(1, 3);
    if (fake !== answer) options.add(fake);
  }
  return { text: `${a} ${op} ${b}`, answer, options: shuffle([...options]) };
}

function nextMathQuestion() {
  if (mathState.index >= mathState.total) {
    setBest("math", mathState.correct, true);
    const points = mathState.correct * 12;
    showResult(
      "¡Cálculo terminado!",
      points,
      `${mathState.correct}/${mathState.total} respuestas correctas`,
      startMath
    );
    return;
  }
  mathState.current = generateMathQuestion();
  mathState.index += 1;
  document.getElementById("math-count").textContent = mathState.index;
  document.getElementById("math-progress").style.width = `${(mathState.index / mathState.total) * 100}%`;
  document.getElementById("math-question").textContent = mathState.current.text;
  document.getElementById("math-feedback").textContent = "";

  const optsEl = document.getElementById("math-options");
  optsEl.innerHTML = "";
  mathState.current.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = opt;
    btn.addEventListener("click", () => answerMath(btn, opt));
    optsEl.appendChild(btn);
  });
}

function answerMath(btn, chosen) {
  const { answer } = mathState.current;
  const optsEl = document.getElementById("math-options");
  [...optsEl.children].forEach((b) => (b.disabled = true));
  const feedback = document.getElementById("math-feedback");

  if (chosen === answer) {
    btn.classList.add("correct");
    mathState.correct += 1;
    document.getElementById("math-correct").textContent = mathState.correct;
    feedback.textContent = "¡Correcto!";
    feedback.className = "feedback good";
  } else {
    btn.classList.add("wrong");
    feedback.textContent = `Incorrecto. Era ${answer}.`;
    feedback.className = "feedback bad";
  }

  setTimeout(nextMathQuestion, 550);
}

/* ================= SEQUENCE GAME ================= */

let seqState = null;

function generateSequence(level) {
  const type = randInt(0, 2);
  const start = randInt(1, 10);
  let step = randInt(2, 4 + Math.floor(level / 2));
  let seq = [];
  let next;

  if (type === 0) {
    // arithmetic
    seq = [0, 1, 2, 3].map((i) => start + i * step);
    next = start + 4 * step;
  } else if (type === 1) {
    // geometric-ish (multiply)
    const mult = randInt(2, 3);
    let v = randInt(1, 4);
    seq = [];
    for (let i = 0; i < 4; i++) {
      seq.push(v);
      v *= mult;
    }
    next = v;
  } else {
    // fibonacci-like
    let a = randInt(1, 5);
    let b = randInt(1, 5);
    seq = [a, b];
    for (let i = 0; i < 2; i++) {
      const c = a + b;
      seq.push(c);
      a = b;
      b = c;
    }
    next = a + b;
  }

  const options = new Set([next]);
  while (options.size < 4) {
    const fake = next + randInt(-5, 5) * randInt(1, 2 + level);
    if (fake !== next) options.add(fake);
  }
  return { seq, next, options: shuffle([...options]) };
}

function startSequence() {
  showView("view-sequence");
  seqState = { level: 1 };
  document.getElementById("seq-best").textContent = scores.sequence || 0;
  document.getElementById("seq-feedback").textContent = "";
  nextSequenceRound();
}

function nextSequenceRound() {
  document.getElementById("seq-level").textContent = seqState.level;
  seqState.current = generateSequence(seqState.level);

  const displayEl = document.getElementById("seq-display");
  displayEl.innerHTML = "";
  seqState.current.seq.forEach((n) => {
    const chip = document.createElement("span");
    chip.className = "sequence-chip";
    chip.textContent = n;
    displayEl.appendChild(chip);
  });
  const qChip = document.createElement("span");
  qChip.className = "sequence-chip";
  qChip.textContent = "?";
  displayEl.appendChild(qChip);

  const optsEl = document.getElementById("seq-options");
  optsEl.innerHTML = "";
  seqState.current.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = opt;
    btn.addEventListener("click", () => answerSequence(btn, opt));
    optsEl.appendChild(btn);
  });
  document.getElementById("seq-feedback").textContent = "";
}

function answerSequence(btn, chosen) {
  const { next } = seqState.current;
  const optsEl = document.getElementById("seq-options");
  [...optsEl.children].forEach((b) => (b.disabled = true));
  const feedback = document.getElementById("seq-feedback");

  if (chosen === next) {
    btn.classList.add("correct");
    feedback.textContent = "¡Correcto! Subiendo de nivel...";
    feedback.className = "feedback good";
    seqState.level += 1;
    setTimeout(nextSequenceRound, 700);
  } else {
    btn.classList.add("wrong");
    feedback.textContent = `Fin del juego. La respuesta era ${next}.`;
    feedback.className = "feedback bad";
    const finalLevel = seqState.level;
    setBest("sequence", finalLevel, true);
    const points = finalLevel * 15;
    setTimeout(() => {
      showResult("Secuencia Lógica", points, `Alcanzaste el nivel ${finalLevel}`, startSequence);
    }, 900);
  }
}

/* ================= WORD GAME ================= */

const WORD_BANK = [
  { word: "MEMORIA", hint: "Capacidad de retener información" },
  { word: "CEREBRO", hint: "Órgano del pensamiento" },
  { word: "LOGICA", hint: "Razonamiento estructurado" },
  { word: "ENIGMA", hint: "Cosa difícil de entender" },
  { word: "PUZLE", hint: "Rompecabezas" },
  { word: "INGENIO", hint: "Capacidad para inventar soluciones" },
  { word: "REFLEJO", hint: "Reacción rápida e involuntaria" },
  { word: "ATENCION", hint: "Concentración en algo" },
  { word: "ESTRATEGIA", hint: "Plan para lograr un objetivo" },
  { word: "CONCENTRACION", hint: "Enfoque mental total" },
];

let wordState = null;

function scrambleWord(word) {
  let letters;
  do {
    letters = shuffle(word.split(""));
  } while (letters.join("") === word && word.length > 1);
  return letters.join("");
}

function startWord() {
  showView("view-word");
  const pool = shuffle([...WORD_BANK]).slice(0, 8);
  wordState = { pool, index: 0, correct: 0 };
  document.getElementById("word-correct").textContent = "0";
  document.getElementById("word-best").textContent = scores.word || 0;
  nextWordRound();
}

function nextWordRound() {
  if (wordState.index >= wordState.pool.length) {
    setBest("word", wordState.correct, true);
    const points = wordState.correct * 13;
    showResult(
      "¡Palabras completadas!",
      points,
      `${wordState.correct}/${wordState.pool.length} palabras acertadas`,
      startWord
    );
    return;
  }
  const entry = wordState.pool[wordState.index];
  wordState.current = entry;
  wordState.index += 1;
  document.getElementById("word-count").textContent = wordState.index;
  document.getElementById("word-hint").textContent = `Pista: ${entry.hint}`;
  document.getElementById("word-scrambled").textContent = scrambleWord(entry.word);
  document.getElementById("word-feedback").textContent = "";
  const input = document.getElementById("word-input");
  input.value = "";
  input.disabled = false;
  input.focus();
}

function submitWord() {
  if (!wordState.current) return;
  const input = document.getElementById("word-input");
  if (input.disabled) return;
  const guess = input.value.trim().toUpperCase();
  const feedback = document.getElementById("word-feedback");
  input.disabled = true;

  if (guess === wordState.current.word) {
    wordState.correct += 1;
    document.getElementById("word-correct").textContent = wordState.correct;
    feedback.textContent = "¡Correcto!";
    feedback.className = "feedback good";
  } else {
    feedback.textContent = `La palabra era: ${wordState.current.word}`;
    feedback.className = "feedback bad";
  }
  setTimeout(nextWordRound, 900);
}

document.getElementById("word-submit").addEventListener("click", submitWord);
document.getElementById("word-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitWord();
});

/* ================= REACTION GAME ================= */

let reactionState = null;
let reactionTimeout = null;

function stopReactionTimers() {
  clearTimeout(reactionTimeout);
}

function startReaction() {
  showView("view-reaction");
  reactionState = { round: 0, total: 5, times: [], phase: "idle" };
  document.getElementById("reac-avg").textContent = "—";
  document.getElementById("reac-best").textContent = scores.reaction ? `${scores.reaction} ms` : "—";
  document.getElementById("reac-feedback").textContent = "";
  setupReactionBox();
}

function setupReactionBox() {
  const box = document.getElementById("reaction-box");
  box.className = "reaction-box wait";
  box.textContent = "Haz clic para empezar la ronda";
  box.onclick = () => beginReactionRound();
  document.getElementById("reac-count").textContent = Math.min(reactionState.round + 1, reactionState.total);
}

function beginReactionRound() {
  const box = document.getElementById("reaction-box");
  box.className = "reaction-box wait";
  box.textContent = "Espera el verde...";
  box.onclick = () => {
    if (reactionState.phase === "waiting") {
      stopReactionTimers();
      box.className = "reaction-box wait";
      box.textContent = "¡Muy pronto! Haz clic para reintentar";
      reactionState.phase = "idle";
      box.onclick = () => beginReactionRound();
    }
  };
  reactionState.phase = "waiting";
  const delay = randInt(1200, 3200);
  reactionTimeout = setTimeout(() => {
    reactionState.phase = "go";
    reactionState.goTime = performance.now();
    box.className = "reaction-box go";
    box.textContent = "¡CLIC AHORA!";
    box.onclick = () => finishReactionRound();
  }, delay);
}

function finishReactionRound() {
  const elapsed = Math.round(performance.now() - reactionState.goTime);
  reactionState.times.push(elapsed);
  reactionState.round += 1;

  const feedback = document.getElementById("reac-feedback");
  feedback.textContent = `${elapsed} ms`;
  feedback.className = "feedback good";

  const avg = Math.round(reactionState.times.reduce((a, b) => a + b, 0) / reactionState.times.length);
  document.getElementById("reac-avg").textContent = `${avg} ms`;

  if (reactionState.round >= reactionState.total) {
    const best = Math.min(...reactionState.times);
    setBest("reaction", best, false);
    const points = Math.max(20, Math.round(400 - avg / 3));
    setTimeout(() => {
      showResult(
        "¡Reflejos medidos!",
        points,
        `Promedio: ${avg} ms · Mejor: ${best} ms`,
        startReaction
      );
    }, 600);
  } else {
    setTimeout(setupReactionBox, 600);
  }
}

/* ---------- Utils ---------- */

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- Init ---------- */

renderTotalScore();
renderMenu();
