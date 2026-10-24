# Chattanooga / Hamilton County GIS — St. Elmo (37409)

Chattanooga walk flow (open in a browser; serve over http):

1. **Mapping** — [`explore/mapping.html`](../explore/mapping.html)
2. **Routing** — [`explore/routing.html`](../explore/routing.html)
3. **Navigation** — [`explore/navigation.html`](../explore/navigation.html)

Boundary pickers:

| Type | Source | Name field | St. Elmo value |
|------|--------|------------|----------------|
| Historic (local) | `Live_Chatt/MapServer/18` | `DISTRICT` | `St. Elmo` |
| Historic (national) | `Live_Chatt/MapServer/19` | `DISTRICT` | `St. Elmo` |
| Neighborhood association | [ChattaData 2025](https://services.arcgis.com/UnTXoPXBYERF0OH6/arcgis/rest/services/Chattanooga_Neighborhood_Associations_2025/FeatureServer/1) | `name` | `Community Association of Historic St. Elmo` |
| ZIP | `Live_Chatt/MapServer/17` | `ZIPCODE` | `37409` |

Roads/alleys are clipped with `geometryType=esriGeometryPolygon` + the selected rings (not a fixed bbox).

Basemap on the explorer: OpenStreetMap tiles only (no Carto).

## Directed graph (after map query)

Built client-side by [`explore/graph.js`](../explore/graph.js); view + download on the explorer.

| Input | Use |
|-------|-----|
| Block_lc geometry + `Shape__Length` (ft) | Edge shapes and length |
| MSAG `OneWayCode` (`B` / `F` / `T`) | Vehicle one-way metadata (spatial match) |

Semantics:

- **Walk mode (default):** each undirected piece → **two** directed edges (either way). Vehicle one-way is kept on the edge as `vehicle_one_way` but does not remove a direction.
- **Drive mode:** `F` = along coord order only, `T` = reverse only, `B` = both.
- **Mid-splits:** if a snapped node falls on another segment’s interior (~2 m), that segment is split so the junction is a real node.

Length fields on every edge: `length_ft`, `length_m`, `length_mi` (from `Shape__Length` proportioned after splits, else haversine).

Schema reference: [`schema/graph.yaml`](../schema/graph.yaml).

## Routing

From **Mapping**, **Next: Routing** writes the graph to `localStorage` (`atltrails.routingGraph`) and opens Routing.

| Goal | Optimality |
|------|------------|
| Every roadway (revisits OK) | **Chinese Postman** — min length to cover all reachable roadways |
| As many new miles (no reuse) | Heuristic — longest trail is NP-hard |
| About N miles (no reuse) | Heuristic |

After the first route, **Tweak & regenerate** dials appear for the heuristic goals. Coverage = unique roadway miles ÷ network miles.

## Why `ZIP = 37409` failed

The 911 MSAG streets layer does **not** have a field named `ZIP`. Address ranges use left/right ZIP columns:

| Field | Meaning |
|-------|---------|
| `LeftZipCod` | ZIP on left side of centerline |
| `RightZipCo` | ZIP on right side of centerline |

Working MSAG query (343 segments for 37409):

```
https://mapsdev.hamiltontn.gov/hcwa03/rest/services/911_MSAG_Online_Map/MapServer/2/query
  ?where=LeftZipCod='37409' OR RightZipCo='37409'
  &outFields=*
  &outSR=4326
  &f=geojson
```

City **Roadways** (Hub dataset) also has no ZIP field — filter by map envelope or ZIP polygon.

## Authoritative roads (shapes + classification)

Hub item: [Roadways](https://chattadata-chattgis.hub.arcgis.com/datasets/88f4b23635f14456abaa47de61ce58ed_0/explore)

```
https://pwgis.chattanooga.gov/server/rest/services/HC_Base/Block_lc/FeatureServer/0
```

Useful fields: `FullName`, `FunctClass`, `FeatureType`, `StreetStatus`, `Ownership`.

In St. Elmo you will see classes like:

- `Local Street`
- `Urban Minor Collector` / `Urban Minor Arterial` / `Urban Major Collector`
- `FeatureType`: `Major Road` vs local

St. Elmo bbox query (WGS84 envelope):

```
…/FeatureServer/0/query
  ?where=1=1
  &geometry=-85.340,34.970,-85.300,35.000
  &geometryType=esriGeometryEnvelope
  &inSR=4326
  &spatialRel=esriSpatialRelIntersects
  &outFields=FullName,FunctClass,FeatureType,StreetStatus,Ownership
  &outSR=4326
  &f=geojson
```

Map viewer splits of the same street network:

| Service | Role |
|---------|------|
| [Local_Streets](https://pwgis.chattanooga.gov/arcgis/rest/services/Transportation/Local_Streets/MapServer) | ~75% local streets |
| [Functionally_Classified_Streets…](https://pwgis.chattanooga.gov/arcgis/rest/services/Transportation/Functionally_Classified_Streets_Collector_and_Above/MapServer) | collectors & above (~25%) |

## Rights-of-way & alleys

```
https://pwgis.chattanooga.gov/arcgis/rest/services/Transportation/Alleyways/MapServer/0
```

`STATUS` coded values: `OPEN`, `UNOPEN`, `CLOSED`, `CLOSED_W_COND`, `TEMPUSE`.

Same data as FeatureServer: `ROWandAlleys/ROWandAlleys`.

In the explorer graph (`explore/graph.js`), only **OPEN** alleys are navigable: each polygon is turned into an approximate centerline, endpoints are snapped onto nearby Block_lc road geometry, and edges are tagged `kind: alley` (drawn dashed / brown in the map and routing lab). Unopen and closed alleys stay as polygon overlays only.

## ZIP polygon outline

Use `f=json` (this older MapServer returns HTTP 400 for `f=geojson` on this layer):

```
https://mapsdev.hamiltontn.gov/hcwa03/rest/services/Live_Chatt/MapServer/17/query
  ?where=ZIPCODE='37409'
  &outSR=4326
  &f=json
```

## Hamilton County services root

https://mapsdev.hamiltontn.gov/hcwa03/rest/services

## City Public Works GIS root

https://pwgis.chattanooga.gov/arcgis/rest/services
