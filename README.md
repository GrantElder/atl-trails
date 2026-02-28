# Atlanta Trails — Urban Exploring & Walking

A hobby project for Atlanta urban exploring: find trails, record walks on iOS, sync with fitness apps, and use **this GitHub repo as the source of truth**. Host a portal, blog, and personal updates—photos, maps, and routes—to promote being outdoors, multiuse trails, urban exploring, and Atlanta neighborhoods.

---

## The Workflow

1. **Find a trail** — e.g., Midtown → Stone Mountain, or pick neighborhoods to explore
2. **Start fitness tracker** — Record on iPhone (Apple Workout, Strava, or GPS app)
3. **Explore** — Walk with loose goals: follow a trail, wander neighborhoods, or improvise
4. **Sync when home** — Push to Strava, Apple Health, and other fitness apps
5. **Archive here** — Export GPX/FIT, add to this repo, optionally with photos or notes
6. **Share** — Portal, blog, and updates from the repo

---

## Source of Truth: This Repository
Published at trails.grantelder.com

- **Activities** — GPX/FIT files, route metadata
- **Content** — Photos, maps, writeups for interesting explorations
- **Updates** — Blog posts, personal notes, neighborhood highlights

Fitness apps (Strava, Apple Health, etc.) sync for daily use; this repo is the long-term archive and public record.

---

## Project Vision

- **Urban exploring** — Walk and document routes across Atlanta
- **Loose goals** — Choose a trail or neighborhood, then explore freely
- **Promote** — Outdoors, multiuse trails, urban exploring, Atlanta neighborhoods
- **Hobby** — Personal project, shared publicly
- **Portal & blog** — Hosted site for updates, photos, maps, and route highlights

---

## Trail Discovery

**Source:** [Regional Bike, Ped, Trail Inventory (2024)](https://opendata.atlantaregional.com/maps/91ef2026b59f4d8b911cb1119e671909/about)

**Interactive map:** [ARC Bike-Ped Mapping Tool](https://garc.maps.arcgis.com/apps/webappviewer/index.html?id=ac9b81cce02741d98e967afff3c247f9)

Use to find:
- Shared-use paths, side paths, bike lanes, paved multi-use trails
- Filter by type, location, length; toggle existing vs planned
- Example routes: Midtown → Stone Mountain, BeltLine segments, neighborhood loops

---

## iOS Recording & Sync

### Recording on iPhone

| Option | How | Export |
|--------|-----|--------|
| **Apple Workout** | Built-in; start "Outdoor Walk" | Via HealthKit → GpxExport, WorkoutExporter, or TrailSync |
| **Strava** | Record in Strava app | Syncs to Strava; export GPX via strava2gpx / GPXBridge |
| **iOS Open GPX Tracker** | [GitHub](https://github.com/knorfield/iOS-Open-GPX-Tracker-1) | Direct GPX export |

### Export from Apple Health / Workouts

| Tool | Purpose |
|------|---------|
| [GpxExport](https://github.com/pilif/GpxExport) | HealthKit workouts → GPX |
| [WorkoutExporter](https://github.com/WorkoutExporter/WorkoutExporter) | Apple Watch workouts → shareable files |
| [TrailSync](https://github.com/matvdg/TrailSync) | Health → GPX, merge tracks, sync across devices |

### Sync When Home

1. Workout finishes → syncs to Apple Health (automatic)
2. Strava: record in Strava, or import from Health via Strava
3. Export GPX/FIT → save to `activities/` in this repo
4. Optional: CubeTrek, Viking, or similar for visualization

---

## Website

**Stack:** [Eleventy](https://www.11ty.dev/) — open source static site generator. Markdown → HTML. One layout, extensible.

### Build & Run

```bash
npm install
npm run build    # Output to docs/
npm start       # Dev server with live reload
```

### Deploy to GitHub Pages (Free)

**Automated:** Push to `main` triggers the GitHub Actions workflow. Build runs on GitHub; no local Node required.

1. **Settings** → **Pages** → **Build and deployment**
2. **Source:** Select **GitHub Actions**
3. Site: `https://grantelder.github.io/atl-trails/` (or custom domain below)

### Custom Domain: trails.grantelder.com

1. **Settings** → **Pages** → **Custom domain**: enter `trails.grantelder.com` → **Save**
2. **DNS** (at your domain registrar): Add a CNAME record:
   - **Name:** `trails` (or `trails.grantelder.com` depending on provider)
   - **Value:** `GrantElder.github.io`
3. Wait for DNS propagation (minutes to hours). GitHub will show a green check when ready.
4. Optionally enable **Enforce HTTPS**.

---

## Project Structure

```
atltrails/
├── README.md
├── activities/         # GPX/FIT files, route metadata (source of truth)
├── content/            # Photos, maps, writeups for interesting explorations
├── blog/               # Blog posts, updates (or use docs/)
├── data/               # Cached trail data, scripts output
├── scripts/            # Fetch, convert, sync scripts
├── docs/               # Website (index, march, trails) + ARCHITECTURE.md
```

---

## File Formats

- **GPX** — Universal; CubeTrek, most tools, GitHub-friendly
- **FIT** — Garmin/Strava; convert with [fit2gpx](https://fit2gpx.readthedocs.io/) if needed

---

## Open Source Tools Reference

| Category | Tools |
|----------|-------|
| **iOS recording** | Apple Workout, Strava, [iOS Open GPX Tracker](https://github.com/knorfield/iOS-Open-GPX-Tracker-1) |
| **HealthKit export** | [GpxExport](https://github.com/pilif/GpxExport), [WorkoutExporter](https://github.com/WorkoutExporter/WorkoutExporter), [TrailSync](https://github.com/matvdg/TrailSync) |
| **Strava → GPX** | [GPXBridge](https://github.com/dreamiurg/gpxbridge), [strava2gpx](https://github.com/jime567/strava2gpx) |
| **Visualization** | [CubeTrek](https://cubetrek.com/), [Viking](https://github.com/viking-gps/viking) |

---

## GitHub Publishing

### First-time push

1. Create repo at [github.com/new](https://github.com/new) (e.g. `atltrails`)
2. Push:
   ```powershell
   cd "c:\Users\Grant Elder\Documents\atltrails"
   git remote add origin https://github.com/YOUR_USERNAME/atltrails.git
   git branch -M main
   git push -u origin main
   ```

### Ongoing

- Add activities: `git add activities/*.gpx` → commit → push
- Add content: photos, maps, blog posts → commit → push
- Portal: edit `src/*.md` → `npm run build` → push → GitHub Pages serves `docs/`

---

## References

- [ARC Bike-Ped Mapping Tool](https://garc.maps.arcgis.com/apps/webappviewer/index.html?id=ac9b81cce02741d98e967afff3c247f9)
- [ARC Open Data (2024 Inventory)](https://opendata.atlantaregional.com/maps/91ef2026b59f4d8b911cb1119e671909/about)
- [CubeTrek](https://cubetrek.com/) — GPX/FIT visualization
