# Architecture: Journaling, Trip Reports & Digital Publishing

Thinking through how sites like [neilgunton.com](https://www.neilgunton.com) and [Crazy Guy on a Bike](https://www.crazyguyonabike.com) structure journals—and how that maps to your goals: **walking habit, journalling/trip reporting, sharing cool tools**, with AI building the publishing infrastructure.

---

## Neil Gunton's Model: What to Learn From

Neil Gunton runs **Crazy Guy on a Bike** (crazyguyonabike.com)—a platform for bicycle touring journals. His personal site (neilgunton.com) hosts articles, resume, and project links. The journal architecture is the instructive part.

### Crazy Guy on a Bike: Journal Structure

Each **journal** = one trip/tour. Each journal has:

| Section | Purpose |
|---------|---------|
| **Contents** | Overview, table of contents |
| **Latest** | Most recent entries (chronological feed) |
| **Thumbnails** | Photo gallery |
| **Slideshow** | Photo-first narrative |
| **Maps** | Route visualization (GPX/tracks on map) |
| **Author** | Who wrote it |
| **Guestbook** | Comments, community |
| **Printable** | Export for offline/archive |
| **Edit** | Author can update entries |

**Pattern:** Trip → multiple entries → photos + maps + text. Authors update *during* the trip. It's an **ongoing narrative**, not a one-and-done post.

**Scale:** ~17k journals, millions of photos. The structure scales because each journal is self-contained but follows a consistent template.

### What Transfers to Your Use Case

- **Entry-based** — Each walk/exploration = one or more entries
- **Photos + maps** — GPX as the map layer; photos as memory triggers
- **Chronological** — Latest-first or day-by-day
- **Low friction** — Author can add content without fighting the system
- **Printable/exportable** — Archive-friendly, future-proof

---

## How People Actually Make Daily Journals

### Common Patterns

1. **Day-by-day files** — `2025-03-15.md`, `2025-03-16.md` or `journal/2025/03.md` with date headings
2. **Photo-first** — Photos as anchors; captions add context (3 min per photo = strong recall)
3. **Maps as anchor** — Geotagged photos + GPX route = geographic story
4. **Markdown** — Portable, Git-friendly, AI-friendly
5. **Static output** — Eleventy, DriftNotes, md2blog, etc. → HTML, RSS, search

### Friction vs. Habit

**Walking habit** = primary. **Journaling** = secondary. If journaling is hard, it won't happen.

- **Capture during/after walk** — Voice note, quick photo, or nothing; process later
- **Batch processing** — Weekly: "Here are my walks from March 10–16"
- **AI-assisted** — AI drafts from GPX + photos + bullet points; you edit
- **Templates** — Same structure every time = less decision fatigue

---

## Publishing Stack: Eleventy

**Tool:** [Eleventy](https://www.11ty.dev/) (11ty) — open source, MIT, minimal by default.

### Why Eleventy

- **Markdown in, HTML out** — Plain data format; AI can write markdown
- **One layout** — Header, nav, footer in one template; pages inherit
- **Extensible** — Add `journal/` collection later; add RSS; add data from JSON
- **Zero plugins to start** — Add only when needed
- **Static output** — No runtime; GitHub Pages, Vercel, Netlify

### Architecture

```
src/                    → Source (edit here)
├── _includes/
│   └── layout.njk      → One layout for all pages
├── css/
│   └── style.css      → Styles (passthrough)
├── index.md           → Purpose, vision, values
├── march.md           → March plans
├── trails.md          → Atlanta trails
├── journal/           → (future) Journal entries
│   └── 2025-03-15.md
└── ARCHITECTURE.md    → This file (passthrough)

docs/                  → Output (generated, do not edit)
├── index.html
├── march/
│   └── index.html
├── trails/
│   └── index.html
├── css/
└── ARCHITECTURE.md
```

### Extensibility Path

1. **Now:** Pages as markdown; one layout
2. **Add journal:** Create `src/journal/2025-03-15.md` with frontmatter; add collection in config; add journal listing page
3. **Add RSS:** `@11ty/eleventy-plugin-rss` when ready
4. **Add data:** `src/_data/trails.json` for trail info; reference in templates
5. **AI workflow:** AI writes markdown → you edit → `npm run build` → push

---

## Your Stack: Goals First

| Goal | Implication |
|------|-------------|
| **Keep walking habit** | Recording (iOS) + sync is enough. Journal is optional. |
| **Start journalling/trip reporting** | Need: entry format, photos, maps, low-friction workflow |
| **Share cool tools** | The infrastructure (scripts, templates, AI prompts) is part of the content |
| **AI builds the tools** | Design for: markdown in, static site out; AI fills the gaps |

### Source of Truth: GitHub

```
activities/     → GPX/FIT (the raw data)
content/        → Photos, maps, assets
src/            → Markdown, layouts (Eleventy source)
docs/           → Generated HTML (Eleventy output)
```

---

## References

- [Eleventy](https://www.11ty.dev/) — Static site generator
- [Crazy Guy on a Bike](https://www.crazyguyonabike.com) — Journal structure, maps, photos
- [Creating a Journal With Eleventy](https://www.simplethread.com/creating-a-journal-with-eleventy/)
