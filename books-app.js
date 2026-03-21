// ── View management ───────────────────────────────────────────────────────────
const VIEWS = ['collection','watchlist','maybe','meh','banned'];
const dirtyViews = new Set(VIEWS);
function getGrid(v) { return document.getElementById('grid-' + v); }
function markDirty(v) { dirtyViews.add(v); }
function markClean(v) { dirtyViews.delete(v); }

let draggedCard          = null;
let droppedOnTab         = false;
let pendingStandardsSlot = null;

function getViewList(view)        { return view === 'collection' ? books : ({ watchlist: loadWatchlist, maybe: loadMaybe, meh: loadMeh, banned: loadBanned }[view])(); }
function saveViewList(view, list) { if (view === 'collection') { books.splice(0, books.length, ...list); saveBooks(); } else ({ watchlist: saveWatchlist, maybe: saveMaybe, meh: saveMeh, banned: saveBanned }[view])(list); }

function moveBetweenViews(title, fromView, toView) {
  const src = getViewList(fromView);
  const idx  = src.findIndex(m => m.title === title);
  if (idx === -1) return;
  const [book] = src.splice(idx, 1);
  saveViewList(fromView, src);
  book.addedAt = Date.now();
  const dst = getViewList(toView);
  dst.unshift(book);
  saveViewList(toView, dst);
  markDirty(fromView);
  markDirty(toView);
}

function showEmptyState(g) {
  const wrap = document.createElement('div');
  wrap.className = 'grid-empty';
  const img = document.createElement('img');
  img.src = 'empty.png';
  img.alt = '';
  img.draggable = false;
  const label = document.createElement('div');
  label.className = 'grid-empty-label';
  label.textContent = 'Nothing here yet';
  wrap.appendChild(img);
  wrap.appendChild(label);
  g.appendChild(wrap);
}

// ── Fold textures ─────────────────────────────────────────────────────────────
function drawCreasePart(ctx, pos, isHorizontal, w, h, strength, isHighlight, angle) {
  const len = (isHorizontal ? w : h) * 1.6;
  const hlOpacity = Math.min(1, 1.1 * strength);
  const shOpacity = Math.min(1, 0.75 * strength);
  const spread = Math.round(18 * strength);
  ctx.save();
  ctx.translate(isHorizontal ? w / 2 : pos, isHorizontal ? pos : h / 2);
  ctx.rotate(angle);
  if (isHorizontal) {
    if (isHighlight) {
      const hl = ctx.createLinearGradient(0, -5, 0, 2);
      hl.addColorStop(0, 'rgba(255,255,255,0)');
      hl.addColorStop(0.5, `rgba(255,255,255,${hlOpacity})`);
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl; ctx.fillRect(-len / 2, -5, len, 7);
    } else {
      const sh = ctx.createLinearGradient(0, 1, 0, spread);
      sh.addColorStop(0, `rgba(0,0,0,${shOpacity})`);
      sh.addColorStop(0.4, `rgba(0,0,0,${shOpacity * 0.35})`);
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh; ctx.fillRect(-len / 2, 1, len, spread);
    }
  } else {
    if (isHighlight) {
      const hl = ctx.createLinearGradient(-5, 0, 2, 0);
      hl.addColorStop(0, 'rgba(255,255,255,0)');
      hl.addColorStop(0.5, `rgba(255,255,255,${hlOpacity})`);
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl; ctx.fillRect(-5, -len / 2, 7, len);
    } else {
      const sh = ctx.createLinearGradient(1, 0, spread, 0);
      sh.addColorStop(0, `rgba(0,0,0,${shOpacity})`);
      sh.addColorStop(0.4, `rgba(0,0,0,${shOpacity * 0.35})`);
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh; ctx.fillRect(1, -len / 2, spread, len);
    }
  }
  ctx.restore();
}

function generateFoldTextures() {
  const w = 400, h = 600;
  const patterns = [{ h: [1/3, 2/3], v: [1/2] }, { h: [1/4, 1/2, 3/4], v: [1/2] }];
  const pat = patterns[Math.floor(Math.random() * patterns.length)];
  const hPos = pat.h.map(t => h * t + (Math.random() - 0.5) * 6);
  const vPos = pat.v.map(t => w * t + (Math.random() - 0.5) * 6);
  const hBounds = [0, ...hPos, h], vBounds = [0, ...vPos, w];
  const sectionData = hBounds.slice(0, -1).map(() =>
    vBounds.slice(0, -1).map(() => ({ angle: Math.random() * Math.PI * 2, intensity: 0.12 + Math.random() * 0.14 }))
  );
  const hAngles = hPos.map(() => (Math.random() - 0.5) * 0.04);
  const vAngles = vPos.map(() => (Math.random() - 0.5) * 0.04);
  function buildCanvas(isHighlight) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = isHighlight ? '#000' : '#fff';
    ctx.fillRect(0, 0, w, h);
    const id = ctx.createImageData(w, h); const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = isHighlight ? Math.floor(Math.random() * 22) : Math.floor(233 + Math.random() * 22);
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = Math.floor(Math.random() * 25 + 5);
    }
    ctx.putImageData(id, 0, 0);
    sectionData.forEach((row, ri) => row.forEach(({ angle, intensity }, ci) => {
      const x1 = vBounds[ci], y1 = hBounds[ri], x2 = vBounds[ci + 1], y2 = hBounds[ri + 1];
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      const r = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) * 0.5;
      const dx = Math.cos(angle) * r, dy = Math.sin(angle) * r;
      const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      if (isHighlight) { grad.addColorStop(0, `rgba(255,255,255,${intensity})`); grad.addColorStop(1, 'rgba(0,0,0,0)'); }
      else { grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(1, `rgba(0,0,0,${intensity})`); }
      ctx.fillStyle = grad; ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    }));
    hPos.forEach((pos, i) => drawCreasePart(ctx, pos, true,  w, h, 1,   isHighlight, hAngles[i]));
    vPos.forEach((pos, i) => drawCreasePart(ctx, pos, false, w, h, 2.2, isHighlight, vAngles[i]));
    return canvas.toDataURL('image/png');
  }
  return { hl: buildCanvas(true), sh: buildCanvas(false) };
}

function addTilt(card) {
  const sheen = document.createElement('div');
  sheen.className = 'card-sheen';
  card.appendChild(sheen);
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transition = 'transform 0.05s linear, box-shadow 0.05s linear';
    card.style.transform = `perspective(800px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg) scale(1.02)`;
    card.style.boxShadow = `${-x * 10}px ${y * 10}px 24px rgba(0,0,0,0.2)`;
    sheen.style.opacity = '1';
    sheen.style.background = `radial-gradient(circle at ${(0.5 - x) * 100}% ${(0.5 - y) * 100}%, rgba(255,255,255,0.12) 0%, transparent 65%)`;
  });
  card.addEventListener('mouseleave', () => {
    card.style.transition = 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.6s cubic-bezier(0.23, 1, 0.32, 1)';
    card.style.transform = ''; card.style.boxShadow = ''; sheen.style.opacity = '0';
  });
}

const textureCache = new Map();
function getCachedTextures(key) {
  if (!textureCache.has(key)) textureCache.set(key, generateFoldTextures());
  return textureCache.get(key);
}

// ── Onboarding Wizard ─────────────────────────────────────────────────────────
const ONBOARDED_KEY = 'braintrust_books_onboarded';
let wizardIndex = 0;
let wizardCollected = [];
let wizardDragActive = false;
let wizardDragStartX = 0;
let wizardDragCurrentX = 0;
let wizardActiveCard = null;

function isOnboarded() {
  return !!localStorage.getItem(ONBOARDED_KEY);
}

function markOnboarded() {
  localStorage.setItem(ONBOARDED_KEY, '1');
}

function coverFallbackColor(title) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}deg 20% 16%)`;
}

function buildWizardCard(book, isActive) {
  const card = document.createElement('div');
  card.className = 'ob-card' + (isActive ? '' : ' ob-card-behind');

  if (isActive) {
    const stampRead = document.createElement('div');
    stampRead.className = 'ob-stamp ob-stamp-read';
    stampRead.textContent = 'READ ✓';
    const stampSkip = document.createElement('div');
    stampSkip.className = 'ob-stamp ob-stamp-skip';
    stampSkip.textContent = 'SKIP ✕';
    card.appendChild(stampRead);
    card.appendChild(stampSkip);
  }

  const coverWrap = document.createElement('div');
  coverWrap.className = 'ob-cover-wrap';
  coverWrap.style.background = coverFallbackColor(book.title);

  const img = document.createElement('img');
  img.className = 'ob-cover';
  img.src = book.cover;
  img.alt = book.title;
  img.draggable = false;
  img.onerror = () => { img.style.display = 'none'; };

  coverWrap.appendChild(img);

  const info = document.createElement('div');
  info.className = 'ob-book-info';

  const titleEl = document.createElement('div');
  titleEl.className = 'ob-book-title';
  titleEl.textContent = book.title;

  const meta = document.createElement('div');
  meta.className = 'ob-book-meta';
  meta.textContent = `${book.author} · ${book.year}`;

  info.appendChild(titleEl);
  info.appendChild(meta);
  card.appendChild(coverWrap);
  card.appendChild(info);

  return card;
}

function updateWizardCounter() {
  const progressEl = document.getElementById('ob-progress');
  const badgeEl    = document.getElementById('ob-count-badge');
  const total = ONBOARDING_CANDIDATES.length;
  if (progressEl) progressEl.textContent = `${Math.min(wizardIndex + 1, total)} / ${total}`;
  if (badgeEl) badgeEl.textContent = wizardCollected.length > 0 ? `${wizardCollected.length} added` : '';
}

function renderWizardCards() {
  const stage = document.getElementById('ob-stage');
  // Remove old active card (clean up drag listeners first)
  if (wizardActiveCard?._cleanupDrag) wizardActiveCard._cleanupDrag();
  stage.querySelectorAll('.ob-card').forEach(c => c.remove());

  if (wizardIndex >= ONBOARDING_CANDIDATES.length) {
    showWizardFinish();
    return;
  }

  // Behind card
  const nextBook = ONBOARDING_CANDIDATES[wizardIndex + 1];
  if (nextBook) {
    stage.appendChild(buildWizardCard(nextBook, false));
  }

  // Active card
  const book = ONBOARDING_CANDIDATES[wizardIndex];
  wizardActiveCard = buildWizardCard(book, true);
  stage.appendChild(wizardActiveCard);
  attachWizardDrag(wizardActiveCard, book);

  updateWizardCounter();

  // Preload next-next cover
  const preloadBook = ONBOARDING_CANDIDATES[wizardIndex + 2];
  if (preloadBook) { const i = new Image(); i.src = preloadBook.cover; }
}

function doWizardSwipe(direction) {
  const card = wizardActiveCard;
  if (!card) return;
  const book = ONBOARDING_CANDIDATES[wizardIndex];

  if (direction === 'right' && book) wizardCollected.push(book);

  const stamp = card.querySelector(direction === 'right' ? '.ob-stamp-read' : '.ob-stamp-skip');
  if (stamp) stamp.style.opacity = '1';

  const flyX = direction === 'right' ? (window.innerWidth + 300) : -(window.innerWidth + 300);
  const flyRot = direction === 'right' ? 25 : -25;
  card.style.transition = 'transform 0.42s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.32s';
  card.style.transform = `translateX(${flyX}px) rotate(${flyRot}deg)`;
  card.style.opacity = '0';

  // Animate behind card forward
  const behindCard = document.querySelector('.ob-card-behind');
  if (behindCard) {
    behindCard.style.transition = 'transform 0.32s cubic-bezier(0.23, 1, 0.32, 1)';
    behindCard.style.transform = 'scale(1) translateY(0)';
  }

  wizardIndex++;
  updateWizardCounter();
  setTimeout(() => renderWizardCards(), 280);
}

function attachWizardDrag(card, book) {
  let startX = 0;
  let delta  = 0;
  let active = false;

  function getClientX(e) { return e.touches ? e.touches[0].clientX : e.clientX; }

  function onStart(e) {
    if (e.type === 'mousedown' && e.button !== 0) return;
    active  = true;
    startX  = getClientX(e);
    delta   = 0;
    card.style.transition = '';
  }

  function onMove(e) {
    if (!active) return;
    delta = getClientX(e) - startX;
    const rot = delta * 0.065;
    card.style.transform = `translateX(${delta}px) rotate(${rot}deg)`;
    const ratio = Math.min(Math.abs(delta) / 75, 1);
    const stampRead = card.querySelector('.ob-stamp-read');
    const stampSkip = card.querySelector('.ob-stamp-skip');
    if (stampRead) stampRead.style.opacity = delta > 0 ? ratio : 0;
    if (stampSkip) stampSkip.style.opacity = delta < 0 ? ratio : 0;
  }

  function onEnd() {
    if (!active) return;
    active = false;
    const THRESHOLD = 75;
    if (delta > THRESHOLD) {
      doWizardSwipe('right');
    } else if (delta < -THRESHOLD) {
      doWizardSwipe('left');
    } else {
      card.style.transition = 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)';
      card.style.transform  = '';
      const stamps = card.querySelectorAll('.ob-stamp');
      stamps.forEach(s => s.style.opacity = 0);
    }
    delta = 0;
  }

  card.addEventListener('mousedown', onStart);
  card.addEventListener('touchstart', onStart, { passive: true });

  const moveM = e => onMove(e);
  const moveT = e => onMove(e);
  const endM  = () => onEnd();
  const endT  = () => onEnd();

  document.addEventListener('mousemove', moveM);
  document.addEventListener('mouseup', endM);
  card.addEventListener('touchmove', moveT, { passive: true });
  card.addEventListener('touchend', endT);

  card._cleanupDrag = () => {
    document.removeEventListener('mousemove', moveM);
    document.removeEventListener('mouseup', endM);
  };
}

function showWizardFinish() {
  const wizardBody   = document.getElementById('ob-wizard-body');
  const finishScreen = document.getElementById('ob-finish-screen');
  const doneBtn      = document.getElementById('ob-done-btn');
  const titleEl      = document.getElementById('ob-finish-title');
  const subEl        = document.getElementById('ob-finish-sub');

  if (wizardBody)   wizardBody.style.display = 'none';
  if (doneBtn)      doneBtn.style.display = 'none';
  if (finishScreen) finishScreen.classList.add('visible');

  const n = wizardCollected.length;
  if (titleEl) titleEl.textContent = n > 0 ? `${n} book${n === 1 ? '' : 's'} added` : 'Your library awaits';
  if (subEl)   subEl.textContent   = n > 0
    ? `Great taste. Discover more with AI-powered recommendations.`
    : `No worries — add books manually or get AI recommendations to start.`;
}

function dismissWizard() {
  if (wizardActiveCard?._cleanupDrag) wizardActiveCard._cleanupDrag();

  const overlay = document.getElementById('onboarding-overlay');
  overlay.style.transition = 'opacity 0.4s';
  overlay.style.opacity    = '0';
  setTimeout(() => {
    overlay.style.display    = 'none';
    overlay.style.opacity    = '';
    overlay.style.transition = '';
  }, 400);

  wizardCollected.forEach(b => books.unshift({ ...b, addedAt: Date.now() }));
  if (wizardCollected.length) saveBooks();
  markOnboarded();

  render(sortedList(books, 'collection'));
  renderGridNav();
  fetchRecommendation();
  updateSortable('collection');
  applyGrain();
}

function showWizard() {
  wizardIndex    = 0;
  wizardCollected = [];
  const overlay = document.getElementById('onboarding-overlay');
  overlay.style.display = 'flex';
  renderWizardCards();

  document.getElementById('ob-btn-skip').addEventListener('click', () => doWizardSwipe('left'));
  document.getElementById('ob-btn-add').addEventListener('click',  () => doWizardSwipe('right'));
  document.getElementById('ob-done-btn').addEventListener('click', () => {
    showWizardFinish();
  });
  document.getElementById('ob-finish-btn').addEventListener('click', dismissWizard);
}

// Keyboard navigation for wizard
document.addEventListener('keydown', (e) => {
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay || overlay.style.display === 'none') return;
  const finishVisible = document.getElementById('ob-finish-screen')?.classList.contains('visible');
  if (finishVisible) { if (e.key === 'Enter') dismissWizard(); return; }
  if (e.key === 'ArrowRight' || e.key === 'Enter') doWizardSwipe('right');
  if (e.key === 'ArrowLeft')                       doWizardSwipe('left');
});

// ── Standards section ─────────────────────────────────────────────────────────
function renderStandardsSection() {
  const wrap = document.getElementById('standards-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  const standards = loadStandards();

  const header = document.createElement('div');
  header.className = 'standards-header';
  const title = document.createElement('span');
  title.className = 'standards-title';
  title.textContent = 'Reference Books';
  const count = document.createElement('span');
  count.className = 'standards-count';
  count.textContent = `${standards.length} / ${MAX_STANDARDS}`;
  header.appendChild(title);
  header.appendChild(count);
  wrap.appendChild(header);

  const slots = document.createElement('div');
  slots.className = 'standards-slots';

  for (let i = 0; i < MAX_STANDARDS; i++) {
    const slot = document.createElement('div');
    slot.className = 'standards-slot';
    const book = standards[i];

    if (book) {
      slot.classList.add('filled');
      const img = document.createElement('img');
      img.src = book.cover;
      img.alt = book.title;
      img.title = `${book.title} (${book.year})`;
      img.draggable = false;
      slot.appendChild(img);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'standards-slot-remove';
      removeBtn.innerHTML = '✕';
      removeBtn.addEventListener('click', () => {
        const updated = loadStandards().filter(m => m.title !== book.title);
        saveStandards(updated);
        render(sortedList(books, 'collection'));
        applyGrain();
      });
      slot.appendChild(removeBtn);
    } else {
      slot.classList.add('empty');
      slot.innerHTML = '<span class="standards-slot-plus" style="pointer-events:none">★</span>';
    }
    slots.appendChild(slot);
  }
  wrap.appendChild(slots);

  wrap.addEventListener('dragover', (e) => {
    if (!draggedCard) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const slot = e.target.closest('.standards-slot.empty');
    wrap.querySelectorAll('.standards-slot').forEach(s => s.classList.remove('drop-hover'));
    if (slot) { slot.classList.add('drop-hover'); pendingStandardsSlot = slot; }
    else       { pendingStandardsSlot = null; }
  });

  wrap.addEventListener('dragleave', (e) => {
    if (!wrap.contains(e.relatedTarget))
      wrap.querySelectorAll('.standards-slot').forEach(s => s.classList.remove('drop-hover'));
  });
}

// ── Literary Persona ──────────────────────────────────────────────────────────
const PERSONA_CACHE_KEY = 'braintrust_books_persona_cache';

function getPersonaCacheKey(stds) { return stds.map(m => m.title).sort().join('|'); }
function loadPersonaCache() { try { return JSON.parse(localStorage.getItem(PERSONA_CACHE_KEY)) || null; } catch { return null; } }
function savePersonaCache(key, data) { localStorage.setItem(PERSONA_CACHE_KEY, JSON.stringify({ key, data })); }

function renderPersonaCard(wrap, data) {
  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(data.imagePrompt)}?width=1280&height=640&nologo=true&model=flux`;
  wrap.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'persona-card';
  const imgWrap = document.createElement('div');
  imgWrap.className = 'persona-room-wrap';
  const img = document.createElement('img');
  img.className = 'persona-room-img'; img.alt = ''; img.draggable = false;
  const overlay = document.createElement('div');
  overlay.className = 'persona-overlay';
  const label = document.createElement('div'); label.className = 'persona-label'; label.textContent = 'Your Literary Persona';
  const type  = document.createElement('div'); type.className  = 'persona-type';  type.textContent  = data.type;
  const tagline = document.createElement('div'); tagline.className = 'persona-tagline'; tagline.textContent = `"${data.tagline}"`;
  const desc  = document.createElement('div'); desc.className  = 'persona-description'; desc.textContent = data.description;
  overlay.append(label, type, tagline, desc);
  imgWrap.append(img, overlay);
  card.appendChild(imgWrap);
  wrap.appendChild(card);
  img.src = imageUrl;
  img.onload = () => img.classList.add('loaded');
}

function renderPersonaSection() {
  const wrap = document.getElementById('persona-wrap');
  if (!wrap) return;
  const standards = loadStandards();
  if (standards.length === 0) { wrap.innerHTML = ''; return; }
  const cacheKey = getPersonaCacheKey(standards);
  const cache = loadPersonaCache();
  if (cache && cache.key === cacheKey) { renderPersonaCard(wrap, cache.data); return; }

  wrap.innerHTML = `
    <div class="persona-card persona-loading">
      <div class="persona-room-wrap">
        <div class="persona-room-shimmer"></div>
        <div class="persona-overlay">
          <div class="persona-skel" style="width:120px;height:11px"></div>
          <div class="persona-skel" style="width:260px;height:28px;margin-top:8px"></div>
          <div class="persona-skel" style="width:340px;height:14px;margin-top:10px"></div>
          <div class="persona-skel" style="width:300px;height:14px;margin-top:6px"></div>
        </div>
      </div>
    </div>`;

  fetch('/api/persona-books', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ standards }),
  })
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(data => { savePersonaCache(cacheKey, data); renderPersonaCard(wrap, data); })
    .catch(() => { wrap.innerHTML = ''; });
}

function toggleStandard(book) {
  const stds = loadStandards();
  const idx = stds.findIndex(m => m.title === book.title);
  if (idx !== -1) { stds.splice(idx, 1); }
  else {
    if (stds.length >= MAX_STANDARDS) return false;
    stds.push({ title: book.title, year: book.year, author: book.author, cover: book.cover });
  }
  saveStandards(stds);
  return true;
}

// ── Main grid render ──────────────────────────────────────────────────────────
function render(list) {
  renderStandardsSection();
  renderPersonaSection();
  const g = getGrid('collection');
  g.innerHTML = '';
  const standards = loadStandards();
  list.forEach(book => {
    const card = document.createElement('div');
    const isStandard = standards.some(m => m.title === book.title);
    card.className = 'card movie-card' + (isStandard ? ' is-standard' : '');

    const imgWrap = document.createElement('div');
    imgWrap.className = 'poster-wrap';
    imgWrap.style.background = coverFallbackColor(book.title);

    const img = document.createElement('img');
    img.className = 'card-image movie-poster';
    img.draggable = false;
    img.src = book.cover;
    img.alt = book.title;
    img.onerror = () => { img.style.display = 'none'; };

    const textures = getCachedTextures(book.title);
    const hlDiv = document.createElement('div');
    hlDiv.className = 'poster-texture poster-texture-hl';
    hlDiv.style.backgroundImage = `url(${textures.hl})`;
    const shDiv = document.createElement('div');
    shDiv.className = 'poster-texture poster-texture-sh';
    shDiv.style.backgroundImage = `url(${textures.sh})`;

    const starBtn = document.createElement('button');
    starBtn.className = 'card-star-btn' + (isStandard ? ' active' : '');
    starBtn.title = isStandard ? 'Remove from Reference Books' : 'Add to Reference Books';
    starBtn.innerHTML = '★';
    starBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ok = toggleStandard(book);
      if (ok !== false) { render(sortedList(books, 'collection')); applyGrain(); }
    });

    imgWrap.appendChild(img);
    imgWrap.appendChild(hlDiv);
    imgWrap.appendChild(shDiv);
    imgWrap.appendChild(starBtn);

    const info = document.createElement('div');
    info.className = 'card-info';
    const title = document.createElement('span');
    title.className = 'card-name';
    title.textContent = book.title;
    const meta = document.createElement('span');
    meta.className = 'card-trade';
    meta.textContent = `${book.author}, ${book.year}`;
    info.appendChild(title);
    info.appendChild(meta);
    card.appendChild(imgWrap);
    card.appendChild(info);
    g.appendChild(card);
    addTilt(card);
  });
  if (!list.length) showEmptyState(g);
  markClean('collection');
}

// ── Recommendation section ────────────────────────────────────────────────────
let currentRec  = null;
let recLoading  = false;
let recError    = null;
const sessionExcluded = new Set();

async function fetchRecommendation() {
  recLoading = true; recError = null; currentRec = null;
  renderRecommendation();

  try {
    const excluded = [
      ...books.map(m => m.title),
      ...loadBanned().map(m => m.title),
      ...loadWatchlist().map(m => m.title),
      ...sessionExcluded,
    ];
    const res = await fetch('/api/recommend-books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ books, excluded, standards: loadStandards() }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      recError = body.error === 'out_of_credits' ? 'out_of_credits' : true;
    } else {
      currentRec = await res.json();
      if (currentRec?.title) {
        sessionExcluded.add(currentRec.title);
        const alreadyListed = [
          ...books.map(m => m.title), ...loadWatchlist().map(m => m.title),
          ...loadMaybe().map(m => m.title), ...loadMeh().map(m => m.title),
          ...loadBanned().map(m => m.title),
        ].some(t => t.toLowerCase() === currentRec.title.toLowerCase());
        if (alreadyListed) { recLoading = false; return fetchRecommendation(); }
      }
    }
  } catch (e) { console.error('Recommendation failed:', e); recError = true; }

  recLoading = false;
  renderRecommendation();
}

function renderRecommendation() {
  const wrap = document.getElementById('recommendation');
  wrap.innerHTML = '';

  const headingRow = document.createElement('div');
  headingRow.className = 'rec-heading-row';
  const heading = document.createElement('div');
  heading.className = 'rec-heading';
  heading.innerHTML = '📚 Something New To Read Today?!';
  headingRow.appendChild(heading);
  wrap.appendChild(headingRow);

  if (recLoading) {
    const loadingBanner = document.createElement('div');
    loadingBanner.className = 'rec-banner rec-banner-loading';
    loadingBanner.innerHTML = `
      <div class="rec-skel-content">
        <div class="rec-skel-poster"></div>
        <div class="rec-skel-info">
          <div class="rec-skel-bar" style="width:72%;height:48px;border-radius:6px"></div>
          <div class="rec-skel-bar" style="width:38%;height:14px;margin-top:12px"></div>
          <div class="rec-skel-bar" style="width:100%;height:12px;margin-top:20px"></div>
          <div class="rec-skel-bar" style="width:95%;height:12px;margin-top:8px"></div>
          <div class="rec-skel-bar" style="width:80%;height:12px;margin-top:8px"></div>
          <div style="display:flex;gap:10px;margin-top:28px">
            <div class="rec-skel-bar" style="width:120px;height:38px;border-radius:8px"></div>
            <div class="rec-skel-bar" style="width:120px;height:38px;border-radius:8px"></div>
          </div>
        </div>
      </div>`;
    wrap.appendChild(loadingBanner);
    return;
  }

  if (recError) {
    const errorBanner = document.createElement('div');
    errorBanner.className = 'rec-banner rec-banner-error';
    const msg = document.createElement('span');
    msg.textContent = recError === 'out_of_credits'
      ? 'Out of API credits. Top up at console.anthropic.com to get recommendations.'
      : 'Could not load recommendation.';
    errorBanner.appendChild(msg);
    if (recError !== 'out_of_credits') {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'rec-btn rec-btn-secondary';
      retryBtn.textContent = 'Retry';
      retryBtn.addEventListener('click', fetchRecommendation);
      errorBanner.appendChild(retryBtn);
    }
    wrap.appendChild(errorBanner);
    return;
  }

  if (!currentRec) return;

  const rec = currentRec;

  const bg = document.createElement('div');
  bg.className = 'rec-bg';
  bg.style.backgroundImage = `url(${rec.cover})`;

  const overlay = document.createElement('div');
  overlay.className = 'rec-overlay';

  const content = document.createElement('div');
  content.className = 'rec-content';

  const textures = getCachedTextures(rec.title + '__rec');
  const posterWrap = document.createElement('div');
  posterWrap.className = 'rec-poster-wrap';
  posterWrap.style.background = coverFallbackColor(rec.title);

  const img = document.createElement('img');
  img.className = 'rec-poster';
  img.src = rec.cover;
  img.alt = rec.title;
  img.onerror = () => { img.style.display = 'none'; };

  const hlDiv = document.createElement('div');
  hlDiv.className = 'poster-texture poster-texture-hl';
  hlDiv.style.backgroundImage = `url(${textures.hl})`;
  const shDiv = document.createElement('div');
  shDiv.className = 'poster-texture poster-texture-sh';
  shDiv.style.backgroundImage = `url(${textures.sh})`;

  posterWrap.appendChild(img);
  posterWrap.appendChild(hlDiv);
  posterWrap.appendChild(shDiv);

  const info = document.createElement('div');
  info.className = 'rec-info';

  const title = document.createElement('span');
  title.className = 'rec-title';
  title.textContent = rec.title;

  const meta = document.createElement('span');
  meta.className = 'rec-meta';
  meta.textContent = `${rec.author}, ${rec.year}`;

  const reason = document.createElement('p');
  reason.className = 'rec-reason';
  reason.textContent = rec.reason;

  const ICON_CHECK   = `<svg viewBox="0 0 16 16" fill="none" width="14" height="14"><circle cx="8" cy="8" r="7" fill="rgba(60,200,100,0.25)"/><path d="M4.5 8.5l2.5 2.5 4.5-5" stroke="#3dc864" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ICON_X       = `<svg viewBox="0 0 16 16" fill="none" width="14" height="14"><circle cx="8" cy="8" r="7" fill="rgba(255,80,80,0.2)"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="rgba(255,100,100,0.9)" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  const ICON_REFRESH = `<svg viewBox="0 0 16 16" fill="none" width="14" height="14"><path d="M13 8A5 5 0 1 1 8 3a5 5 0 0 1 3.54 1.46L13 6" stroke="rgba(255,255,255,0.7)" stroke-width="1.6" stroke-linecap="round"/><path d="M13 3v3h-3" stroke="rgba(255,255,255,0.7)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ICON_DICE    = `<svg viewBox="0 0 16 16" fill="none" width="14" height="14"><rect x="2" y="2" width="12" height="12" rx="2.5" stroke="rgba(180,140,255,0.85)" stroke-width="1.6"/><circle cx="5.5" cy="5.5" r="1" fill="rgba(180,140,255,0.85)"/><circle cx="10.5" cy="5.5" r="1" fill="rgba(180,140,255,0.85)"/><circle cx="8" cy="8" r="1" fill="rgba(180,140,255,0.85)"/><circle cx="5.5" cy="10.5" r="1" fill="rgba(180,140,255,0.85)"/><circle cx="10.5" cy="10.5" r="1" fill="rgba(180,140,255,0.85)"/></svg>`;

  const watchBtn = document.createElement('button');
  watchBtn.className = 'rec-btn rec-btn-watchlist';
  const alreadyWatchlisted = loadWatchlist().some(m => m.title === rec.title);
  watchBtn.innerHTML = `${ICON_CHECK}<span>${alreadyWatchlisted ? 'On reading list' : 'Add to reading list'}</span>`;
  watchBtn.addEventListener('click', () => {
    const list = loadWatchlist();
    if (!list.some(m => m.title === rec.title)) {
      list.unshift({ title: rec.title, year: rec.year, author: rec.author, cover: rec.cover, addedAt: Date.now() });
      saveWatchlist(list);
    }
    setGridView('watchlist');
    fetchRecommendation();
  });

  const newBtn = document.createElement('button');
  newBtn.className = 'rec-btn rec-btn-secondary';
  newBtn.innerHTML = `${ICON_REFRESH}<span>One more try</span>`;
  newBtn.addEventListener('click', () => fetchRecommendation());

  const banBtn = document.createElement('button');
  banBtn.className = 'rec-btn rec-btn-ban';
  banBtn.innerHTML = `${ICON_X}<span>Don't recommend</span>`;
  banBtn.addEventListener('click', () => {
    saveSnapshot(`Before banning "${rec.title}"`);
    const list = loadBanned();
    list.unshift({ title: rec.title, year: rec.year, author: rec.author, cover: rec.cover, addedAt: Date.now() });
    saveBanned(list);
    renderGridNav();
    fetchRecommendation();
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'rec-btn rec-btn-primary';
  addBtn.textContent = 'Already Read';
  addBtn.addEventListener('click', () => {
    books.unshift({ title: rec.title, year: rec.year, author: rec.author, cover: rec.cover, addedAt: Date.now() });
    saveBooks();
    render(books);
    applyGrain();
    fetchRecommendation();
  });

  const maybeBtn = document.createElement('button');
  maybeBtn.className = 'rec-btn rec-btn-maybe';
  const alreadyMaybe = loadMaybe().some(m => m.title === rec.title);
  maybeBtn.innerHTML = `${ICON_DICE}<span>${alreadyMaybe ? 'In Wildcard' : 'Wildcard'}</span>`;
  maybeBtn.addEventListener('click', () => {
    const list = loadMaybe();
    if (!list.some(m => m.title === rec.title)) {
      list.unshift({ title: rec.title, year: rec.year, author: rec.author, cover: rec.cover, addedAt: Date.now() });
      saveMaybe(list);
    }
    renderGridNav();
    fetchRecommendation();
  });

  const mehBtn = document.createElement('button');
  mehBtn.className = 'rec-btn rec-btn-meh';
  const alreadyMeh = loadMeh().some(m => m.title === rec.title);
  mehBtn.innerHTML = `<span>${alreadyMeh ? '😐 In Meh' : '😐 Meh'}</span>`;
  mehBtn.addEventListener('click', () => {
    saveSnapshot(`Before adding "${rec.title}" to Meh`);
    const list = loadMeh();
    if (!list.some(m => m.title === rec.title)) {
      list.unshift({ title: rec.title, year: rec.year, author: rec.author, cover: rec.cover, addedAt: Date.now() });
      saveMeh(list);
    }
    renderGridNav();
    fetchRecommendation();
  });

  const posterButtons = document.createElement('div');
  posterButtons.className = 'rec-poster-buttons';
  posterButtons.appendChild(addBtn);
  posterButtons.appendChild(newBtn);

  const posterCol = document.createElement('div');
  posterCol.className = 'rec-poster-col';
  posterCol.appendChild(posterWrap);
  posterCol.appendChild(posterButtons);

  info.appendChild(title);
  info.appendChild(meta);
  info.appendChild(reason);

  const infoButtons = document.createElement('div');
  infoButtons.className = 'rec-info-buttons';
  infoButtons.appendChild(watchBtn);
  infoButtons.appendChild(maybeBtn);
  infoButtons.appendChild(mehBtn);
  infoButtons.appendChild(banBtn);
  info.appendChild(infoButtons);

  content.appendChild(posterCol);
  content.appendChild(info);

  const banner = document.createElement('div');
  banner.className = 'rec-banner';
  banner.appendChild(bg);
  banner.appendChild(overlay);
  banner.appendChild(content);

  wrap.appendChild(banner);
  applyGrain();
}

// ── Persistence ───────────────────────────────────────────────────────────────
const STORAGE_KEY   = 'braintrust_books';
const BANNED_KEY    = 'braintrust_books_banned';
const WATCHLIST_KEY = 'braintrust_books_watchlist';
const MAYBE_KEY     = 'braintrust_books_maybe';
const MEH_KEY       = 'braintrust_books_meh';
const SNAPSHOTS_KEY = 'braintrust_books_snapshots';
const STANDARDS_KEY = 'braintrust_books_standards';
const SORT_KEY      = 'braintrust_books_sort';
const MAX_SNAPSHOTS = 20;
const MAX_STANDARDS = 12;

function loadStandards() { try { return JSON.parse(localStorage.getItem(STANDARDS_KEY) || '[]'); } catch(e) { return []; } }
function saveStandards(list) { localStorage.setItem(STANDARDS_KEY, JSON.stringify(list)); }

function saveSnapshot(label = '') {
  const snap = {
    ts: Date.now(), label: label || new Date().toLocaleString(),
    books:    JSON.parse(localStorage.getItem(STORAGE_KEY)   || '[]'),
    watchlist: JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]'),
    maybe:     JSON.parse(localStorage.getItem(MAYBE_KEY)     || '[]'),
    meh:       JSON.parse(localStorage.getItem(MEH_KEY)       || '[]'),
    banned:    JSON.parse(localStorage.getItem(BANNED_KEY)    || '[]'),
    standards: JSON.parse(localStorage.getItem(STANDARDS_KEY) || '[]'),
  };
  const snapshots = loadSnapshots();
  snapshots.unshift(snap);
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots.slice(0, MAX_SNAPSHOTS)));
  fetch('/api/snapshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snap) })
    .then(r => { if (!r.ok) r.text().then(t => console.error('Snapshot API error:', t)); })
    .catch(e => console.error('Snapshot fetch failed:', e));
}

function loadSnapshots() { try { return JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]'); } catch(e) { return []; } }

function restoreSnapshot(snap) {
  localStorage.setItem(STORAGE_KEY,   JSON.stringify(snap.books));
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(snap.watchlist));
  localStorage.setItem(MAYBE_KEY,     JSON.stringify(snap.maybe));
  localStorage.setItem(MEH_KEY,       JSON.stringify(snap.meh || []));
  localStorage.setItem(BANNED_KEY,    JSON.stringify(snap.banned));
  if (snap.standards) localStorage.setItem(STANDARDS_KEY, JSON.stringify(snap.standards));
  books.splice(0, books.length, ...snap.books);
  VIEWS.forEach(v => markDirty(v));
  setGridView(gridView);
  renderGridNav();
}

let undoTimer = null;
function showUndo(message, undoFn) {
  let toast = document.getElementById('undo-toast');
  if (!toast) { toast = document.createElement('div'); toast.id = 'undo-toast'; document.body.appendChild(toast); }
  if (undoTimer) clearTimeout(undoTimer);
  toast.innerHTML = '';
  const msg = document.createElement('span'); msg.textContent = message;
  const btn = document.createElement('button'); btn.textContent = 'Undo';
  btn.addEventListener('click', () => { undoFn(); toast.classList.remove('visible'); });
  toast.appendChild(msg); toast.appendChild(btn);
  toast.classList.add('visible');
  undoTimer = setTimeout(() => toast.classList.remove('visible'), 5000);
}

function loadBanned()   { try { return JSON.parse(localStorage.getItem(BANNED_KEY) || '[]'); } catch(e) { return []; } }
function saveBanned(list) { localStorage.setItem(BANNED_KEY, JSON.stringify(list)); if (gridView !== 'banned') markDirty('banned'); }
function loadWatchlist() { try { return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]'); } catch(e) { return []; } }
function saveWatchlist(list) { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list)); if (gridView !== 'watchlist') markDirty('watchlist'); }
function loadMaybe()    { try { return JSON.parse(localStorage.getItem(MAYBE_KEY) || '[]'); } catch(e) { return []; } }
function saveMaybe(list) { localStorage.setItem(MAYBE_KEY, JSON.stringify(list)); if (gridView !== 'maybe') markDirty('maybe'); }
function loadMeh()      { try { return JSON.parse(localStorage.getItem(MEH_KEY) || '[]'); } catch(e) { return []; } }
function saveMeh(list)  { localStorage.setItem(MEH_KEY, JSON.stringify(list)); if (gridView !== 'meh') markDirty('meh'); }

function saveBooks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
  if (gridView !== 'collection') markDirty('collection');
}

function loadBooks() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try { const parsed = JSON.parse(saved); books.splice(0, books.length, ...parsed); } catch(e) {}
}

function syncOrderFromDOM() {
  const cards = getGrid('collection').querySelectorAll('.movie-card');
  const newOrder = [];
  cards.forEach(card => {
    const title = card.querySelector('.card-name').textContent;
    const book  = books.find(m => m.title === title);
    if (book) newOrder.push(book);
  });
  books.splice(0, books.length, ...newOrder);
  saveBooks();
}

// ── Grid nav & sorting ────────────────────────────────────────────────────────
const NAV_ICONS = {
  collection: '<img src="curtain.png" style="width:24px;height:24px;object-fit:contain;vertical-align:middle">',
  watchlist:  '📖',
  maybe:      '<img src="wildcard.webp" style="width:24px;height:24px;object-fit:contain;vertical-align:middle">',
  meh:        '😐',
  banned:     '👻',
};

let gridView = 'collection';
let sortableInstance;
let currentSaveOrder = null;

function loadSortModes() { try { return JSON.parse(localStorage.getItem(SORT_KEY) || '{}'); } catch(e) { return {}; } }
function getSortMode(view) { return loadSortModes()[view] || 'preference'; }
function setSortMode(view, mode) {
  const modes = loadSortModes(); modes[view] = mode;
  localStorage.setItem(SORT_KEY, JSON.stringify(modes));
  markDirty(view);
}
function sortedList(list, view) {
  const mode = getSortMode(view);
  if (mode === 'date') return [...list].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  return list;
}

function updateSortable(view) {
  const el = getGrid(view);
  const locked = getSortMode(view) === 'date';
  el.classList.toggle('sort-locked', locked);
  if (sortableInstance) sortableInstance.destroy();
  sortableInstance = Sortable.create(el, {
    animation: 600,
    easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
    swapThreshold: 0.3,
    ghostClass: 'sortable-ghost',
    disabled: locked,
    onStart: (evt) => {
      draggedCard          = evt.item;
      droppedOnTab         = false;
      pendingStandardsSlot = null;
      document.querySelectorAll('.grid-nav-btn').forEach(btn => { if (btn.dataset.key !== gridView) btn.classList.add('drop-target'); });
      if (gridView === 'collection') document.getElementById('standards-wrap')?.classList.add('drag-active');
    },
    onEnd: () => {
      document.querySelectorAll('.grid-nav-btn').forEach(btn => btn.classList.remove('drop-target', 'drop-hover'));
      document.getElementById('standards-wrap')?.classList.remove('drag-active');
      document.getElementById('standards-wrap')?.querySelectorAll('.standards-slot').forEach(s => s.classList.remove('drop-hover'));

      if (pendingStandardsSlot && draggedCard) {
        const title = draggedCard.querySelector('.card-name').textContent;
        const book  = books.find(m => m.title === title);
        if (book) {
          const stds = loadStandards();
          if (!stds.some(m => m.title === title) && stds.length < MAX_STANDARDS) {
            stds.push({ title: book.title, year: book.year, author: book.author, cover: book.cover });
            saveStandards(stds);
            markDirty('collection');
          }
        }
        pendingStandardsSlot = null; draggedCard = null; droppedOnTab = false;
        setGridView(gridView); renderGridNav();
        return;
      }

      if (droppedOnTab) { droppedOnTab = false; draggedCard = null; setGridView(gridView); renderGridNav(); return; }
      draggedCard = null;
      if (currentSaveOrder) currentSaveOrder();
    },
  });

  const makeOrderSaver = (loadFn, saveFn) => () => {
    const newOrder = [];
    el.querySelectorAll('.movie-card').forEach(card => {
      const m = loadFn().find(x => x.title === card.querySelector('.card-name').textContent);
      if (m) newOrder.push(m);
    });
    saveFn(newOrder);
  };

  if (view === 'collection')  currentSaveOrder = syncOrderFromDOM;
  else if (view === 'watchlist') currentSaveOrder = makeOrderSaver(loadWatchlist, saveWatchlist);
  else if (view === 'maybe')     currentSaveOrder = makeOrderSaver(loadMaybe, saveMaybe);
  else if (view === 'meh')       currentSaveOrder = makeOrderSaver(loadMeh, saveMeh);
  else if (view === 'banned')    currentSaveOrder = makeOrderSaver(loadBanned, saveBanned);
}

function setGridView(view) {
  gridView = view;
  VIEWS.forEach(v => { getGrid(v).style.display = v === view ? '' : 'none'; });
  const sw = document.getElementById('standards-wrap');
  if (sw) sw.style.display = view === 'collection' ? '' : 'none';
  const pw = document.getElementById('persona-wrap');
  if (pw) pw.style.display = view === 'collection' ? '' : 'none';
  if (dirtyViews.has(view)) {
    if (view === 'collection')  { render(sortedList(books, 'collection')); applyGrain(); }
    else if (view === 'watchlist') renderSubGrid('watchlist', loadWatchlist);
    else if (view === 'maybe')     renderSubGrid('maybe', loadMaybe);
    else if (view === 'meh')       renderSubGrid('meh', loadMeh);
    else if (view === 'banned')    renderSubGrid('banned', loadBanned);
  }
  updateSortable(view);
  renderGridNav();
}

const NAV_TABS = [
  { key: 'collection', label: 'Collection'     },
  { key: 'watchlist',  label: 'Reading List'   },
  { key: 'maybe',      label: 'Wildcard'        },
  { key: 'meh',        label: 'Meh'             },
  { key: 'banned',     label: "Don't Recommend" },
];

function getTabCount(key) {
  if (key === 'collection') return books.length;
  if (key === 'watchlist')  return loadWatchlist().length;
  if (key === 'maybe')      return loadMaybe().length;
  if (key === 'meh')        return loadMeh().length;
  if (key === 'banned')     return loadBanned().length;
  return 0;
}

function buildNavButtons(container, compact = false) {
  let tabRow = container.querySelector('.grid-nav-tabs');
  if (!tabRow) {
    tabRow = document.createElement('div');
    tabRow.className = 'grid-nav-tabs';
    const slider = document.createElement('div');
    slider.className = 'grid-nav-slider';
    tabRow.appendChild(slider);
    NAV_TABS.forEach(({ key }) => {
      const btn = document.createElement('button');
      btn.dataset.key = key;
      btn.className = 'grid-nav-btn' + (compact ? ' compact' : '');
      btn.addEventListener('click', () => {
        setGridView(key);
        const el = document.getElementById('grid-nav');
        const headerH = document.querySelector('header')?.offsetHeight || 0;
        const top = el.getBoundingClientRect().top + window.scrollY - headerH - 16;
        window.scrollTo({ top, behavior: 'smooth' });
      });
      btn.addEventListener('dragover', (e) => { if (!draggedCard || key === gridView) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; btn.classList.add('drop-hover'); });
      btn.addEventListener('dragleave', () => btn.classList.remove('drop-hover'));
      btn.addEventListener('drop', (e) => {
        e.preventDefault(); btn.classList.remove('drop-hover');
        if (!draggedCard || key === gridView) return;
        const title = draggedCard.querySelector('.card-name').textContent;
        droppedOnTab = true;
        moveBetweenViews(title, gridView, key);
      });
      tabRow.appendChild(btn);
    });
    container.appendChild(tabRow);
  }

  tabRow.querySelectorAll('.grid-nav-btn').forEach(btn => {
    const key = btn.dataset.key;
    const count = getTabCount(key);
    const active = gridView === key;
    btn.className = 'grid-nav-btn' + (active ? ' active' : '') + (compact ? ' compact' : '');
    btn.innerHTML = `<span class="grid-nav-icon">${NAV_ICONS[key]}</span><span>${NAV_TABS.find(t=>t.key===key).label}</span>${count ? `<span class="grid-nav-count">${count}</span>` : ''}`;
  });

  const activeBtn = tabRow.querySelector('.grid-nav-btn.active');
  const slider = tabRow.querySelector('.grid-nav-slider');
  if (activeBtn && slider) {
    if (!slider.dataset.init) {
      slider.style.transition = 'none';
      requestAnimationFrame(() => {
        slider.style.left = activeBtn.offsetLeft + 'px'; slider.style.width = activeBtn.offsetWidth + 'px';
        slider.dataset.init = '1';
        requestAnimationFrame(() => { slider.style.transition = ''; });
      });
    } else {
      requestAnimationFrame(() => { slider.style.left = activeBtn.offsetLeft + 'px'; slider.style.width = activeBtn.offsetWidth + 'px'; });
    }
  }

  if (!compact) {
    let sortRow = container.querySelector('.grid-sort-row');
    if (!sortRow) {
      sortRow = document.createElement('div');
      sortRow.className = 'grid-sort-row';
      [{ key: 'preference', label: 'Preference' }, { key: 'date', label: 'Date added' }].forEach(({ key, label }) => {
        const btn = document.createElement('button');
        btn.dataset.sortKey = key; btn.textContent = label;
        btn.addEventListener('click', () => { setSortMode(gridView, key); setGridView(gridView); });
        sortRow.appendChild(btn);
      });
      container.appendChild(sortRow);
    }
    const mode = getSortMode(gridView);
    sortRow.querySelectorAll('button').forEach(btn => { btn.className = 'grid-sort-btn' + (mode === btn.dataset.sortKey ? ' active' : ''); });
  }
}

function renderGridNav() {
  const nav = document.getElementById('grid-nav');
  if (nav) buildNavButtons(nav);
}

function addTexturesToPoster(posterWrap, key) {
  const textures = getCachedTextures(key);
  const hlDiv = document.createElement('div'); hlDiv.className = 'poster-texture poster-texture-hl'; hlDiv.style.backgroundImage = `url(${textures.hl})`;
  const shDiv = document.createElement('div'); shDiv.className = 'poster-texture poster-texture-sh'; shDiv.style.backgroundImage = `url(${textures.sh})`;
  posterWrap.appendChild(hlDiv); posterWrap.appendChild(shDiv);
}

// ── Sub-grid renderer (watchlist / maybe / meh / banned) ─────────────────────
function renderSubGrid(view, loadFn) {
  const g = getGrid(view);
  const list = sortedList(loadFn(), view);
  g.innerHTML = '';
  if (!list.length) { showEmptyState(g); markClean(view); return; }

  const removeLabels = { watchlist: 'Reading List', maybe: 'Wildcard', meh: 'Meh', banned: "Don't Recommend" };
  const saveByView = { watchlist: saveWatchlist, maybe: saveMaybe, meh: saveMeh, banned: saveBanned };
  const renderByView = { watchlist: () => renderSubGrid('watchlist', loadWatchlist), maybe: () => renderSubGrid('maybe', loadMaybe), meh: () => renderSubGrid('meh', loadMeh), banned: () => renderSubGrid('banned', loadBanned) };

  list.forEach(book => {
    const card = document.createElement('div');
    card.className = 'card movie-card';

    const posterWrap = document.createElement('div');
    posterWrap.className = 'poster-wrap';
    posterWrap.style.background = coverFallbackColor(book.title);

    const img = document.createElement('img');
    img.className = 'card-image movie-poster';
    img.draggable = false;
    img.src = book.cover;
    img.alt = book.title;
    img.onerror = () => { img.style.display = 'none'; };

    const removeBtn = document.createElement('button');
    removeBtn.className = 'card-remove-btn';
    removeBtn.innerHTML = '✕';
    removeBtn.title = `Remove from ${removeLabels[view]}`;
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveSnapshot(`Before removing "${book.title}" from ${removeLabels[view]}`);
      const prev = loadFn();
      const updated = prev.filter(m => m.title !== book.title);
      saveByView[view](updated);
      renderByView[view]();
      renderGridNav();
      showUndo(`Removed "${book.title}" from ${removeLabels[view]}`, () => {
        saveByView[view](prev);
        renderByView[view]();
        renderGridNav();
      });
    });

    posterWrap.appendChild(img);
    addTexturesToPoster(posterWrap, book.title);
    posterWrap.appendChild(removeBtn);

    const info = document.createElement('div');
    info.className = 'card-info';
    const title = document.createElement('span'); title.className = 'card-name'; title.textContent = book.title;
    const meta  = document.createElement('span'); meta.className  = 'card-trade'; meta.textContent  = `${book.author}, ${book.year}`;
    info.appendChild(title); info.appendChild(meta);
    card.appendChild(posterWrap); card.appendChild(info);
    g.appendChild(card);
  });
  applyGrain();
  markClean(view);
}

// ── Grain controls ────────────────────────────────────────────────────────────
let grainEnabled = true;
let grainLevel   = 0.04;
let darkBoost    = 100;

function applyGrain() {
  const opacity    = grainEnabled ? grainLevel : 0;
  const multiplier = 1 + darkBoost / 100;
  document.querySelectorAll('.poster-texture-hl').forEach(el => { el.style.opacity = Math.min(1, opacity * multiplier); });
  document.querySelectorAll('.poster-texture-sh').forEach(el => { el.style.opacity = opacity; });
}

applyGrain();

const toggle     = document.getElementById('texture-toggle');
const slider     = document.getElementById('grain-slider');
const grainValue = document.getElementById('grain-value');
const darkSlider = document.getElementById('dark-slider');
const darkValue  = document.getElementById('dark-value');

toggle.addEventListener('click', () => {
  grainEnabled = !grainEnabled;
  toggle.classList.toggle('inactive', !grainEnabled);
  slider.disabled = !grainEnabled; darkSlider.disabled = !grainEnabled;
  applyGrain();
});
slider.addEventListener('input', () => { grainLevel = parseFloat(slider.value); grainValue.textContent = Math.round(grainLevel * 100) + '%'; applyGrain(); });
darkSlider.addEventListener('input', () => { darkBoost = parseInt(darkSlider.value); darkValue.textContent = '+' + darkBoost + '%'; applyGrain(); });

setInterval(() => saveSnapshot('Auto-save'), 10 * 60 * 1000);

// ── Initialize ────────────────────────────────────────────────────────────────
loadBooks();

if (!isOnboarded()) {
  showWizard();
} else {
  render(sortedList(books, 'collection'));
  renderGridNav();
  fetchRecommendation();
  updateSortable('collection');
}
