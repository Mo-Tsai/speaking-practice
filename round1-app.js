// BE850 Daily — 10 nouns / session, flip + TTS read-aloud.

const OPERATORS = [
  'be', 'come', 'do', 'get', 'give', 'go', 'have', 'keep', 'let',
  'make', 'may', 'put', 'say', 'see', 'seem', 'send', 'take', 'will',
];
const OP_RE = new RegExp(`\\b(${OPERATORS.join('|')})\\b`, 'gi');
const SESSION_SIZE = 10;

let DATA = null;
let deck = [];
let idx = 0;
let flipped = false;
let nouns = [];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

async function init() {
  try {
    const r = await fetch('round1-data.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    DATA = await r.json();
    const things = DATA.categories.find((c) => c.id === 'things');
    nouns = things ? things.words : [];
    renderLanding();
  } catch (e) {
    $('#landing').innerHTML = `<div class="error">${e.message}</div>`;
  }

  // Prime voice list (some browsers need this)
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }

  $$('.start-btn').forEach((b) => b.addEventListener('click', startSession));
  $('.flashcard').addEventListener('click', flipCard);
  $('.nav-prev').addEventListener('click', prevCard);
  $('.nav-next').addEventListener('click', nextCard);
  $('.listen-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    speakExample();
  });

  document.addEventListener('keydown', (e) => {
    if (!$('#deck').hidden) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipCard(); }
      else if (e.key === 'ArrowRight') nextCard();
      else if (e.key === 'ArrowLeft') prevCard();
      else if (e.key === 'l' || e.key === 'L') speakExample();
    }
  });
}

function renderLanding() {
  $('#landing').hidden = false;
  $('#deck').hidden = true;
  $('#done').hidden = true;
  $('.session-total-info').textContent = `from ${nouns.length} nouns`;
}

function startSession() {
  if (!nouns.length) return;
  const shuffled = [...nouns];
  shuffleArray(shuffled);
  deck = shuffled.slice(0, SESSION_SIZE);
  idx = 0;
  flipped = false;

  $('#landing').hidden = true;
  $('#done').hidden = true;
  $('#deck').hidden = false;

  renderCard();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderCard() {
  const w = deck[idx];
  $('.counter').textContent = `${idx + 1} / ${deck.length}`;
  $('.word-front').textContent = w.word;
  $('.word-back').textContent = w.word;

  const ex = w.ex || '';
  $('.example').innerHTML = ex ? highlightOps(ex) : '';
  const ops = opsIn(ex);
  $('.pairs').textContent = ops.length ? `pairs with · ${ops.join(' · ')}` : '';

  flipped = false;
  $('.flashcard').classList.remove('flipped');

  $('.nav-prev').disabled = idx === 0;
  $('.nav-next').textContent = idx === deck.length - 1 ? 'finish ✓' : 'next →';

  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

function flipCard() {
  flipped = !flipped;
  $('.flashcard').classList.toggle('flipped', flipped);
  if (flipped) {
    setTimeout(() => speakExample(), 420);
  } else {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }
}

function nextCard() {
  if (idx < deck.length - 1) {
    idx++;
    renderCard();
  } else {
    showDone();
  }
}

function prevCard() {
  if (idx > 0) {
    idx--;
    renderCard();
  }
}

function showDone() {
  $('#deck').hidden = true;
  $('#done').hidden = false;
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function speakExample() {
  const w = deck[idx];
  if (!w || !w.ex) return;
  speak(w.ex);
}

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  u.pitch = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(
    (v) => v.lang.startsWith('en') &&
      (/Samantha|Karen|Daniel|Google US English|Microsoft.*Aria|Microsoft.*Jenny|Natural/i.test(v.name))
  );
  if (preferred) u.voice = preferred;
  window.speechSynthesis.speak(u);
}

function opsIn(s) {
  const found = new Set();
  let m;
  OP_RE.lastIndex = 0;
  while ((m = OP_RE.exec(s)) !== null) {
    found.add(m[1].toLowerCase());
  }
  return Array.from(found);
}

function highlightOps(s) {
  const esc = escapeHtml(s);
  return esc.replace(OP_RE, '<span class="op-hl">$1</span>');
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

init();
