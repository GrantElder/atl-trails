# Atlanta Trails — Route Planning

A project for planning bike, pedestrian, and trail routes in the Atlanta metro region using open data from the Atlanta Regional Commission (ARC).

## Data Sources

### Primary: Regional Bike, Ped, Trail Inventory (2024)

**Source:** [Atlanta Regional Commission Open Data](https://opendata.atlantaregional.com/maps/91ef2026b59f4d8b911cb1119e671909/about)

- **Dataset:** Regional Bike, Ped, Trail Inventory (2024)
- **License:** Open data; suitable for route planning and analysis
- **Coverage:** Metro Atlanta region
- **Format:** ArcGIS feature service (queryable via REST API)
- **Use case:** Primary source for bike lanes, shared-use paths, side paths, paved multi-use trails, and pedestrian facilities

### Alternative: ARC GeoJSON Repository

**Source:** [atlregional/aris](https://github.com/atlregional/aris) on GitHub

- **Dataset:** `Bike_Facility_Inventory_new.geojson`
- **License:** Open (GitHub repository)
- **Format:** GeoJSON — directly usable in most mapping and routing tools
- **Note:** May be older than the 2024 inventory; useful for offline use and quick prototyping

### Not Used: Regional Bike and Trail Inventory (2025)

**Source:** [GARC 2025 Inventory](https://opendata.atlantaregional.com/maps/GARC::regional-bike-and-trail-inventory-2025/about)

- **Status:** Not downloadable; license or terms are not permissive for this project
- **Note:** Monitor for future open release

---

## Project Structure

```
atltrails/
├── README.md           # This file
├── data/               # Cached or derived data (add to .gitignore if large)
├── scripts/            # Data fetch, processing, routing scripts
└── docs/               # Additional documentation
```

## Accessing the 2024 Data

The 2024 inventory is hosted on ArcGIS Open Data. You can:

1. **Interactive map:** Use the [Regional Bike-Ped Mapping Tool](https://garc.maps.arcgis.com/apps/webappviewer/index.html?id=ac9b81cce02741d98e967afff3c247f9) to explore existing and planned facilities.

2. **REST API:** Query the feature service with `f=geojson` for GeoJSON output. Example pattern:
   ```
   https://opendata.atlantaregional.com/api/.../query?where=1%3D1&outFields=*&f=geojson
   ```
   (Exact endpoint may vary; check the map’s “API” or “Developer” links.)

3. **ArcGIS API for Python:** Use `arcgis.features.FeatureLayer` to query and export to GeoJSON or other formats.

## Route Planning Tools

Possible tools for building routes on this network:

- **OSRM** — Open Source Routing Machine (bike/ped profiles)
- **GraphHopper** — Routing engine with bike and pedestrian support
- **OSMnx** — Python library for street network analysis (can incorporate bike/ped layers)
- **QGIS** — Desktop GIS for network analysis and visualization

## Contributing

To report missing trails or corrections in ARC data, contact [info@atlantaregional.org](mailto:info@atlantaregional.org).

## Pushing to GitHub

This repo is initialized with git. To create a GitHub repository and push:

1. Create a new repository on [GitHub](https://github.com/new) (e.g. `atltrails`).
2. Add the remote and push:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/atltrails.git
   git branch -M main
   git push -u origin main
   ```

## References

- [ARC Bicycle & Pedestrian Planning](https://atlantaregional.org/what-we-do/transportation-planning/bicycle-pedestrian/)
- [Regional Bike-Ped Mapping Tool](https://atlantaregional.org/whats-next-atl/articles/regional-bike-ped-mapping-tool-makes-it-easy-to-find-the-nearest-path-and-whats-to-come/)
- [ARC Open Data (2024 Inventory)](https://opendata.atlantaregional.com/maps/91ef2026b59f4d8b911cb1119e671909/about)
