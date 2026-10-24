/**
 * Build a directed road graph from GeoJSON line features.
 *
 * Walk mode: every undirected segment becomes two directed edges (both ways),
 * even if the source marks the street one-way for vehicles.
 * Drive mode: respects OneWayCode B|F|T (MSAG / ESRI convention).
 *
 * Mid-segment junctions: if a snapped node lands on another segment's interior,
 * that segment is split so connectivity is at a real node.
 */
(function (global) {
  const FT_PER_M = 1 / 0.3048;
  const MI_PER_FT = 1 / 5280;

  function haversineM(a, b) {
    const R = 6371000;
    const toRad = Math.PI / 180;
    const dLat = (b[1] - a[1]) * toRad;
    const dLon = (b[0] - a[0]) * toRad;
    const lat1 = a[1] * toRad;
    const lat2 = b[1] * toRad;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function chainLengthM(coords) {
    let sum = 0;
    for (let i = 1; i < coords.length; i++) sum += haversineM(coords[i - 1], coords[i]);
    return sum;
  }

  function localProjector(coordsList) {
    let lon = 0, lat = 0, n = 0;
    for (const c of coordsList) {
      for (const p of c) {
        lon += p[0];
        lat += p[1];
        n++;
      }
    }
    const oLon = n ? lon / n : 0;
    const oLat = n ? lat / n : 0;
    const mPerDegLat = 111320;
    const mPerDegLon = 111320 * Math.cos((oLat * Math.PI) / 180);
    return {
      toXY(lonLat) {
        return {
          x: (lonLat[0] - oLon) * mPerDegLon,
          y: (lonLat[1] - oLat) * mPerDegLat
        };
      },
      toLonLat(xy) {
        return [oLon + xy.x / mPerDegLon, oLat + xy.y / mPerDegLat];
      }
    };
  }

  function dist2(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  /** Closest point on polyline in local meters. Returns { dist, tAlong, point, segI, tOnSeg }. */
  function closestOnLine(xy, lineXY) {
    let best = { dist: Infinity, tAlong: 0, point: lineXY[0], segI: 0, tOnSeg: 0 };
    let along = 0;
    for (let i = 0; i < lineXY.length - 1; i++) {
      const a = lineXY[i];
      const b = lineXY[i + 1];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const len2 = abx * abx + aby * aby;
      let t = 0;
      if (len2 > 0) t = ((xy.x - a.x) * abx + (xy.y - a.y) * aby) / len2;
      t = Math.max(0, Math.min(1, t));
      const p = { x: a.x + t * abx, y: a.y + t * aby };
      const d = Math.sqrt(dist2(xy, p));
      const segLen = Math.sqrt(len2);
      if (d < best.dist) {
        best = { dist: d, tAlong: along + t * segLen, point: p, segI: i, tOnSeg: t };
      }
      along += segLen;
    }
    return best;
  }

  function interpolateCoords(coords, lineXY, hit, project) {
    // Rebuild lon/lat coords split at hit: walk until segI, then insert hit point
    const outA = [];
    const outB = [];
    for (let i = 0; i <= hit.segI; i++) outA.push(coords[i]);
    const hitLL = project.toLonLat(hit.point);
    const lastA = outA[outA.length - 1];
    if (haversineM(lastA, hitLL) > 0.05) outA.push(hitLL);
    outB.push(hitLL);
    for (let i = hit.segI + 1; i < coords.length; i++) outB.push(coords[i]);
    // If hit is very close to a vertex already in A, avoid tiny stubs
    return { a: outA, b: outB };
  }

  function normalizeOneWay(code) {
    if (code == null || code === "") return "B";
    const c = String(code).trim().toUpperCase();
    if (c === "B" || c === "FT" || c === "TF" || c === "F" || c === "T") {
      if (c === "FT") return "F";
      if (c === "TF") return "T";
      return c;
    }
    return "B";
  }

  function flattenLineFeatures(features) {
    const out = [];
    let i = 0;
    for (const f of features || []) {
      const g = f.geometry;
      if (!g) continue;
      const props = f.properties || {};
      const lines =
        g.type === "LineString"
          ? [g.coordinates]
          : g.type === "MultiLineString"
            ? g.coordinates
            : [];
      for (const coords of lines) {
        if (!coords || coords.length < 2) continue;
        const clean = coords.map((c) => [Number(c[0]), Number(c[1])]);
        const shapeFt = Number(props.Shape__Length ?? props["Shape.STLength()"] ?? NaN);
        const kind = props.kind || props.navigable_kind || "road";
        out.push({
          uid: `src-${props.OBJECTID ?? props.OBJECTID_1 ?? i}-${out.length}`,
          objectId: props.OBJECTID ?? props.OBJECTID_1 ?? null,
          name: props.FullName || props.Name || props.StreetName || "",
          kind,
          props,
          coords: clean,
          lengthFtHint: Number.isFinite(shapeFt) && shapeFt > 0 ? shapeFt : null,
          oneWay: normalizeOneWay(props.OneWayCode ?? props.one_way ?? props.ONEWAY)
        });
      }
      i++;
    }
    return out;
  }

  function ringCoords(geom) {
    if (!geom) return null;
    if (geom.type === "Polygon") return geom.coordinates?.[0] || null;
    if (geom.type === "MultiPolygon") return geom.coordinates?.[0]?.[0] || null;
    return null;
  }

  /** Approximate alley centerline from a thin ROW polygon (diameter + interior samples). */
  function polygonToCenterline(ring) {
    if (!ring || ring.length < 3) return null;
    const pts = ring.map((p) => [Number(p[0]), Number(p[1])]);
    // drop closing duplicate
    if (
      pts.length > 1 &&
      pts[0][0] === pts[pts.length - 1][0] &&
      pts[0][1] === pts[pts.length - 1][1]
    ) {
      pts.pop();
    }
    if (pts.length < 2) return null;

    let best = { d: -1, i: 0, j: 1 };
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = haversineM(pts[i], pts[j]);
        if (d > best.d) best = { d, i, j };
      }
    }
    const a = pts[best.i];
    const b = pts[best.j];
    if (best.d < 1) return null; // tiny scrap

    const coords = [a];
    for (const t of [0.25, 0.5, 0.75]) {
      coords.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    coords.push(b);
    return coords;
  }

  function collectRoadSamplePoints(roadFeatures) {
    const samples = [];
    for (const f of roadFeatures || []) {
      const g = f.geometry;
      if (!g) continue;
      const lines =
        g.type === "LineString"
          ? [g.coordinates]
          : g.type === "MultiLineString"
            ? g.coordinates
            : [];
      for (const line of lines) {
        if (!line || line.length < 2) continue;
        for (let i = 0; i < line.length - 1; i++) {
          const a = [Number(line[i][0]), Number(line[i][1])];
          const b = [Number(line[i + 1][0]), Number(line[i + 1][1])];
          samples.push(a);
          // densify long segments a bit for snapping
          const d = haversineM(a, b);
          const steps = Math.min(8, Math.max(1, Math.floor(d / 8)));
          for (let s = 1; s < steps; s++) {
            const t = s / steps;
            samples.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
          }
        }
        samples.push([
          Number(line[line.length - 1][0]),
          Number(line[line.length - 1][1])
        ]);
      }
    }
    return samples;
  }

  function snapPointToSamples(pt, samples, maxM) {
    let best = null;
    for (const s of samples) {
      const d = haversineM(pt, s);
      if (d > maxM) continue;
      if (!best || d < best.d) best = { d, pt: s };
    }
    return best;
  }

  /**
   * Convert OPEN alley polygons into navigable LineString features and snap
   * endpoints onto nearby road geometry so they join the walk graph.
   */
  function openAlleysToNavFeatures(alleyFeatures, roadFeatures, options = {}) {
    const connectM = options.connectMeters ?? 22;
    const samples = collectRoadSamplePoints(roadFeatures);
    const out = [];
    let n = 0;
    for (const f of alleyFeatures || []) {
      const props = f.properties || {};
      const status = String(props.STATUS || "").toUpperCase();
      if (status && status !== "OPEN") continue;

      const ring = ringCoords(f.geometry);
      let coords = polygonToCenterline(ring);
      if (!coords || coords.length < 2) continue;

      const startSnap = snapPointToSamples(coords[0], samples, connectM);
      const endSnap = snapPointToSamples(coords[coords.length - 1], samples, connectM);
      // Need at least one road join so the alley isn't a floating component
      if (!startSnap && !endSnap) continue;
      if (startSnap) coords[0] = startSnap.pt;
      if (endSnap) coords[coords.length - 1] = endSnap.pt;

      // Avoid zero-length after snap
      if (haversineM(coords[0], coords[coords.length - 1]) < 2) continue;

      const from = String(props.FROM_ || "").trim();
      const to = String(props.TO_ || "").trim();
      const pdf = String(props.NAME_PDF || "").trim();
      let name = "Open alley";
      if (from && to) name = `Alley (${from} → ${to})`;
      else if (from) name = `Alley off ${from}`;
      else if (pdf) name = `Alley ${pdf}`;

      const lenM = chainLengthM(coords);
      out.push({
        type: "Feature",
        properties: {
          OBJECTID: props.OBJECTID ?? props.ID ?? `alley-${n}`,
          FullName: name,
          Name: name,
          FeatureType: "Alley",
          FunctClass: "Alley",
          StreetStatus: "Open Alley",
          kind: "alley",
          navigable_kind: "alley",
          alley_status: status || "OPEN",
          alley_from: from,
          alley_to: to,
          Shape__Length: lenM * FT_PER_M,
          _alleySnapStartM: startSnap ? Math.round(startSnap.d * 10) / 10 : null,
          _alleySnapEndM: endSnap ? Math.round(endSnap.d * 10) / 10 : null
        },
        geometry: { type: "LineString", coordinates: coords }
      });
      n++;
    }
    return out;
  }

  /**
   * Attach MSAG OneWayCode onto Block_lc features by nearest mid-point match.
   */
  function attachOneWayFromMsag(roadFeatures, msagFeatures, maxDistM = 18) {
    const msag = flattenLineFeatures(msagFeatures).map((s) => {
      const mid = s.coords[Math.floor(s.coords.length / 2)];
      return { ...s, mid };
    });
    for (const f of roadFeatures || []) {
      const g = f.geometry;
      if (!g) continue;
      const coords =
        g.type === "LineString"
          ? g.coordinates
          : g.type === "MultiLineString"
            ? g.coordinates[0]
            : null;
      if (!coords || coords.length < 2) continue;
      const mid = coords[Math.floor(coords.length / 2)];
      let best = null;
      for (const m of msag) {
        const d = haversineM(mid, m.mid);
        if (d > maxDistM) continue;
        if (!best || d < best.d) best = { d, oneWay: m.oneWay, name: m.name };
      }
      if (best) {
        f.properties = f.properties || {};
        f.properties.OneWayCode = best.oneWay;
        f.properties._oneWayMatchM = Math.round(best.d * 10) / 10;
        f.properties._oneWayMatchName = best.name;
      }
    }
    return roadFeatures;
  }

  function build(roadFeatures, options = {}) {
    const mode = options.mode === "drive" ? "drive" : "walk";
    const snapM = options.snapMeters ?? 2;
    const snap2 = snapM * snapM;

    const raw = flattenLineFeatures(roadFeatures);
    if (!raw.length) {
      return {
        meta: { mode, snapMeters: snapM, built: new Date().toISOString() },
        nodes: [],
        edges: [],
        undirected: [],
        stats: { nodes: 0, undirected: 0, directed: 0, splits: 0, oneWayVehicle: 0 }
      };
    }

    const project = localProjector(raw.map((r) => r.coords));
    const segments = raw.map((r) => ({
      ...r,
      xy: r.coords.map((c) => project.toXY(c))
    }));

    // --- node registry ---
    const nodesByKey = new Map();
    const nodes = [];

    function nodeKey(xy) {
      const gx = Math.round(xy.x / snapM);
      const gy = Math.round(xy.y / snapM);
      return `${gx}:${gy}`;
    }

    function getNode(xy, lonLat) {
      const key = nodeKey(xy);
      let n = nodesByKey.get(key);
      if (n) return n;
      n = {
        id: `n${nodes.length}`,
        lon: lonLat[0],
        lat: lonLat[1],
        x: xy.x,
        y: xy.y,
        key
      };
      nodesByKey.set(key, n);
      nodes.push(n);
      return n;
    }

    // Seed endpoints
    for (const seg of segments) {
      getNode(seg.xy[0], seg.coords[0]);
      getNode(seg.xy[seg.xy.length - 1], seg.coords[seg.coords.length - 1]);
    }

    // Collect interior split points: every node near a segment interior
    let splitCount = 0;
    const splitsBySeg = segments.map(() => []);

    for (const node of [...nodes]) {
      const nxy = { x: node.x, y: node.y };
      for (let si = 0; si < segments.length; si++) {
        const seg = segments[si];
        const hit = closestOnLine(nxy, seg.xy);
        if (hit.dist > snapM) continue;
        const total = chainLengthM(seg.coords) || 1;
        // Use meter along from local polyline length
        let totalXY = 0;
        for (let i = 0; i < seg.xy.length - 1; i++) {
          totalXY += Math.sqrt(dist2(seg.xy[i], seg.xy[i + 1]));
        }
        const frac = totalXY > 0 ? hit.tAlong / totalXY : 0;
        if (frac < 0.02 || frac > 0.98) continue; // endpoint-ish
        splitsBySeg[si].push({
          frac,
          tAlong: hit.tAlong,
          point: hit.point,
          segI: hit.segI,
          tOnSeg: hit.tOnSeg,
          nodeId: node.id
        });
      }
    }

    // Materialize undirected pieces after splits
    const undirected = [];

    function pushPiece(seg, coords, xy) {
      if (coords.length < 2) return;
      const from = getNode(xy[0], coords[0]);
      const to = getNode(xy[xy.length - 1], coords[coords.length - 1]);
      if (from.id === to.id) return;
      const lenM = chainLengthM(coords);
      let lenFt;
      if (seg.lengthFtHint != null) {
        const parentM = chainLengthM(seg.coords) || lenM;
        lenFt = seg.lengthFtHint * (lenM / parentM);
      } else {
        lenFt = lenM * FT_PER_M;
      }
      undirected.push({
        id: `u${undirected.length}`,
        from: from.id,
        to: to.id,
        name: seg.name,
        objectId: seg.objectId,
        kind: seg.kind || "road",
        oneWay: seg.oneWay,
        length_m: Math.round(lenM * 100) / 100,
        length_ft: Math.round(lenFt * 100) / 100,
        length_mi: Math.round(lenFt * MI_PER_FT * 1e6) / 1e6,
        coords,
        props: {
          FunctClass: seg.props.FunctClass,
          FeatureType: seg.props.FeatureType,
          StreetStatus: seg.props.StreetStatus,
          Ownership: seg.props.Ownership,
          kind: seg.kind || "road",
          alley_from: seg.props.alley_from,
          alley_to: seg.props.alley_to
        }
      });
    }

    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      const splits = splitsBySeg[si];
      if (!splits.length) {
        pushPiece(seg, seg.coords, seg.xy);
        continue;
      }
      // Dedupe splits by frac
      splits.sort((a, b) => a.frac - b.frac);
      const uniq = [];
      for (const s of splits) {
        if (!uniq.length || Math.abs(s.frac - uniq[uniq.length - 1].frac) > 0.015) {
          uniq.push(s);
        }
      }
      splitCount += uniq.length;

      // Cut iteratively from remaining polyline
      let remCoords = seg.coords;
      let remXY = seg.xy;
      for (const sp of uniq) {
        const hit = closestOnLine(sp.point, remXY);
        if (hit.dist > snapM * 1.5) continue;
        const { a, b } = interpolateCoords(remCoords, remXY, hit, project);
        const aXY = a.map((c) => project.toXY(c));
        pushPiece(seg, a, aXY);
        remCoords = b;
        remXY = b.map((c) => project.toXY(c));
      }
      pushPiece(seg, remCoords, remXY);
    }

    // Expand to directed edges
    const edges = [];
    function addDirected(u, forward) {
      const coords = forward ? u.coords : [...u.coords].reverse();
      const from = forward ? u.from : u.to;
      const to = forward ? u.to : u.from;
      edges.push({
        id: `e${edges.length}`,
        from,
        to,
        undirected_id: u.id,
        name: u.name,
        objectId: u.objectId,
        kind: u.kind || "road",
        length_m: u.length_m,
        length_ft: u.length_ft,
        length_mi: u.length_mi,
        vehicle_one_way: u.oneWay,
        walk_bidirectional: true,
        direction: forward ? "along" : "against",
        coords,
        props: u.props
      });
    }

    let oneWayVehicle = 0;
    let alleyCount = 0;
    for (const u of undirected) {
      if (u.kind === "alley") alleyCount++;
      if (u.oneWay === "F" || u.oneWay === "T") oneWayVehicle++;
      if (mode === "walk") {
        addDirected(u, true);
        addDirected(u, false);
      } else {
        // drive: alleys still walkable both ways; vehicle one-way only on roads
        if (u.kind === "alley") {
          addDirected(u, true);
          addDirected(u, false);
        } else if (u.oneWay === "F") addDirected(u, true);
        else if (u.oneWay === "T") addDirected(u, false);
        else {
          addDirected(u, true);
          addDirected(u, false);
        }
      }
    }

    const slimNodes = nodes.map(({ id, lon, lat }) => ({ id, lon, lat }));

    return {
      meta: {
        mode,
        snapMeters: snapM,
        built: new Date().toISOString(),
        note:
          mode === "walk"
            ? "Walk mode: every segment is traversable both ways (vehicle one-way kept as metadata). OPEN alleys are navigable."
            : "Drive mode: F = along digitizing direction, T = against, B = both. Alleys remain bidirectional for walking graphs."
      },
      nodes: slimNodes,
      undirected,
      edges,
      stats: {
        nodes: slimNodes.length,
        undirected: undirected.length,
        directed: edges.length,
        splits: splitCount,
        oneWayVehicle,
        alleys: alleyCount,
        total_length_mi:
          Math.round(undirected.reduce((s, u) => s + u.length_mi, 0) * 1000) / 1000
      }
    };
  }

  function toGeoJSON(graph) {
    const nodeFeats = (graph.nodes || []).map((n) => ({
      type: "Feature",
      properties: { id: n.id, kind: "node" },
      geometry: { type: "Point", coordinates: [n.lon, n.lat] }
    }));
    const edgeFeats = (graph.edges || []).map((e) => ({
      type: "Feature",
      properties: {
        id: e.id,
        kind: "edge",
        navigable_kind: e.kind || "road",
        from: e.from,
        to: e.to,
        name: e.name,
        length_mi: e.length_mi,
        length_ft: e.length_ft,
        vehicle_one_way: e.vehicle_one_way,
        direction: e.direction
      },
      geometry: { type: "LineString", coordinates: e.coords }
    }));
    return {
      type: "FeatureCollection",
      features: [...edgeFeats, ...nodeFeats]
    };
  }

  function exportJSON(graph) {
    // Full payload for routing tools: directed arcs + undirected street pieces.
    return {
      meta: graph.meta,
      stats: graph.stats,
      nodes: graph.nodes,
      undirected: (graph.undirected || []).map((u) => ({
        id: u.id,
        from: u.from,
        to: u.to,
        name: u.name,
        objectId: u.objectId,
        kind: u.kind || "road",
        length_m: u.length_m,
        length_ft: u.length_ft,
        length_mi: u.length_mi,
        oneWay: u.oneWay,
        coords: u.coords,
        props: u.props
      })),
      edges: graph.edges.map((e) => ({
        id: e.id,
        from: e.from,
        to: e.to,
        undirected_id: e.undirected_id,
        name: e.name,
        objectId: e.objectId,
        kind: e.kind || "road",
        length_m: e.length_m,
        length_ft: e.length_ft,
        length_mi: e.length_mi,
        vehicle_one_way: e.vehicle_one_way,
        direction: e.direction,
        coords: e.coords,
        props: e.props
      }))
    };
  }

  global.RoadGraph = {
    build,
    attachOneWayFromMsag,
    openAlleysToNavFeatures,
    toGeoJSON,
    exportJSON,
    normalizeOneWay,
    haversineM
  };
})(typeof window !== "undefined" ? window : globalThis);
