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
blog/           → Markdown entries (or journal/)
```

Each **trip report** or **journal entry** = markdown + frontmatter + optional photos/GPX refs. AI can:
- Generate entry from GPX metadata + your notes
- Create map embeds
- Suggest structure from templates

---

## Proposed Architecture

### Content Model

**Journal entry** (one walk or one day):
- Date, route name, duration, distance (from GPX)
- Photos (with captions)
- Map (GPX rendered)
- Freeform notes
- Optional: neighborhoods explored, trail segments used

**Trip report** (multi-day or themed):
- Overview
- Day-by-day entries (or linked journal entries)
- Map of full route
- Highlights, learnings

**Tool / meta post**:
- "Here's how I sync GPX from Strava"
- "AI prompt for turning GPX + photos into a journal entry"
- Links to scripts, configs

### Publishing Pipeline (AI-Assisted)

```
[Walk] → iOS tracker → GPX/FIT
                    ↓
[Home] → Sync to Strava/Health → Export GPX to activities/
                    ↓
[When inspired] → Add photos to content/
                    ↓
[AI or you] → Draft markdown (blog/2025-03-15-midtown-stone-mountain.md)
                    ↓
[Build] → Static site (Eleventy, etc.) → Deploy
```

**Key:** The draft can be AI-generated from: GPX metadata + photo filenames + a few bullet points from you. You edit, commit, push.

### Site Structure (Portal + Blog + Tools)

```
/                 → Landing: about, latest walks, link to journal
/journal          → Chronological entries (or /blog)
/journal/2025-03  → March 2025 entries
/activities       → Optional: list of GPX files, maybe map view
/tools            → "Cool tools" — scripts, prompts, how-tos
/about            → The project, the habit, the why
```

---

## What to Build (and What AI Can Generate)

| Component | You | AI |
|-----------|-----|-----|
| Walk & record | ✓ | — |
| Sync, export GPX | ✓ (or script) | — |
| Add photos | ✓ | — |
| Draft journal entry | Bullet points | Full markdown from template |
| Map embed | — | Script/component from GPX |
| Site generator config | — | Eleventy/SSG setup |
| RSS, search | — | Config |
| "Cool tools" posts | Idea | Draft + code |

**Principle:** You do the walking and the light editing. AI does the scaffolding and first draft.

---

## Minimal Viable Journal

To start without overbuilding:

1. **activities/** — GPX files, named by date: `2025-03-15-midtown-explore.gpx`
2. **blog/** or **journal/** — One markdown file per entry. Template:
   ```markdown
   ---
   date: 2025-03-15
   route: Midtown → Piedmont Park
   distance: 4.2 mi
   gpx: ../activities/2025-03-15-midtown-explore.gpx
   ---
   # March 15 — Midtown wander
   [Your notes. Photos linked below.]
   ```
3. **Static site** — When ready: Eleventy or similar, single-command build
4. **Deploy** — GitHub Pages, Vercel, or Netlify

No database. No CMS. Markdown + GPX + images. Git as the system of record.

---

## References

- [Crazy Guy on a Bike](https://www.crazyguyonabike.com) — Journal structure, maps, photos, community
- [Neil Gunton](https://www.neilgunton.com) — Personal site, articles
- [Creating a Journal With Eleventy](https://www.simplethread.com/creating-a-journal-with-eleventy/)
- [DriftNotes](https://rohitfarmer.com/posts/2025/driftnotes/) — Minimal journal system
- [Day One → Static Site](https://lukecod.es/2016/12/06/building-a-day-one-journal-as-a-static-site/)
