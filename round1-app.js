// Round 1 — flat 4-category architecture. Two views: overview + detail.

let DATA = null;
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

  $('.back').addEventListener('click', renderOverview);
  $('#detail').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) toggleChip(chip);
  });
  $('.detail-search').addEventListener('input', (e) => {
    filterChips(e.target.value.trim().toLowerCase());
  });
}

function renderOverview() {
  $('#overview').hidden = false;
  $('#detail').hidden = true;
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
    card.addEventListener('click', () => renderDetail(cat));
    cards.appendChild(card);
  }
}

function renderDetail(cat) {
  $('#overview').hidden = true;
  $('#detail').hidden = false;
  $('#detail').style.setProperty('--accent', `var(--${cat.accent})`);

  $('.detail-num').textContent = cat.words.length;
  $('.detail-label-zh').textContent = cat.label;
  $('.detail-label-en').textContent = cat.label_en;
  $('.detail-tagline').textContent = cat.tagline;

  const search = $('.detail-search');
  search.value = '';
  search.placeholder = `搜尋 ${cat.words.length} 個${cat.label}`;

  const chips = $('.detail-chips');
  chips.innerHTML = '';
  for (const w of cat.words) {
    const ch = document.createElement('button');
    ch.type = 'button';
    ch.className = 'chip';
    ch.dataset.word = w.word;
    ch.dataset.zh = w.zh || '';
    ch.dataset.ex = w.ex || '';
    ch.textContent = w.word;
    chips.appendChild(ch);
  }

  window.scrollTo({ top: 0, behavior: 'instant' });
}

function toggleChip(chip) {
  const wasExpanded = chip.classList.contains('expanded');
  $$('.chip.expanded').forEach((c) => c.classList.remove('expanded'));
  $$('.word-info').forEach((d) => d.remove());
  if (wasExpanded) return;

  chip.classList.add('expanded');
  const info = document.createElement('div');
  info.className = 'word-info';
  info.innerHTML = `
    <div class="info-zh">${escapeHtml(chip.dataset.zh)}</div>
    <div class="info-ex">${escapeHtml(chip.dataset.ex)}</div>
  `;
  chip.insertAdjacentElement('afterend', info);
}

function filterChips(q) {
  $$('.word-info').forEach((d) => d.remove());
  $$('.chip.expanded').forEach((c) => c.classList.remove('expanded'));
  for (const c of $$('.chip')) {
    const visible = !q || c.dataset.word.toLowerCase().includes(q) || c.dataset.zh.includes(q);
    c.classList.toggle('chip-hidden', !visible);
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
