/**
 * Turn-by-turn helpers for a Routing.run() result.
 * Snaps GPS to the route, builds maneuvers, bearings for the circular nav view.
 */
(function (global) {
  const ROUTE_KEY = "atltrails.navRoute";
  const GRAPH_KEY = "atltrails.routingGraph";

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

  /** Initial bearing degrees clockwise from north, a→b as [lon,lat]. */
  function bearingDeg(a, b) {
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const φ1 = a[1] * toRad;
    const φ2 = b[1] * toRad;
    const Δλ = (b[0] - a[0]) * toRad;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x =
      Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return ((Math.atan2(y, x) * toDeg) + 360) % 360;
  }

  function normalizeAngle(d) {
    let x = ((d + 180) % 360) - 180;
    if (x <= -180) x += 360;
    return x;
  }

  function classifyTurn(deltaDeg) {
    const d = normalizeAngle(deltaDeg);
    const a = Math.abs(d);
    if (a < 25) return { kind: "straight", label: "Continue straight", icon: "↑" };
    if (a > 150) return { kind: "uturn", label: "Make a U-turn", icon: "↩" };
    if (d < 0) {
      if (a < 55) return { kind: "slight-left", label: "Bear left", icon: "↖" };
      if (a < 120) return { kind: "left", label: "Turn left", icon: "←" };
      return { kind: "sharp-left", label: "Sharp left", icon: "↙" };
    }
    if (a < 55) return { kind: "slight-right", label: "Bear right", icon: "↗" };
    if (a < 120) return { kind: "right", label: "Turn right", icon: "→" };
    return { kind: "sharp-right", label: "Sharp right", icon: "↘" };
  }

  function stepEndBearing(step) {
    const c = step.coords || [];
    if (c.length < 2) return 0;
    return bearingDeg(c[c.length - 2], c[c.length - 1]);
  }

  function stepStartBearing(step) {
    const c = step.coords || [];
    if (c.length < 2) return 0;
    return bearingDeg(c[0], c[1]);
  }

  function stepMid(step) {
    const c = step.coords || [];
    if (!c.length) return null;
    return c[Math.floor(c.length / 2)];
  }

  /**
   * Build navigable legs from route steps.
   * One maneuver per street step; turn instruction describes how you enter that street.
   */
  function buildManeuvers(route) {
    const steps = route?.steps || [];
    if (!steps.length) return [];

    const mans = [];
    let cumMi = 0;
    const totalMi = route.length_mi || steps.reduce((s, x) => s + (x.length_mi || 0), 0);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const prev = i > 0 ? steps[i - 1] : null;
      let turn;
      let approachBearing = stepStartBearing(step);
      if (!prev) {
        turn = { kind: "depart", label: "Start", icon: "●" };
      } else {
        const inB = stepEndBearing(prev);
        const outB = stepStartBearing(step);
        turn = classifyTurn(outB - inB);
        approachBearing = inB;
      }
      const name = step.name || "unnamed street";
      const alley = step.kind === "alley";
      let instruction;
      if (i === 0) {
        instruction = `Start on ${name}`;
      } else if (turn.kind === "straight") {
        instruction = `Continue on ${name}`;
      } else {
        instruction = `${turn.label} onto ${name}`;
      }
      if (alley) instruction += " (alley)";

      const coords = step.coords || [];
      const at = coords[0] || stepMid(step);

      mans.push({
        index: i,
        stepIndex: i,
        instruction,
        turn,
        name,
        kind: step.kind || "road",
        length_mi: step.length_mi || 0,
        length_ft: step.length_ft || 0,
        length_m: (step.length_ft || 0) / 3.2808399,
        coords,
        at,
        approachBearing,
        departBearing: stepStartBearing(step),
        alongBearing: stepEndBearing(step),
        from: step.from,
        to: step.to,
        cum_mi_before: round4(cumMi),
        remain_mi_after: round4(Math.max(0, totalMi - cumMi - (step.length_mi || 0))),
        revisit: Boolean(step.revisit)
      });
      cumMi += step.length_mi || 0;
    }
    return mans;
  }

  function closestOnSegment(pt, a, b) {
    // local equirectangular
    const lat0 = ((a[1] + b[1]) / 2) * (Math.PI / 180);
    const kx = 111320 * Math.cos(lat0);
    const ky = 110540;
    const ax = a[0] * kx;
    const ay = a[1] * ky;
    const bx = b[0] * kx;
    const by = b[1] * ky;
    const px = pt[0] * kx;
    const py = pt[1] * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const lon = a[0] + (b[0] - a[0]) * t;
    const lat = a[1] + (b[1] - a[1]) * t;
    const dist = haversineM(pt, [lon, lat]);
    const bearing = bearingDeg(a, b);
    return { t, lon, lat, dist, bearing };
  }

  /** Snap lon/lat onto the route polyline; return maneuver index + progress. */
  function snapToRoute(maneuvers, lon, lat) {
    const pt = [lon, lat];
    let best = null;
    for (let mi = 0; mi < maneuvers.length; mi++) {
      const c = maneuvers[mi].coords || [];
      for (let i = 0; i < c.length - 1; i++) {
        const hit = closestOnSegment(pt, c[i], c[i + 1]);
        if (!best || hit.dist < best.dist) {
          best = {
            ...hit,
            maneuverIndex: mi,
            segI: i,
            coords: [hit.lon, hit.lat]
          };
        }
      }
    }
    return best;
  }

  function nearestStreetName(graph, lon, lat, maxM = 45) {
    const streets = graph?.undirected?.length ? graph.undirected : graph?.edges || [];
    let best = null;
    for (const e of streets) {
      const c = e.coords || [];
      for (let i = 0; i < c.length - 1; i++) {
        const hit = closestOnSegment([lon, lat], c[i], c[i + 1]);
        if (hit.dist > maxM) continue;
        if (!best || hit.dist < best.dist) {
          best = { ...hit, name: e.name || e.id, kind: e.kind || "road", id: e.id };
        }
      }
    }
    return best;
  }

  function saveNav(payload) {
    const envelope = {
      savedAt: new Date().toISOString(),
      ...payload
    };
    localStorage.setItem(ROUTE_KEY, JSON.stringify(envelope));
    return envelope;
  }

  function loadNav() {
    const raw = localStorage.getItem(ROUTE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function loadGraphEnvelope() {
    const raw = localStorage.getItem(GRAPH_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function round4(x) {
    return Math.round(x * 10000) / 10000;
  }

  function formatDist(meters) {
    if (meters == null || !Number.isFinite(meters)) return "—";
    if (meters < 15) return "now";
    if (meters < 160) return `${Math.round(meters / 5) * 5} m`;
    const ft = meters * 3.28084;
    if (ft < 900) return `${Math.round(ft / 50) * 50} ft`;
    return `${(meters / 1609.344).toFixed(2)} mi`;
  }

  function formatMi(mi) {
    if (mi == null || !Number.isFinite(mi)) return "—";
    return `${Number(mi).toFixed(2)} mi`;
  }

  global.Nav = {
    ROUTE_KEY,
    GRAPH_KEY,
    haversineM,
    bearingDeg,
    buildManeuvers,
    snapToRoute,
    nearestStreetName,
    saveNav,
    loadNav,
    loadGraphEnvelope,
    formatDist,
    formatMi,
    classifyTurn,
    normalizeAngle
  };
})(typeof window !== "undefined" ? window : globalThis);
