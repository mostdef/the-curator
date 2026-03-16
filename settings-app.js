const STORAGE_KEY   = 'braintrust_movies';
const WATCHLIST_KEY = 'braintrust_watchlist';
const MAYBE_KEY     = 'braintrust_maybe';
const BANNED_KEY    = 'braintrust_banned';

function applySnapshot(snap) {
  localStorage.setItem(STORAGE_KEY,   JSON.stringify(snap.movies    || []));
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(snap.watchlist || []));
  localStorage.setItem(MAYBE_KEY,     JSON.stringify(snap.maybe     || []));
  localStorage.setItem(BANNED_KEY,    JSON.stringify(snap.banned    || []));
}

function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function renderPreview(snap, container) {
  container.hidden = false;
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'snap-preview-header';
  header.innerHTML = `
    <div class="snap-preview-label">${snap.label || formatDate(snap.ts)}</div>
    <div class="snap-preview-counts">
      <span>🎬 ${(snap.movies || []).length} in collection</span>
      <span>🍿 ${(snap.watchlist || []).length} to watch</span>
      <span>🎲 ${(snap.maybe || []).length} wildcard</span>
      <span>👻 ${(snap.banned || []).length} don't recommend</span>
    </div>`;
  container.appendChild(header);

  const restoreBtn = document.createElement('button');
  restoreBtn.className = 'snap-restore-btn';
  restoreBtn.textContent = 'Restore this snapshot';
  restoreBtn.addEventListener('click', () => {
    applySnapshot(snap);
    restoreBtn.textContent = 'Restored ✓';
    restoreBtn.disabled = true;
    setTimeout(() => { window.location.href = 'movies.html'; }, 800);
  });
  container.appendChild(restoreBtn);
}

// File upload
const dropZone  = document.getElementById('snapshot-drop-zone');
const fileInput = document.getElementById('snapshot-file');
const browseBtn = document.getElementById('snapshot-browse-btn');
const preview   = document.getElementById('snapshot-preview');

browseBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  readFile(file);
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) readFile(file);
});

function readFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const snap = JSON.parse(e.target.result);
      if (!snap || typeof snap !== 'object') throw new Error();
      renderPreview(snap, preview);
    } catch {
      preview.hidden = false;
      preview.innerHTML = '<span class="snap-error">Invalid snapshot file.</span>';
    }
  };
  reader.readAsText(file);
}

// Load saved snapshots from server
async function loadServerSnapshots() {
  const list = document.getElementById('snapshot-list');
  try {
    const res = await fetch('/api/snapshot');
    const snaps = await res.json();
    list.innerHTML = '';
    if (!snaps.length) {
      list.innerHTML = '<span class="snapshot-list-empty">No snapshots yet.</span>';
      return;
    }
    snaps.forEach(snap => {
      const row = document.createElement('div');
      row.className = 'snap-row';

      const info = document.createElement('div');
      info.className = 'snap-row-info';
      info.innerHTML = `
        <span class="snap-row-label">${snap.label || formatDate(snap.ts)}</span>
        <span class="snap-row-counts">
          🎬 ${(snap.movies || []).length} &nbsp;
          🍿 ${(snap.watchlist || []).length} &nbsp;
          🎲 ${(snap.maybe || []).length} &nbsp;
          👻 ${(snap.banned || []).length}
        </span>`;

      const btn = document.createElement('button');
      btn.className = 'snap-row-btn';
      btn.textContent = 'Restore';
      btn.addEventListener('click', () => {
        applySnapshot(snap);
        btn.textContent = 'Restored ✓';
        btn.disabled = true;
        setTimeout(() => { window.location.href = 'movies.html'; }, 800);
      });

      row.appendChild(info);
      row.appendChild(btn);
      list.appendChild(row);
    });
  } catch {
    list.innerHTML = '<span class="snapshot-list-empty">Could not load snapshots.</span>';
  }
}

loadServerSnapshots();

document.getElementById('save-snapshot-btn').addEventListener('click', async function () {
  this.textContent = 'Saving…';
  this.disabled = true;
  const snap = {
    ts:        Date.now(),
    label:     new Date().toLocaleString(),
    movies:    JSON.parse(localStorage.getItem(STORAGE_KEY)   || '[]'),
    watchlist: JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]'),
    maybe:     JSON.parse(localStorage.getItem(MAYBE_KEY)     || '[]'),
    banned:    JSON.parse(localStorage.getItem(BANNED_KEY)    || '[]'),
  };
  try {
    const res = await fetch('/api/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snap),
    });
    if (res.ok) {
      this.textContent = 'Saved ✓';
      setTimeout(() => loadServerSnapshots(), 400);
    } else {
      this.textContent = 'Error — try again';
      this.disabled = false;
    }
  } catch {
    this.textContent = 'Error — try again';
    this.disabled = false;
  }
});
