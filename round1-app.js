// Round 1 — flashcard mode. Pick category → flip through words. English only.

const OPERATORS = [
  'be', 'come', 'do', 'get', 'give', 'go', 'have', 'keep', 'let',
  'make', 'may', 'put', 'say', 'see', 'seem', 'send', 'take', 'will',
];
const OP_RE = new RegExp(`\\b(${OPERATORS.join('|')})\\b`, 'gi');

let DATA = null;
let deck = [];
let idx = 0;
let flipped = false;
let currentCat = null;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

async function init() {
  try {
    const r = await fetch('round1-data.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    DATA = await r.json();
    renderOverview();
  } catch (e) {
    $('#overview').innerHTML = `<div class="error">無法載入資料: ${e.message}</div>`;
  }

  $('.back-btn').addEventListener('click', renderOverview);
  $('.flashcard').addEventListener('click', flipCard);
  $('.nav-prev').addEventListener('click', prevCard);
  $('.nav-next').addEventListener('click', nextCard);
  $('.nav-shuffle').addEventListener('click', shuffleDeck);

  document.addEventListener('keydown', (e) => {
    if ($('#deck').hidden) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipCard(); }
    else if (e.key === 'ArrowRight') nextCard();
    else if (e.key === 'ArrowLeft') prevCard();
    else if (e.key === 'Escape') renderOverview();
  });
}

function renderOverview() {
  $('#overview').hidden = false;
  $('#deck').hidden = true;
  window.scrollTo({ top: 0, behavior: 'instant' });

  const cards = $('.cards');
  cards.innerHTML = '';
  for (const cat of DATA.categories) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.style.setProperty('--accent', `var(--${cat.accent})`);
    card.innerHTML = `
      <div class="card-num">${cat.words.length}</div>
      <div class="card-label">
        <span class="card-label-zh">${escapeHtml(cat.label)}</span>
        <span class="card-label-en">${escapeHtml(cat.label_en)}</span>
      </div>
    `;
    card.addEventListener('click', () => openDeck(cat));
    cards.appendChild(card);
  }
}

function openDeck(cat) {
  currentCat = cat;
  deck = [...cat.words];
  shuffleArray(deck);
  idx = 0;
  flipped = false;

  $('#overview').hidden = true;
  $('#deck').hidden = false;
  $('#deck').style.setProperty('--accent', `var(--${cat.accent})`);
  $('.deck-label-zh').textContent = cat.label;
  $('.deck-label-en').textContent = cat.label_en;

  renderCard();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderCard() {
  const w = deck[idx];
  $('.counter').textContent = `${idx + 1} / ${deck.length}`;

  $('.face-front .word-front').textContent = w.word;
  $('.face-back .word-back').textContent = w.word;

  const ex = w.ex || '';
  $('.face-back .example').innerHTML = ex ? highlightOps(ex) : '';

  const ops = opsIn(ex);
  $('.face-back .pairs').textContent = ops.length
    ? `pairs with · ${ops.join(' · ')}`
    : '';

  flipped = false;
  $('.flashcard').classList.remove('flipped');

  $('.nav-prev').disabled = idx === 0;
  $('.nav-next').disabled = idx === deck.length - 1;
}

function flipCard() {
  flipped = !flipped;
  $('.flashcard').classList.toggle('flipped', flipped);
}

function nextCard() {
  if (idx < deck.length - 1) {
    idx++;
    renderCard();
  }
}

function prevCard() {
  if (idx > 0) {
    idx--;
    renderCard();
  }
}

function shuffleDeck() {
  shuffleArray(deck);
  idx = 0;
  renderCard();
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
