# Chattanooga / Hamilton County GIS — St. Elmo (37409)

Explorer page: [`explore/stelmo.html`](../explore/stelmo.html) (open in a browser; serve over http).

Boundary pickers:

| Type | Source | Name field | St. Elmo value |
|------|--------|------------|----------------|
| Historic (local) | `Live_Chatt/MapServer/18` | `DISTRICT` | `St. Elmo` |
| Historic (national) | `Live_Chatt/MapServer/19` | `DISTRICT` | `St. Elmo` |
| Neighborhood association | [ChattaData 2025](https://services.arcgis.com/UnTXoPXBYERF0OH6/arcgis/rest/services/Chattanooga_Neighborhood_Associations_2025/FeatureServer/1) | `name` | `Community Association of Historic St. Elmo` |
| ZIP | `Live_Chatt/MapServer/17` | `ZIPCODE` | `37409` |

Roads/alleys are clipped with `geometryType=esriGeometryPolygon` + the selected rings (not a fixed bbox).

Basemap on the explorer: OpenStreetMap tiles only (no Carto).

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
