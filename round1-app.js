// Round 1 architecture map — renders 850 words by Ogden category.

const ACCENT_VARS = { slate: '--slate', sage: '--sage', rose: '--rose' };

let DATA = null;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

async function init() {
  const content = $('#content');
  try {
    const r = await fetch('round1-data.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    DATA = await r.json();
    render(DATA);
    setupSearch();
    setupClicks();
  } catch (e) {
    content.innerHTML = `<div class="error">無法載入 round1-data.json — ${e.message}</div>`;
  }
}

function render(data) {
  const content = $('#content');
  content.innerHTML = '';

  for (const cat of data.categories) {
    const totalCount = cat.subcategories.reduce((s, x) => s + x.words.length, 0);
    const catEl = document.createElement('section');
    catEl.className = 'category';
    catEl.dataset.catId = cat.id;
    catEl.style.setProperty('--accent', `var(${ACCENT_VARS[cat.accent] || '--slate'})`);

    catEl.innerHTML = `
      <header class="cat-header">
        <div class="cat-title">
          <span class="cat-dot" aria-hidden="true"></span>
          <h2>${cat.label}<span class="cat-zh"> · ${cat.label_zh}</span></h2>
          <span class="cat-count">${totalCount}</span>
        </div>
        <p class="cat-tag">${escapeHtml(cat.tagline)}</p>
      </header>
      <div class="subs"></div>
    `;

    const subsEl = $('.subs', catEl);
    for (const sub of cat.subcategories) {
      const subEl = document.createElement('div');
      subEl.className = 'sub';
      subEl.dataset.subId = sub.id;
      subEl.innerHTML = `
        <div class="sub-header">
          <h3>${escapeHtml(sub.label)}</h3>
          <span class="sub-count">${sub.words.length}</span>
        </div>
        <p class="sub-tag">${escapeHtml(sub.tagline)}</p>
        <div class="chips"></div>
      `;
      const chipsEl = $('.chips', subEl);
      for (const w of sub.words) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.dataset.word = w.word;
        chip.dataset.zh = w.zh || '';
        chip.dataset.ex = w.ex || '';
        chip.textContent = w.word;
        chipsEl.appendChild(chip);
      }
      subsEl.appendChild(subEl);
    }

    content.appendChild(catEl);
  }
}

function setupClicks() {
  $('#content').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    toggleChip(chip);
  });
}

function toggleChip(chip) {
  const existingDetail = $('.detail-card');
  const wasExpanded = chip.classList.contains('expanded');

  $$('.chip.expanded').forEach((c) => c.classList.remove('expanded'));
  if (existingDetail) existingDetail.remove();

  if (wasExpanded) return;

  chip.classList.add('expanded');
  const detail = document.createElement('div');
  detail.className = 'detail-card';
  detail.innerHTML = `
    <div class="detail-row">
      <span class="detail-word">${escapeHtml(chip.dataset.word)}</span>
      <span class="detail-zh">${escapeHtml(chip.dataset.zh)}</span>
    </div>
    <div class="detail-ex">${escapeHtml(chip.dataset.ex)}</div>
  `;
  chip.insertAdjacentElement('afterend', detail);
}

function setupSearch() {
  const input = $('#search');
  const stats = $('#search-stats');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    const matches = filterChips(q);
    stats.textContent = q ? `${matches} 個結果` : '';
  });
}

function filterChips(q) {
  let visibleTotal = 0;

  $$('.chip').forEach((chip) => {
    let visible = !q;
    if (q) {
      visible =
        chip.dataset.word.toLowerCase().includes(q) ||
        chip.dataset.zh.includes(q);
    }
    chip.classList.toggle('chip-hidden', !visible);
    if (visible) visibleTotal++;
  });

  $$('.detail-card').forEach((d) => d.remove());
  $$('.chip.expanded').forEach((c) => c.classList.remove('expanded'));

  $$('.sub').forEach((sub) => {
    const hasVisible = $$('.chip:not(.chip-hidden)', sub).length > 0;
    sub.classList.toggle('sub-hidden', !hasVisible);
  });
  $$('.category').forEach((cat) => {
    const hasVisible = $$('.sub:not(.sub-hidden)', cat).length > 0;
    cat.classList.toggle('cat-hidden', !hasVisible);
  });

  return visibleTotal;
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
