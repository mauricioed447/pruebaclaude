"use strict";

/* ---------- Persistence ---------- */

const STORAGE_KEY = "mentactiva-scores-v1";
const SOUND_KEY = "mentactiva-sound-muted";

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

/* ---------- Sound engine ---------- */

const Sound = (() => {
  let ctx;
  let muted = false;
  try {
    muted = localStorage.getItem(SOUND_KEY) === "1";
  } catch (e) {
    /* ignore */
  }

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, duration, type = "sine", gainValue = 0.15, delay = 0) {
    if (muted) return;
    const c = ensureCtx();
    if (!c) return;
    try {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(gainValue, c.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + duration);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(c.currentTime + delay);
      osc.stop(c.currentTime + delay + duration + 0.02);
    } catch (e) {
      /* audio unavailable, ignore */
    }
  }

  return {
    isMuted: () => muted,
    setMuted(value) {
      muted = value;
      try {
        localStorage.setItem(SOUND_KEY, value ? "1" : "0");
      } catch (e) {
        /* ignore */
      }
    },
    click: () => tone(320, 0.08, "square", 0.07),
    flip: () => tone(440, 0.09, "triangle", 0.09),
    correct: () => {
      tone(660, 0.12, "sine", 0.14);
      tone(880, 0.16, "sine", 0.12, 0.09);
    },
    wrong: () => tone(150, 0.28, "sawtooth", 0.12),
    tick: () => tone(920, 0.045, "square", 0.04),
    timeout: () => tone(110, 0.4, "sawtooth", 0.14),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "sine", 0.13, i * 0.1)),
  };
})();

const soundBtn = document.getElementById("sound-toggle");
function renderSoundBtn() {
  soundBtn.textContent = Sound.isMuted() ? "🔇" : "🔊";
  soundBtn.title = Sound.isMuted() ? "Activar sonido" : "Silenciar sonido";
}
soundBtn.addEventListener("click", () => {
  Sound.setMuted(!Sound.isMuted());
  renderSoundBtn();
});

/* ---------- View routing ---------- */

const views = document.querySelectorAll(".view");
function showView(id) {
  views.forEach((v) => v.classList.toggle("active", v.id === id));
}

document.querySelectorAll("[data-back]").forEach((btn) => {
  btn.addEventListener("click", () => {
    stopAllTimers();
    showView("view-menu");
  });
});

function stopAllTimers() {
  stopReactionTimers();
  clearInterval(memoryTimerInterval);
  clearInterval(mathTimerInterval);
  clearInterval(seqTimerInterval);
  clearInterval(wordTimerInterval);
}

/* ---------- Result screen helper ---------- */

let lastGameRestart = null;

function showResult(title, points, detail, restartFn) {
  document.getElementById("result-title").textContent = title;
  document.getElementById("result-score").textContent = `+${points}`;
  document.getElementById("result-detail").textContent = detail;
  addPoints(points);
  Sound.win();
  lastGameRestart = restartFn;
  showView("view-result");
}

document.getElementById("result-retry").addEventListener("click", () => {
  if (lastGameRestart) lastGameRestart();
});

/* ---------- Difficulty helper ---------- */

const DIFFICULTY_LABELS = [
  { key: "easy", label: "Fácil" },
  { key: "normal", label: "Normal" },
  { key: "hard", label: "Difícil" },
];

function renderDifficultyRow(containerId, current, onSelect) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = "";
  DIFFICULTY_LABELS.forEach((d) => {
    const btn = document.createElement("button");
    btn.className = "diff-btn" + (d.key === current ? " active" : "");
    btn.textContent = d.label;
    btn.addEventListener("click", () => {
      Sound.click();
      onSelect(d.key);
    });
    wrap.appendChild(btn);
  });
}

/* ---------- Countdown timer helper ---------- */

function startCountdown({ seconds, fillEl, labelEl, onTick, onExpire }) {
  const total = seconds;
  let remaining = seconds;
  fillEl.style.width = "100%";
  fillEl.classList.remove("low");
  labelEl.textContent = `${remaining}s`;
  const intervalId = setInterval(() => {
    remaining -= 0.1;
    if (remaining <= 0) {
      clearInterval(intervalId);
      fillEl.style.width = "0%";
      labelEl.textContent = "0s";
      onExpire();
      return;
    }
    fillEl.style.width = `${(remaining / total) * 100}%`;
    if (remaining <= total * 0.25) fillEl.classList.add("low");
    const roundedNow = Math.ceil(remaining);
    if (roundedNow !== Math.ceil(remaining + 0.1)) {
      labelEl.textContent = `${roundedNow}s`;
      if (roundedNow <= 3 && onTick) onTick(roundedNow);
    }
  }, 100);
  return intervalId;
}

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
    desc: "Resuelve operaciones antes de que se acabe el tiempo.",
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
    bestLabel: (v) => (v ? `Mejor: ${v} palabras` : ""),
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
    card.addEventListener("click", () => {
      Sound.click();
      g.start();
    });
    grid.appendChild(card);
  });
}

/* ================= MEMORY GAME ================= */

const MEMORY_ICONS = ["🍎", "🚀", "🎵", "🐳", "🌟", "🍩", "🎲", "🌵", "🦉", "⚙️"];

let memoryState = null;
let memoryTimerInterval = null;

const MEMORY_PAIRS = { easy: 4, normal: 6, hard: 8 };
let memDifficulty = "normal";

function startMemory(diff) {
  if (diff) memDifficulty = diff;
  showView("view-memory");
  renderDifficultyRow("mem-diff", memDifficulty, (key) => {
    startMemory(key);
  });

  const pairs = MEMORY_PAIRS[memDifficulty];
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
  Sound.flip();

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
    Sound.correct();
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
        () => startMemory()
      );
    }
  } else {
    Sound.wrong();
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

const MATH_DIFF = {
  easy: { min: 5, max: 40, multMin: 2, multMax: 8, time: 20, questions: 8 },
  normal: { min: 10, max: 90, multMin: 2, multMax: 12, time: 15, questions: 10 },
  hard: { min: 20, max: 150, multMin: 4, multMax: 15, time: 10, questions: 12 },
};
let mathDifficulty = "normal";
let mathState = null;
let mathTimerInterval = null;

function startMath(diff) {
  if (diff) mathDifficulty = diff;
  showView("view-math");
  renderDifficultyRow("math-diff", mathDifficulty, (key) => startMath(key));

  const conf = MATH_DIFF[mathDifficulty];
  mathState = { index: 0, correct: 0, total: conf.questions };
  document.getElementById("math-total").textContent = conf.questions;
  document.getElementById("math-correct").textContent = "0";
  document.getElementById("math-feedback").textContent = "";
  document.getElementById("math-feedback").className = "feedback";
  nextMathQuestion();
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateMathQuestion() {
  const conf = MATH_DIFF[mathDifficulty];
  const ops = ["+", "-", "×"];
  const op = ops[randInt(0, ops.length - 1)];
  let a, b, answer;
  if (op === "+") {
    a = randInt(conf.min, conf.max);
    b = randInt(conf.min, conf.max);
    answer = a + b;
  } else if (op === "-") {
    a = randInt(conf.min, conf.max);
    b = randInt(1, a);
    answer = a - b;
  } else {
    a = randInt(conf.multMin, conf.multMax);
    b = randInt(conf.multMin, conf.multMax);
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
  clearInterval(mathTimerInterval);
  if (mathState.index >= mathState.total) {
    setBest("math", mathState.correct, true);
    const points = mathState.correct * 12;
    showResult(
      "¡Cálculo terminado!",
      points,
      `${mathState.correct}/${mathState.total} respuestas correctas`,
      () => startMath()
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

  const conf = MATH_DIFF[mathDifficulty];
  mathTimerInterval = startCountdown({
    seconds: conf.time,
    fillEl: document.getElementById("math-timer-fill"),
    labelEl: document.getElementById("math-timer-label"),
    onTick: () => Sound.tick(),
    onExpire: () => answerMath(null, null),
  });
}

function answerMath(btn, chosen) {
  clearInterval(mathTimerInterval);
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
    Sound.correct();
  } else {
    if (btn) btn.classList.add("wrong");
    feedback.textContent = chosen === null ? `¡Tiempo agotado! Era ${answer}.` : `Incorrecto. Era ${answer}.`;
    feedback.className = "feedback bad";
    chosen === null ? Sound.timeout() : Sound.wrong();
  }

  setTimeout(nextMathQuestion, 650);
}

/* ================= SEQUENCE GAME ================= */

const SEQ_DIFF = {
  easy: { time: 20, stepMax: 3, decoySpread: 4 },
  normal: { time: 15, stepMax: 5, decoySpread: 6 },
  hard: { time: 10, stepMax: 7, decoySpread: 9 },
};
let seqDifficulty = "normal";
let seqState = null;
let seqTimerInterval = null;

function generateSequence(level) {
  const conf = SEQ_DIFF[seqDifficulty];
  const type = randInt(0, 2);
  const start = randInt(1, 10);
  const step = randInt(2, conf.stepMax + Math.floor(level / 2));
  let seq = [];
  let next;

  if (type === 0) {
    seq = [0, 1, 2, 3].map((i) => start + i * step);
    next = start + 4 * step;
  } else if (type === 1) {
    const mult = randInt(2, 3);
    let v = randInt(1, 4);
    seq = [];
    for (let i = 0; i < 4; i++) {
      seq.push(v);
      v *= mult;
    }
    next = v;
  } else {
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
    const fake = next + randInt(-conf.decoySpread, conf.decoySpread) * randInt(1, 2 + level);
    if (fake !== next) options.add(fake);
  }
  return { seq, next, options: shuffle([...options]) };
}

function startSequence(diff) {
  if (diff) seqDifficulty = diff;
  showView("view-sequence");
  renderDifficultyRow("seq-diff", seqDifficulty, (key) => startSequence(key));
  seqState = { level: 1 };
  document.getElementById("seq-best").textContent = scores.sequence || 0;
  document.getElementById("seq-feedback").textContent = "";
  nextSequenceRound();
}

function nextSequenceRound() {
  clearInterval(seqTimerInterval);
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

  const conf = SEQ_DIFF[seqDifficulty];
  seqTimerInterval = startCountdown({
    seconds: conf.time,
    fillEl: document.getElementById("seq-timer-fill"),
    labelEl: document.getElementById("seq-timer-label"),
    onTick: () => Sound.tick(),
    onExpire: () => answerSequence(null, null),
  });
}

function endSequenceGame(reason) {
  const feedback = document.getElementById("seq-feedback");
  feedback.textContent = reason;
  feedback.className = "feedback bad";
  const finalLevel = seqState.level;
  setBest("sequence", finalLevel, true);
  const points = finalLevel * 15;
  setTimeout(() => {
    showResult("Secuencia Lógica", points, `Alcanzaste el nivel ${finalLevel}`, () => startSequence());
  }, 900);
}

function answerSequence(btn, chosen) {
  clearInterval(seqTimerInterval);
  const { next } = seqState.current;
  const optsEl = document.getElementById("seq-options");
  [...optsEl.children].forEach((b) => (b.disabled = true));

  if (chosen === next) {
    btn.classList.add("correct");
    const feedback = document.getElementById("seq-feedback");
    feedback.textContent = "¡Correcto! Subiendo de nivel...";
    feedback.className = "feedback good";
    Sound.correct();
    seqState.level += 1;
    setTimeout(nextSequenceRound, 700);
  } else {
    if (btn) btn.classList.add("wrong");
    chosen === null ? Sound.timeout() : Sound.wrong();
    endSequenceGame(chosen === null ? `¡Tiempo agotado! Era ${next}.` : `Fin del juego. La respuesta era ${next}.`);
  }
}

/* ================= WORD GAME ================= */

const WORD_BANK = [
  { word: "PUZLE", hint: "Rompecabezas", level: 1 },
  { word: "CEREBRO", hint: "Órgano del pensamiento", level: 1 },
  { word: "ENIGMA", hint: "Cosa difícil de entender", level: 1 },
  { word: "MEMORIA", hint: "Capacidad de retener información", level: 2 },
  { word: "LOGICA", hint: "Razonamiento estructurado", level: 2 },
  { word: "INGENIO", hint: "Capacidad para inventar soluciones", level: 2 },
  { word: "REFLEJO", hint: "Reacción rápida e involuntaria", level: 2 },
  { word: "ATENCION", hint: "Concentración en algo", level: 3 },
  { word: "ESTRATEGIA", hint: "Plan para lograr un objetivo", level: 3 },
  { word: "CONCENTRACION", hint: "Enfoque mental total", level: 3 },
];

const WORD_DIFF = {
  easy: { time: 30, maxLevel: 1 },
  normal: { time: 20, maxLevel: 2 },
  hard: { time: 14, maxLevel: 3 },
};
let wordDifficulty = "normal";
let wordState = null;
let wordTimerInterval = null;

function scrambleWord(word) {
  let letters;
  do {
    letters = shuffle(word.split(""));
  } while (letters.join("") === word && word.length > 1);
  return letters.join("");
}

function startWord(diff) {
  if (diff) wordDifficulty = diff;
  showView("view-word");
  renderDifficultyRow("word-diff", wordDifficulty, (key) => startWord(key));

  const conf = WORD_DIFF[wordDifficulty];
  const eligible = WORD_BANK.filter((w) => w.level <= conf.maxLevel);
  const pool = shuffle(eligible).slice(0, Math.min(8, eligible.length));
  wordState = { pool, index: 0, correct: 0 };
  document.getElementById("word-total").textContent = pool.length;
  document.getElementById("word-correct").textContent = "0";
  document.getElementById("word-best").textContent = scores.word || 0;
  nextWordRound();
}

function nextWordRound() {
  clearInterval(wordTimerInterval);
  if (wordState.index >= wordState.pool.length) {
    setBest("word", wordState.correct, true);
    const points = wordState.correct * 13;
    showResult(
      "¡Palabras completadas!",
      points,
      `${wordState.correct}/${wordState.pool.length} palabras acertadas`,
      () => startWord()
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

  const conf = WORD_DIFF[wordDifficulty];
  wordTimerInterval = startCountdown({
    seconds: conf.time,
    fillEl: document.getElementById("word-timer-fill"),
    labelEl: document.getElementById("word-timer-label"),
    onTick: () => Sound.tick(),
    onExpire: () => submitWord(true),
  });
}

function submitWord(timedOut) {
  if (!wordState.current) return;
  const input = document.getElementById("word-input");
  if (input.disabled) return;
  clearInterval(wordTimerInterval);
  const guess = input.value.trim().toUpperCase();
  const feedback = document.getElementById("word-feedback");
  input.disabled = true;

  if (!timedOut && guess === wordState.current.word) {
    wordState.correct += 1;
    document.getElementById("word-correct").textContent = wordState.correct;
    feedback.textContent = "¡Correcto!";
    feedback.className = "feedback good";
    Sound.correct();
  } else {
    feedback.textContent = timedOut
      ? `¡Tiempo agotado! Era: ${wordState.current.word}`
      : `La palabra era: ${wordState.current.word}`;
    feedback.className = "feedback bad";
    timedOut ? Sound.timeout() : Sound.wrong();
  }
  setTimeout(nextWordRound, 900);
}

document.getElementById("word-submit").addEventListener("click", () => submitWord(false));
document.getElementById("word-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitWord(false);
});

/* ================= REACTION GAME ================= */

const REACTION_DIFF = {
  easy: { delayMin: 1500, delayMax: 3500, rounds: 5 },
  normal: { delayMin: 1000, delayMax: 3000, rounds: 5 },
  hard: { delayMin: 500, delayMax: 1800, rounds: 6 },
};
let reactionDifficulty = "normal";
let reactionState = null;
let reactionTimeout = null;

function stopReactionTimers() {
  clearTimeout(reactionTimeout);
}

function startReaction(diff) {
  if (diff) reactionDifficulty = diff;
  showView("view-reaction");
  renderDifficultyRow("reac-diff", reactionDifficulty, (key) => startReaction(key));

  const conf = REACTION_DIFF[reactionDifficulty];
  reactionState = { round: 0, total: conf.rounds, times: [], phase: "idle" };
  document.getElementById("reac-total").textContent = conf.rounds;
  document.getElementById("reac-avg").textContent = "—";
  document.getElementById("reac-best").textContent = scores.reaction ? `${scores.reaction} ms` : "—";
  document.getElementById("reac-feedback").textContent = "";
  setupReactionBox();
}

function setupReactionBox() {
  const box = document.getElementById("reaction-box");
  box.className = "reaction-box wait";
  box.textContent = "Haz clic para empezar la ronda";
  box.onclick = () => {
    Sound.click();
    beginReactionRound();
  };
  document.getElementById("reac-count").textContent = Math.min(reactionState.round + 1, reactionState.total);
}

function beginReactionRound() {
  const box = document.getElementById("reaction-box");
  box.className = "reaction-box wait";
  box.textContent = "Espera el verde...";
  box.onclick = () => {
    if (reactionState.phase === "waiting") {
      stopReactionTimers();
      Sound.wrong();
      box.className = "reaction-box wait";
      box.textContent = "¡Muy pronto! Haz clic para reintentar";
      reactionState.phase = "idle";
      box.onclick = () => beginReactionRound();
    }
  };
  reactionState.phase = "waiting";
  const conf = REACTION_DIFF[reactionDifficulty];
  const delay = randInt(conf.delayMin, conf.delayMax);
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
  Sound.correct();

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
        () => startReaction()
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
renderSoundBtn();
renderMenu();
