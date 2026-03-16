# Braintrust — Release Notes

---

## v1.1.0 — 2026-03-17

### What's new since v1.0.4

---

### 🎬 Live AI Recommendations

The hand-curated pool of 9 picks has been replaced with a fully live recommendation engine.

- Claude analyses your collection and suggests a film tailored to your taste
- Each recommendation is enriched with real data: **IMDb score**, **Rotten Tomatoes score** (Fresh / Certified Fresh / Rotten icon), **director**, **screenplay credits**, and a personalised reason
- Movie stills pulled from TMDB scroll horizontally alongside the description
- Auto-retries if the suggestion is already in any of your lists
- Duplicate-safe: films in Collection, To Watch, Wildcard, Meh, and Don't Recommend are all excluded

---

### 📂 Five Categories

The single collection has been expanded into five distinct lists, each with its own tab:

| Tab | Purpose |
|---|---|
| **Collection** | Films you've already seen |
| **To Watch** 🍿 | Your watchlist |
| **Wildcard** 🎲 | Curious about but not committed |
| **Meh** 😐 | Seen it, didn't love it |
| **Don't Recommend** 👻 | Never suggest this again |

From the recommendation banner you can send a film directly to any category with a single click.

---

### 🗂 Category Navigation

- Animated **sliding indicator** moves between tabs on selection
- **Counts** shown on each tab update in real time
- A **compact nav** appears in the sticky header once you scroll past the main tab bar
- Empty categories show a friendly illustration instead of a blank page

---

### ↔️ Drag Across Categories

Drag any card from the grid and drop it onto a different tab to move it instantly. Drop zones highlight as you hover over them.

---

### ↕️ Sort Modes

Each category independently supports two sort orders, toggled per tab:

- **Preference** — manual drag-to-reorder (existing behaviour)
- **Date added** — most recently added first; drag is disabled in this mode

---

### 💾 Snapshots & Settings

A new **Settings page** (`/settings.html`) lets you:

- **Save a snapshot** of all five lists at any point in time
- **Restore** a snapshot by uploading a `.json` file or selecting a server-saved entry
- Auto-snapshot runs every **10 minutes** while the page is open
- Snapshots are stored both in `localStorage` and on disk in `/snapshots/`

---

### ↩️ Undo

Removing a card from any list shows a toast with a 5-second **Undo** button, restoring the card without data loss.

---

### ⚡️ Performance

- Each category renders into its own persistent DOM element — switching tabs no longer reloads images
- Grids are only re-rendered when the underlying data has actually changed (dirty flag)
- Fold textures are generated once per movie and cached for the session

---

### UI refinements

- Recommendation banner redesigned: poster + "Already Seen" / "One more try" on the left; description, ratings, and category buttons on the right
- All action buttons standardised to **36 px** height, **13 px** font
- Banner padding tightened to **32 px**
- Remove buttons (✕) appear on hover for each card across all categories
