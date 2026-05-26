// ════════════════════════════════════════════════════════════
// BE850 v6.0 — Basic English Paraphrase Practice
// Anki-style flashcards · SM-2 spaced repetition
// ════════════════════════════════════════════════════════════

const APP_VERSION = 'v6.0';
const CARDS_URL   = './paraphrase_cards.json';

// ─── localStorage keys ───
const LS_STATE = 'be850-card-state';   // SM-2 state per card
const LS_PREFS = 'be850-prefs';        // user prefs (filter, slow, etc)
const LS_STATS = 'be850-stats';        // lifetime stats

// ─── Speech recognition support ───
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

// ─── App state ───
let cards = [];          // all cards from JSON
let queue = [];          // due cards (sorted by due asc)
let currentCard = null;
let currentIdx = -1;     // index in cards array
let cardState = {};      // { cardId: { ease, interval, due, reps, lapses } }
let prefs = { filter: 'all', slowSpeak: false };
let stats = { reviewed: 0, started: null };

let phase = 'front';     // 'front' | 'back'
let isRecording = false;
let recognition = null;
let heardText = '';

// ════════════════════════════════════════════════════════════
// STATE PERSISTENCE
// ════════════════════════════════════════════════════════════
function loadState() {
  try { cardState = JSON.parse(localStorage.getItem(LS_STATE)) || {}; }
  catch { cardState = {}; }
  try { prefs = Object.assign(prefs, JSON.parse(localStorage.getItem(LS_PREFS)) || {}); }
  catch {}
  try { stats = Object.assign(stats, JSON.parse(localStorage.getItem(LS_STATS)) || {}); }
  catch {}
  if (!stats.started) { stats.started = Date.now(); saveStats(); }
}
function saveState() { localStorage.setItem(LS_STATE, JSON.stringify(cardState)); }
function savePrefs() { localStorage.setItem(LS_PREFS, JSON.stringify(prefs)); }
function saveStats() { localStorage.setItem(LS_STATS, JSON.stringify(stats)); }

// ════════════════════════════════════════════════════════════
// SM-2 ALGORITHM (simplified Anki variant)
// ════════════════════════════════════════════════════════════
// state per card: { ease: 2.5, interval: 0(days), due: timestamp_ms, reps: 0, lapses: 0 }
// Rating buttons:
//   0 Again: interval = ~1 min (treated as now+1min), ease -= 0.20, lapses++, reps=0
//   1 Hard:  interval = max(1, interval*1.2),     ease -= 0.15
//   2 Good:  interval = (reps==0 ? 1 : interval*ease)
//   3 Easy:  interval = (reps==0 ? 4 : interval*ease*1.3), ease += 0.15

function ensureCardState(cardId) {
  if (!cardState[cardId]) {
    cardState[cardId] = { ease: 2.5, interval: 0, due: Date.now(), reps: 0, lapses: 0 };
  }
  return cardState[cardId];
}

function applyRating(cardId, rating) {
  const s = ensureCardState(cardId);
  const dayMs = 86400000;

  if (rating === 0) {           // Again
    s.ease = Math.max(1.3, s.ease - 0.20);
    s.interval = 0;             // re-show within session
    s.due = Date.now() + 60_000; // 1 min
    s.lapses += 1;
    s.reps = 0;
  } else if (rating === 1) {    // Hard
    s.ease = Math.max(1.3, s.ease - 0.15);
    s.interval = s.reps === 0 ? 1 : Math.max(1, s.interval * 1.2);
    s.due = Date.now() + s.interval * dayMs;
    s.reps += 1;
  } else if (rating === 2) {    // Good
    s.interval = s.reps === 0 ? 1 : s.interval * s.ease;
    s.due = Date.now() + s.interval * dayMs;
    s.reps += 1;
  } else if (rating === 3) {    // Easy
    s.ease = s.ease + 0.15;
    s.interval = s.reps === 0 ? 4 : s.interval * s.ease * 1.3;
    s.due = Date.now() + s.interval * dayMs;
    s.reps += 1;
  }
  saveState();
  stats.reviewed = (stats.reviewed || 0) + 1;
  saveStats();
}

function humanInterval(days) {
  if (days < 1)   return '<1d';
  if (days < 30)  return Math.round(days) + 'd';
  if (days < 365) return Math.round(days / 30) + 'mo';
  return (days / 365).toFixed(1) + 'y';
}

function nextIntervalLabels(cardId) {
  const s = ensureCardState(cardId);
  const dayMs = 86400000;
  // Predict each rating's next interval (in days)
  const again = 0;
  const hard  = s.reps === 0 ? 1 : Math.max(1, s.interval * 1.2);
  const good  = s.reps === 0 ? 1 : s.interval * s.ease;
  const easy  = s.reps === 0 ? 4 : s.interval * s.ease * 1.3;
  return {
    again: '<1m',
    hard:  humanInterval(hard),
    good:  humanInterval(good),
    easy:  humanInterval(easy),
  };
}

// ════════════════════════════════════════════════════════════
// QUEUE BUILDING
// ════════════════════════════════════════════════════════════
function buildQueue() {
  const now = Date.now();
  let pool = cards.filter(c => {
    if (prefs.filter === 'verb' && c.type !== 'verb') return false;
    if (prefs.filter === 'paraphrase' && c.type !== 'paraphrase') return false;
    return true;
  });
  // Due cards: never-seen OR due <= now
  let due = pool.filter(c => {
    const st = cardState[c.id];
    if (!st) return true;
    return st.due <= now;
  });
  // Sort: unseen first (in original order for verb→paraphrase progression),
  // then due cards by due ascending
  due.sort((a, b) => {
    const sa = cardState[a.id], sb = cardState[b.id];
    if (!sa && !sb) return 0;
    if (!sa) return -1;
    if (!sb) return 1;
    return sa.due - sb.due;
  });
  queue = due;
}

function nextCard() {
  buildQueue();
  if (queue.length === 0) {
    currentCard = null;
    renderEmpty();
    return;
  }
  currentCard = queue[0];
  phase = 'front';
  heardText = '';
  renderCard();
}

// ════════════════════════════════════════════════════════════
// SPEECH SYNTHESIS / RECOGNITION
// ════════════════════════════════════════════════════════════
function speakText(text, btn) {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = prefs.slowSpeak ? 0.6 : 1.0;
  if (btn) {
    btn.classList.add('active'); btn.disabled = true;
    const done = () => { btn.classList.remove('active'); btn.disabled = false; };
    u.onend = done; u.onerror = done;
  }
  window.speechSynthesis.speak(u);
}

function startRecording() {
  if (!SR) return;
  if (isRecording) return;
  isRecording = true;
  heardText = '';
  const btn = document.getElementById('record-btn');
  if (btn) { btn.classList.add('recording'); btn.textContent = '⏹  Listening… (tap to stop)'; }
  const heardEl = document.getElementById('heard-box');
  if (heardEl) heardEl.innerHTML = '';

  recognition = new SR();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.onresult = (e) => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t + ' '; else interim += t;
    }
    heardText += final;
    const display = (heardText + interim).trim();
    const el = document.getElementById('heard-box');
    if (el) el.innerHTML = `<span class="heard-label">YOU SAID</span>${display || 'listening…'}`;
  };
  recognition.onerror = () => stopRecording();
  recognition.onend = () => {
    if (isRecording) {
      isRecording = false;
      const btn2 = document.getElementById('record-btn');
      if (btn2) { btn2.classList.remove('recording'); btn2.textContent = '🎙  Try Speaking'; }
    }
  };
  recognition.start();
}
function stopRecording() {
  if (!isRecording || !recognition) return;
  isRecording = false;
  try { recognition.stop(); } catch {}
  const btn = document.getElementById('record-btn');
  if (btn) { btn.classList.remove('recording'); btn.textContent = '🎙  Try Speaking'; }
}
function toggleRecording() {
  if (isRecording) stopRecording(); else startRecording();
}

// ════════════════════════════════════════════════════════════
// HIGHLIGHT 18 OPERATORS IN BASIC ANSWER
// ════════════════════════════════════════════════════════════
const OPERATORS_REGEX = /\b(come|came|get|got|give|gave|given|go|went|gone|keep|kept|let|make|made|put|seem|seemed|seems|take|took|taken|be|am|is|are|was|were|been|being|do|does|did|done|have|has|had|say|said|says|see|saw|seen|send|sent|may|might|will|would)\b/gi;

function highlightOperators(text) {
  // Escape HTML first
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(OPERATORS_REGEX, '<span class="w-op">$1</span>');
}

// ════════════════════════════════════════════════════════════
// RENDER
// ════════════════════════════════════════════════════════════
const app = document.getElementById('app');

function renderHeader() {
  const total = cards.length;
  const seen = Object.keys(cardState).length;
  return `
    <div class="header">
      <div class="brand">
        <span class="brand-name">BE850</span>
        <span class="brand-sub">Basic English</span>
      </div>
      <div class="head-right">
        <span class="progress-text">${seen} / ${total}</span>
        <button class="icon-btn" id="settings-btn" title="Settings">⚙</button>
      </div>
    </div>`;
}

function renderEmpty() {
  app.innerHTML = `
    ${renderHeader()}
    <div class="card">
      <div class="empty-state">
        <div class="empty-icon">✓</div>
        <div class="empty-title">今日卡片完成</div>
        <div class="empty-sub">
          所有到期的卡片都複習過了。<br>
          明天再來,或在設定裡換個篩選類型。<br><br>
          累計複習:<b style="color:var(--sage)">${stats.reviewed || 0}</b> 次
        </div>
        <button class="btn-primary" style="max-width:200px;margin-top:10px;" onclick="forceReview()">再複習一輪</button>
      </div>
    </div>`;
  bindHeaderEvents();
}

function forceReview() {
  // Force-show all filtered cards regardless of due date
  const now = Date.now();
  Object.values(cardState).forEach(s => { s.due = now; });
  saveState();
  nextCard();
}

function renderCard() {
  const c = currentCard;
  if (!c) { renderEmpty(); return; }

  const isVerb = c.type === 'verb';
  const eyebrowText = isVerb ? '⚙ VERB · 用 18 動詞重組' : '💬 PARAPHRASE · 用 850 字重寫';

  if (phase === 'front') {
    // FRONT: show prompt only (English + Chinese)
    app.innerHTML = `
      ${renderHeader()}
      <div class="card">
        <div class="card-eyebrow">${eyebrowText}</div>
        <div class="card-prompt-en">${c.prompt_en}</div>
        <div class="card-prompt-zh">${c.prompt_zh}</div>
        <div class="card-hint">想想看怎麼用 Basic English 講?<br>(可以念出來,或按 Show Answer 看答案)</div>

        <div style="flex:1"></div>

        ${SR ? `
          <button class="record-btn" id="record-btn" onclick="toggleRecording()">🎙  Try Speaking</button>
          <div class="heard-box" id="heard-box"></div>
        ` : `
          <div class="heard-box" style="color:var(--muted);">瀏覽器不支援語音辨識,請用 Chrome</div>
        `}

        <button class="btn-primary" onclick="flipCard()">Show Answer ↓</button>
      </div>`;
  } else {
    // BACK: show answer + operators + note + rating
    const labels = nextIntervalLabels(c.id);
    app.innerHTML = `
      ${renderHeader()}
      <div class="card">
        <div class="card-eyebrow">${eyebrowText}</div>
        <div class="card-prompt-en" style="font-size:1.15rem;color:var(--muted);font-weight:500;">${c.prompt_en}</div>
        <div class="card-prompt-zh">${c.prompt_zh}</div>

        <div class="card-divider"></div>

        <div class="card-eyebrow basic">↓ BASIC ENGLISH</div>
        <div class="answer-block">
          <div class="answer-text">${highlightOperators(c.basic_answer)}</div>
          <div class="operators-row">
            <span>用到的 18 動詞:</span>
            ${(c.operators_used || []).map(op => `<span class="op-chip">${op}</span>`).join('')}
          </div>
          ${c.note ? `<div class="note-block">💡 ${c.note}</div>` : ''}
        </div>

        <div class="speak-row">
          <button id="btn-speak" onclick="speakText(currentCard.basic_answer, this)">🔊 Listen</button>
          <button class="btn-slow ${prefs.slowSpeak ? 'on' : ''}" onclick="toggleSlow()">🐢 ${prefs.slowSpeak ? 'Slow' : 'Normal'}</button>
        </div>

        ${SR ? `
          <button class="record-btn" id="record-btn" onclick="toggleRecording()">🎙  Try Speaking</button>
          <div class="heard-box" id="heard-box">${heardText ? `<span class="heard-label">YOU SAID</span>${heardText.trim()}` : ''}</div>
        ` : ''}

        <div style="flex:1"></div>

        <div class="rating-row">
          <button class="rate-btn rate-again" onclick="rate(0)">
            <span class="rate-label">Again</span>
            <span class="rate-next">${labels.again}</span>
          </button>
          <button class="rate-btn rate-hard" onclick="rate(1)">
            <span class="rate-label">Hard</span>
            <span class="rate-next">${labels.hard}</span>
          </button>
          <button class="rate-btn rate-good" onclick="rate(2)">
            <span class="rate-label">Good</span>
            <span class="rate-next">${labels.good}</span>
          </button>
          <button class="rate-btn rate-easy" onclick="rate(3)">
            <span class="rate-label">Easy</span>
            <span class="rate-next">${labels.easy}</span>
          </button>
        </div>
      </div>`;
  }
  bindHeaderEvents();
}

function flipCard() {
  if (isRecording) stopRecording();
  phase = 'back';
  renderCard();
}

function rate(score) {
  if (!currentCard) return;
  if (isRecording) stopRecording();
  applyRating(currentCard.id, score);
  nextCard();
}

function toggleSlow() {
  prefs.slowSpeak = !prefs.slowSpeak;
  savePrefs();
  renderCard();
}

// ════════════════════════════════════════════════════════════
// SETTINGS MODAL
// ════════════════════════════════════════════════════════════
function openSettings() {
  const total = cards.length;
  const seen = Object.keys(cardState).length;
  const dueNow = cards.filter(c => {
    const s = cardState[c.id];
    return !s || s.due <= Date.now();
  }).length;
  const verbCount = cards.filter(c => c.type === 'verb').length;
  const paraCount = cards.filter(c => c.type === 'paraphrase').length;

  const modal = document.createElement('div');
  modal.className = 'modal-bg';
  modal.id = 'settings-modal';
  modal.innerHTML = `
    <div class="modal" onclick="event.stopPropagation()">
      <h3>⚙ Settings</h3>

      <div class="setting-row">
        <span class="setting-label">Filter / 卡組類型</span>
        <div class="setting-options">
          <button class="setting-pill ${prefs.filter === 'all' ? 'active' : ''}" data-filter="all">All (${total})</button>
          <button class="setting-pill ${prefs.filter === 'verb' ? 'active' : ''}" data-filter="verb">Verb (${verbCount})</button>
          <button class="setting-pill ${prefs.filter === 'paraphrase' ? 'active' : ''}" data-filter="paraphrase">Paraphrase (${paraCount})</button>
        </div>
      </div>

      <div class="setting-row">
        <span class="setting-label">Stats</span>
        <div class="stat-line">
          總卡數:<b>${total}</b><br>
          已看過:<b>${seen}</b><br>
          今天到期:<b style="color:var(--slate)">${dueNow}</b><br>
          累計複習:<b style="color:var(--sage)">${stats.reviewed || 0}</b> 次
        </div>
      </div>

      <div class="modal-foot">
        <button class="btn-reset" onclick="resetAll()">Reset All</button>
        <button class="btn-close" onclick="closeSettings()">Close</button>
      </div>
    </div>`;
  modal.addEventListener('click', (e) => { if (e.target === modal) closeSettings(); });
  document.body.appendChild(modal);

  // Bind filter pills
  modal.querySelectorAll('.setting-pill').forEach(p => {
    p.addEventListener('click', () => {
      prefs.filter = p.dataset.filter;
      savePrefs();
      closeSettings();
      nextCard();
    });
  });
}

function closeSettings() {
  const m = document.getElementById('settings-modal');
  if (m) m.remove();
}

function resetAll() {
  if (!confirm('清空所有學習紀錄,重新開始?')) return;
  cardState = {};
  stats = { reviewed: 0, started: Date.now() };
  saveState(); saveStats();
  closeSettings();
  nextCard();
}

function bindHeaderEvents() {
  const sb = document.getElementById('settings-btn');
  if (sb) sb.addEventListener('click', openSettings);
}

// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════
async function init() {
  loadState();
  if (!SR) {
    console.warn('SpeechRecognition not supported — running without voice');
  }
  try {
    const resp = await fetch(CARDS_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    cards = data.cards || [];
    if (cards.length === 0) throw new Error('No cards in JSON');
    nextCard();
  } catch (err) {
    app.innerHTML = `<div class="notice">⚠️ 無法載入卡片庫。<br><br>請確認 <code>paraphrase_cards.json</code> 在同目錄下。<br><small style="color:#888;">(${err.message})</small></div>`;
  }
}

// Expose to window for onclick handlers
window.toggleRecording = toggleRecording;
window.flipCard = flipCard;
window.rate = rate;
window.toggleSlow = toggleSlow;
window.speakText = speakText;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.resetAll = resetAll;
window.forceReview = forceReview;
Object.defineProperty(window, 'currentCard', { get: () => currentCard });

init();
