/**
 * Trail / coverage routing on a RoadGraph export.
 *
 * Street identity (edgeMode):
 * - undirected: either walking direction is the same street (usual for walks)
 * - directed: A→B and B→A count separately toward uniqueness / reuse
 *
 * optimizeUnit:
 * - street: maximize / score unique street miles
 * - node: maximize / score unique junctions (still no street reuse on heuristics)
 *
 * Goals:
 * - max / target: heuristics (NP-hard; not guaranteed optimal)
 * - cover100: Chinese Postman on streets (optimal min length on a component)
 */
(function (global) {
  const STORAGE_KEY = "atltrails.routingGraph";

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

  function saveGraph(payload, meta = {}) {
    const envelope = {
      savedAt: new Date().toISOString(),
      areaName: meta.areaName || null,
      graphMode: meta.graphMode || null,
      graph: payload
    };
    // localStorage is shared across tabs (sessionStorage is not reliably).
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    return envelope;
  }

  function loadGraph() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function nearestNode(graph, lon, lat) {
    let best = null;
    for (const n of graph.nodes || []) {
      const d = haversineM([lon, lat], [n.lon, n.lat]);
      if (!best || d < best.d) best = { node: n, d };
    }
    return best;
  }

  function networkMiles(graph, edgeMode) {
    // Either-way: one length per street piece. By-direction: each arc counts.
    if (edgeMode === "directed") {
      return (graph.edges || []).reduce((s, e) => s + (e.length_mi || 0), 0);
    }
    if (graph.undirected?.length) {
      return graph.undirected.reduce((s, u) => s + (u.length_mi || 0), 0);
    }
    // Fallback: half the directed sum if undirected missing
    const directed = (graph.edges || []).reduce((s, e) => s + (e.length_mi || 0), 0);
    return directed / 2;
  }

  /** Multigraph adjacency for CPP / trails. */
  function buildStreetList(graph, edgeMode) {
    if (edgeMode === "directed") {
      return (graph.edges || []).map((e) => ({
        id: e.id,
        from: e.from,
        to: e.to,
        length_mi: e.length_mi,
        length_ft: e.length_ft,
        name: e.name,
        kind: e.kind || "road",
        coords: e.coords,
        undirected_id: e.undirected_id || e.id,
        directed: true
      }));
    }
    return (graph.undirected || []).map((u) => ({
      id: u.id,
      from: u.from,
      to: u.to,
      length_mi: u.length_mi,
      length_ft: u.length_ft,
      name: u.name,
      kind: u.kind || "road",
      coords: u.coords,
      undirected_id: u.id,
      directed: false
    }));
  }

  function buildAdj(streets, directed) {
    const out = new Map();
    function add(from, entry) {
      if (!out.has(from)) out.set(from, []);
      out.get(from).push(entry);
    }
    for (const s of streets) {
      add(s.from, { ...s, to: s.to, forward: true, coords: s.coords });
      if (!directed) {
        add(s.to, {
          ...s,
          to: s.from,
          forward: false,
          coords: [...s.coords].reverse()
        });
      }
    }
    return out;
  }

  // ---------- heuristics: max / target trail (no forced reuse) ----------

  /** User dials 0–100 (defaults are the “balanced” walk feel). */
  function normalizePrefs(raw = {}) {
    const n = (v, d) => {
      const x = Number(v);
      return Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : d;
    };
    return {
      // High = stay on course / same street; fewer twisty turns
      fewTurns: n(raw.fewTurns, 60),
      // High = prefer longer blocks when choosing the next street
      longBlocks: n(raw.longBlocks, 50),
      // High = favor new coverage; low = calmer / shorter-feeling routes
      coverageHunger: n(raw.coverageHunger, 55),
      // High = try more random restarts (wider search, slower)
      searchEffort: n(raw.searchEffort, 50),
      // High = more randomness within each walk (variety between Generate clicks)
      variety: n(raw.variety, 35)
    };
  }

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

  function edgeBearing(e) {
    const c = e.coords || [];
    if (c.length < 2) return null;
    return bearingDeg(c[0], c[1]);
  }

  function turnAngle(fromBearing, toBearing) {
    if (fromBearing == null || toBearing == null) return 0;
    return Math.abs(((toBearing - fromBearing + 540) % 360) - 180);
  }

  function countMeaningfulTurns(steps) {
    let n = 0;
    let prevB = null;
    for (const s of steps || []) {
      if (s.closure) continue;
      const b = edgeBearing(s);
      if (prevB != null && turnAngle(prevB, b) >= 35) n++;
      if (b != null) prevB = edgeBearing({ coords: (s.coords || []).slice(-2) }) ?? b;
    }
    return n;
  }

  function usedKey(edgeMode, step) {
    if (edgeMode === "undirected") {
      return step.undirected_id || step.id || step.edgeId;
    }
    return step.edgeId || step.id || step.undirected_id;
  }

  function findTrail(graph, edgeMode, options = {}) {
    const {
      startId,
      endId = null,
      closed = false,
      targetMi = null,
      rng = Math.random,
      optimizeUnit = "street"
    } = options;
    const prefs = normalizePrefs(options.prefs);
    const restarts = Math.max(
      12,
      Math.round(18 + (prefs.searchEffort / 100) * 70)
    );
    const streets = buildStreetList(graph, edgeMode);
    const directed = edgeMode === "directed";
    const out = buildAdj(streets, directed);
    const byId = new Map((graph.nodes || []).map((n) => [n.id, n]));
    const networkMi = networkMiles(graph, edgeMode);
    const goalId = closed ? startId : endId;
    const totalNodes = (graph.nodes || []).length;

    if (!byId.has(startId)) throw new Error(`Unknown start ${startId}`);

    let best = null;
    for (let r = 0; r < restarts; r++) {
      const baseJitter = 0.08 + (prefs.variety / 100) * 0.85;
      let cand = growTrail({
        out,
        edgeMode,
        startId,
        goalId,
        closed,
        targetMi,
        optimizeUnit,
        prefs,
        jitter: r === 0 ? baseJitter * 0.25 : baseJitter * (0.55 + rng() * 0.7),
        rng,
        byId
      });
      if (!cand) continue;
      if (goalId) {
        cand = ensureAtGoal(cand, out, edgeMode, goalId);
      } else {
        cand.closed_ok = true;
        cand.closure_mi = 0;
        cand.closure_steps = 0;
      }
      cand.turnCount = countMeaningfulTurns(cand.steps);
      if (
        !best ||
        trailScore(cand, { targetMi, goalId, closed, optimizeUnit, prefs }) >
          trailScore(best, { targetMi, goalId, closed, optimizeUnit, prefs })
      ) {
        best = cand;
      }
    }
    if (!best) {
      return emptyResult("No trail found from that start.", networkMi, totalNodes);
    }
    const unitLabel = optimizeUnit === "node" ? "junctions" : "street miles";
    const tripNote = closed
      ? "round trip (returns to start; return leg may reuse streets)"
      : goalId
        ? "start→end (finish leg may reuse streets)"
        : "open-ended";
    return finalizeTrail(best, edgeMode, networkMi, {
      optimal: false,
      optimizeUnit,
      total_nodes: totalNodes,
      trip_closed: Boolean(closed),
      goal_node_id: goalId,
      prefs,
      turn_count: best.turnCount || 0,
      method: targetMi != null
        ? `heuristic ~target mileage (${tripNote}); dials applied; not guaranteed optimal`
        : `heuristic max unique ${unitLabel} (${tripNote}; dials applied; NP-hard)`
    });
  }

  function trailScore(t, { targetMi, goalId, closed, optimizeUnit, prefs }) {
    const p = prefs || normalizePrefs();
    const needGoal = Boolean(goalId);
    const atGoal = !needGoal || t.nodeId === goalId;
    if (needGoal && !atGoal) return -1e12;
    const uniqueNodes = t.uniqueNodes || 0;
    const uniqueMi = t.uniqueMi || 0;
    const turns = t.turnCount != null ? t.turnCount : countMeaningfulTurns(t.steps);
    const closurePen = (t.closure_mi || 0) * (8 + (p.fewTurns / 100) * 18);
    const turnPen = turns * (0.4 + (p.fewTurns / 100) * 4.5);
    const hunger = 0.45 + (p.coverageHunger / 100) * 1.1;

    if (targetMi != null) {
      const exploreMi = Math.max(0, t.length_mi - (t.closure_mi || 0));
      const err = Math.abs(exploreMi - targetMi);
      const primary = optimizeUnit === "node" ? uniqueNodes * 40 : uniqueMi * 80;
      return 1e6 - err * 900 + primary * hunger - closurePen - turnPen;
    }
    if (optimizeUnit === "node") {
      return uniqueNodes * 5000 * hunger + uniqueMi * 20 - closurePen - turnPen;
    }
    return uniqueMi * 200 * hunger + uniqueNodes * 2 - closurePen - turnPen;
  }

  function growTrail({
    out,
    edgeMode,
    startId,
    goalId,
    closed,
    targetMi,
    optimizeUnit,
    prefs,
    jitter,
    rng,
    byId
  }) {
    const p = prefs || normalizePrefs();
    const used = new Set();
    const visited = new Set([startId]);
    const steps = [];
    let nodeId = startId;
    let length_mi = 0;
    let length_ft = 0;
    let uniqueMi = 0;
    let lastBearing = null;
    let lastName = "";
    const maxSteps = Math.max(24, out.size * 8);

    for (let i = 0; i < maxSteps; i++) {
      const outs = (out.get(nodeId) || []).filter((e) => !used.has(usedKey(edgeMode, e)));
      if (!outs.length) break;

      const wrapping =
        targetMi != null && goalId && length_mi >= targetMi * 0.72;
      const pick = pickEdge(outs, {
        jitter,
        rng,
        preferReturn: wrapping || (closed && length_mi > 0 && rng() < 0.08),
        out,
        used,
        visited,
        edgeMode,
        optimizeUnit,
        prefs: p,
        lastBearing,
        lastName,
        goalId: wrapping || closed ? goalId || startId : null,
        byId
      });
      if (!pick) break;

      if (targetMi != null) {
        const next = length_mi + pick.length_mi;
        if (next > targetMi * 1.12 && length_mi >= targetMi * 0.88) {
          if (!goalId || nodeId === goalId) break;
        }
      }

      used.add(usedKey(edgeMode, pick));
      uniqueMi += pick.length_mi;
      steps.push(stepFrom(pick, nodeId));
      length_mi += pick.length_mi;
      length_ft += pick.length_ft;
      lastBearing = edgeBearing(pick);
      // End bearing of this segment for the next turn decision
      const c = pick.coords || [];
      if (c.length >= 2) lastBearing = bearingDeg(c[c.length - 2], c[c.length - 1]);
      lastName = pick.name || "";
      nodeId = pick.to;
      visited.add(nodeId);

      if (targetMi != null && length_mi >= targetMi && (!goalId || nodeId === goalId)) break;
    }

    if (goalId && nodeId !== goalId) {
      for (const pick of bfsPath(out, edgeMode, nodeId, goalId, used, 60)) {
        used.add(usedKey(edgeMode, pick));
        uniqueMi += pick.length_mi;
        steps.push(stepFrom(pick, nodeId));
        length_mi += pick.length_mi;
        length_ft += pick.length_ft;
        nodeId = pick.to;
        visited.add(nodeId);
      }
    }
    return {
      steps,
      nodeId,
      length_mi,
      length_ft,
      used,
      uniqueMi,
      uniqueNodes: visited.size
    };
  }

  function stepFrom(pick, from) {
    return {
      edgeId: pick.id || pick.edgeId,
      undirected_id: pick.undirected_id,
      from,
      to: pick.to,
      name: pick.name,
      kind: pick.kind || "road",
      length_mi: pick.length_mi,
      length_ft: pick.length_ft,
      coords: pick.coords,
      revisit: false
    };
  }

  function pickEdge(
    outs,
    {
      jitter,
      rng,
      preferReturn,
      out,
      used,
      visited,
      edgeMode,
      optimizeUnit,
      prefs,
      lastBearing,
      lastName,
      goalId,
      byId
    }
  ) {
    const p = prefs || normalizePrefs();
    const few = p.fewTurns / 100;
    const longB = p.longBlocks / 100;
    const hunger = p.coverageHunger / 100;

    const scored = outs.map((e) => {
      const remain = (out.get(e.to) || []).filter(
        (x) => !used.has(usedKey(edgeMode, x)) && usedKey(edgeMode, x) !== usedKey(edgeMode, e)
      ).length;
      const newNode = visited && !visited.has(e.to);
      const b = edgeBearing(e);
      const turn = turnAngle(lastBearing, b);
      const sameName =
        lastName && e.name && String(e.name).toLowerCase() === String(lastName).toLowerCase();

      let score;
      if (optimizeUnit === "node") {
        score = (newNode ? 80 * (0.5 + hunger) : 0) + remain * 3 + e.length_mi * (0.4 + longB);
        if (!newNode) score -= e.length_mi * 2;
      } else {
        const deadEnd = remain === 0 ? 22 : remain === 1 ? 7 : 0;
        score =
          e.length_mi * (2.2 + longB * 4.5) +
          remain * (0.6 + hunger * 1.4) +
          deadEnd * (0.5 + hunger * 0.8);
        if (newNode) score += 1 + hunger * 2;
      }

      // Prefer continuing straight / same street — the “enjoy the walk” dial
      if (lastBearing != null) {
        if (turn < 28) score += 14 * few;
        else if (turn < 55) score += 4 * few;
        else if (turn < 110) score -= 8 * few;
        else score -= 22 * few; // sharp / u-turn
      }
      if (sameName) score += 12 * few;

      if (preferReturn && goalId) {
        const a = byId.get(e.to);
        const g = byId.get(goalId);
        if (a && g) score += 40 / (1 + haversineM([a.lon, a.lat], [g.lon, g.lat]));
        if (e.to === goalId) score += 120;
      }
      score *= 1 + (rng() - 0.5) * jitter;
      return { e, score };
    });
    scored.sort((a, b) => b.score - a.score);
    // Fewer turns → pick more greedily from the top; high variety → wider top
    const topN = Math.max(2, Math.round(2 + (1 - few) * 2 + (p.variety / 100) * 3));
    const top = scored.slice(0, Math.min(topN, scored.length));
    const weights = top.map((_, i) => 1 / (1 + i * (0.6 + few)));
    let roll = rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < top.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return top[i].e;
    }
    return top[0]?.e || null;
  }

  function bfsPath(out, edgeMode, fromId, goalId, used, maxDepth) {
    if (fromId === goalId) return [];
    const q = [{ id: fromId, path: [] }];
    const seen = new Set([fromId]);
    while (q.length) {
      const cur = q.shift();
      if (cur.path.length >= maxDepth) continue;
      for (const e of out.get(cur.id) || []) {
        if (used && used.has(usedKey(edgeMode, e))) continue;
        const path = cur.path.concat([e]);
        if (e.to === goalId) return path;
        if (seen.has(e.to)) continue;
        seen.add(e.to);
        q.push({ id: e.to, path });
      }
    }
    return [];
  }

  /** Shortest path that may reuse streets — used to force return-to-start / reach end. */
  function bfsPathAny(out, edgeMode, fromId, goalId, maxDepth = 100) {
    return bfsPath(out, edgeMode, fromId, goalId, null, maxDepth);
  }

  /**
   * If the trail isn't at goalId, append a walk there (allowing reuse).
   * Closure steps are tagged so the UI can show the return leg clearly.
   */
  function ensureAtGoal(trail, out, edgeMode, goalId) {
    if (!goalId || !trail || trail.nodeId === goalId) {
      return {
        ...trail,
        closed_ok: !goalId || trail?.nodeId === goalId,
        closure_steps: 0,
        closure_mi: 0
      };
    }
    const path = bfsPathAny(out, edgeMode, trail.nodeId, goalId, 120);
    if (!path.length) {
      return {
        ...trail,
        closed_ok: false,
        closure_steps: 0,
        closure_mi: 0
      };
    }
    const steps = trail.steps.slice();
    let nodeId = trail.nodeId;
    let length_mi = trail.length_mi;
    let length_ft = trail.length_ft;
    let closure_mi = 0;
    const used = new Set(trail.used || []);
    const visited = new Set();
    // rebuild visited from steps
    if (steps[0]?.from) visited.add(steps[0].from);
    for (const s of steps) {
      visited.add(s.to);
      used.add(usedKey(edgeMode, s));
    }
    let closure_steps = 0;
    for (const pick of path) {
      const key = usedKey(edgeMode, pick);
      const revisit = used.has(key);
      const step = stepFrom(pick, nodeId);
      step.revisit = revisit;
      step.closure = true; // return / reach-end leg
      steps.push(step);
      used.add(key);
      length_mi += pick.length_mi;
      length_ft += pick.length_ft;
      closure_mi += pick.length_mi;
      nodeId = pick.to;
      visited.add(nodeId);
      closure_steps++;
    }
    return {
      steps,
      nodeId,
      length_mi,
      length_ft,
      used,
      uniqueMi: trail.uniqueMi,
      uniqueNodes: visited.size,
      closed_ok: nodeId === goalId,
      closure_steps,
      closure_mi
    };
  }

  // ---------- Chinese Postman (100% coverage, optimal length) ----------

  function coverAll(graph, edgeMode, options = {}) {
    const { startId, endId = null, closed = true } = options;
    const directed = edgeMode === "directed";
    const streets = buildStreetList(graph, edgeMode);
    const networkMi = networkMiles(graph, edgeMode);

    if (!streets.length) return emptyResult("No streets in graph.", networkMi);

    // Restrict to edges reachable from start in the underlying sense
    const component = componentFrom(startId, streets, directed);
    const compStreets = streets.filter((s) => component.has(s.from) && component.has(s.to));
    if (!compStreets.length) {
      return emptyResult("No streets reachable from start.", networkMi);
    }

    if (directed) {
      return coverAllDirected(compStreets, startId, endId, closed, networkMi, graph);
    }
    return coverAllUndirected(compStreets, startId, endId, closed, networkMi, graph);
  }

  function componentFrom(startId, streets, directed) {
    const out = buildAdj(streets, directed);
    const seen = new Set([startId]);
    const stack = [startId];
    while (stack.length) {
      const id = stack.pop();
      for (const e of out.get(id) || []) {
        if (!seen.has(e.to)) {
          seen.add(e.to);
          stack.push(e.to);
        }
      }
    }
    return seen;
  }

  function coverAllUndirected(streets, startId, endId, closed, networkMi, graph) {
    // Degrees in undirected multigraph
    const deg = new Map();
    for (const s of streets) {
      deg.set(s.from, (deg.get(s.from) || 0) + 1);
      deg.set(s.to, (deg.get(s.to) || 0) + 1);
    }

    // Open CPP: start & end may remain odd
    let odds = [...deg.entries()].filter(([, d]) => d % 2 === 1).map(([id]) => id);
    if (!closed && endId && startId !== endId) {
      // For open postman, we want exactly start & end odd (or both even then already Eulerian path)
      // Standard open CPP: add virtual edge start-end, solve closed, remove virtual.
      // Equivalent: pair odds except treat start/end as "already paired" if odd.
      const mustStayOdd = new Set([startId, endId]);
      odds = odds.filter((id) => !mustStayOdd.has(id));
      // If start was even, it needs to become odd for open path — handled by pairing logic:
      // Actually classic: odd vertices = all odd; for s-t path, pair only odds except s and t.
      // If s or t even, they're not in odds — correct.
    } else {
      // closed: pair all odds
    }

    const out = buildAdj(streets, false);
    const pairPaths = minCostOddPairing(odds, out, false);

    // Multiset of edges: original + duplicates along pairing paths
    const edgeBags = new Map(); // key -> {count, template}
    function bagKey(a, b, id) {
      return id;
    }
    for (const s of streets) {
      edgeBags.set(s.id, { count: 1, street: s });
    }
    const revisitIds = new Set();
    for (const path of pairPaths) {
      for (const e of path) {
        const id = e.id || e.edgeId || e.undirected_id;
        const bag = edgeBags.get(id);
        if (bag) {
          bag.count += 1;
          revisitIds.add(id);
        }
      }
    }

    // Build Euler multigraph adjacency with copies
    const eulerAdj = new Map();
    function addEuler(from, to, meta) {
      if (!eulerAdj.has(from)) eulerAdj.set(from, []);
      eulerAdj.get(from).push({ to, ...meta });
    }
    let copySeq = 0;
    for (const { count, street } of edgeBags.values()) {
      for (let c = 0; c < count; c++) {
        const copyId = `${street.id}#${c}`;
        const revisit = c > 0;
        addEuler(street.from, street.to, {
          street,
          copyId,
          forward: true,
          coords: street.coords,
          revisit,
          length_mi: street.length_mi,
          length_ft: street.length_ft
        });
        addEuler(street.to, street.from, {
          street,
          copyId,
          forward: false,
          coords: [...street.coords].reverse(),
          revisit,
          length_mi: street.length_mi,
          length_ft: street.length_ft
        });
        copySeq++;
      }
    }

    const circuitStart = startId;
    const tour = hierholzerUndirected(eulerAdj, circuitStart);
    if (!tour.length && streets.length) {
      return emptyResult("Could not build Euler tour (graph may be disconnected).", networkMi);
    }

    // Convert to steps (undirected Hierholzer yields directed walk)
    const steps = [];
    let length_mi = 0;
    let length_ft = 0;
    for (const hop of tour) {
      steps.push({
        edgeId: hop.street.id,
        undirected_id: hop.street.id,
        from: hop.from,
        to: hop.to,
        name: hop.street.name,
        kind: hop.street.kind || "road",
        length_mi: hop.length_mi,
        length_ft: hop.length_ft,
        coords: hop.coords,
        revisit: hop.revisit
      });
      length_mi += hop.length_mi;
      length_ft += hop.length_ft;
    }

    // If open and we used closed pairing wrongly — for open, Hierholzer still works if exactly 0 or 2 odds
    const uniqueCovered = new Set(steps.map((s) => s.undirected_id));
    const uniqueMi = streets
      .filter((s) => uniqueCovered.has(s.id))
      .reduce((a, s) => a + s.length_mi, 0);

    const revisited = summarizeRevisits(steps);

    const endNodeId = steps.length ? steps[steps.length - 1].to : startId;
    const closedOk = closed ? endNodeId === startId : !endId || endNodeId === endId;
    return {
      ok: true,
      steps,
      length_mi: round4(length_mi),
      length_ft: round1(length_ft),
      unique_mi: round4(uniqueMi),
      edges_used: uniqueCovered.size,
      coverage: networkMi > 0 ? round1((uniqueMi / networkMi) * 100) : 0,
      coords: flattenCoords(steps),
      startNodeId: startId,
      endNodeId,
      goal_node_id: closed ? startId : endId || null,
      closed_ok: closedOk,
      returns_to_start: closed && endNodeId === startId,
      closure_mi: 0,
      network_mi: round4(networkMi),
      usedIds: [...uniqueCovered],
      revisited,
      optimal: true,
      trip_closed: Boolean(closed),
      method:
        "Chinese Postman (undirected) — minimum length to cover every reachable street at least once" +
        (closed ? "; circuit returns to start" : endId ? "; path ends at chosen end" : "")
    };
  }

  function coverAllDirected(streets, startId, endId, closed, networkMi, graph) {
    // Balance in/out degrees with shortest-path duplications, then Hierholzer digraph.
    const nodes = new Set();
    for (const s of streets) {
      nodes.add(s.from);
      nodes.add(s.to);
    }
    const indeg = new Map();
    const outdeg = new Map();
    for (const id of nodes) {
      indeg.set(id, 0);
      outdeg.set(id, 0);
    }
    for (const s of streets) {
      outdeg.set(s.from, outdeg.get(s.from) + 1);
      indeg.set(s.to, indeg.get(s.to) + 1);
    }

    const deficit = []; // need more out
    const surplus = []; // need more in (extra out)
    for (const id of nodes) {
      const d = outdeg.get(id) - indeg.get(id);
      if (d < 0) for (let i = 0; i < -d; i++) deficit.push(id); // need outgoing
      if (d > 0) for (let i = 0; i < d; i++) surplus.push(id); // need incoming
    }

    const out = buildAdj(streets, true);
    // Min-cost bipartite matching surplus -> deficit via shortest paths
    const adds = minCostBipartitePaths(surplus, deficit, out, true);

    const edgeBags = new Map();
    for (const s of streets) edgeBags.set(s.id, { count: 1, street: s });
    for (const path of adds) {
      for (const e of path) {
        const id = e.id || e.edgeId;
        const bag = edgeBags.get(id);
        if (bag) bag.count += 1;
      }
    }

    const eulerAdj = new Map();
    for (const { count, street } of edgeBags.values()) {
      for (let c = 0; c < count; c++) {
        if (!eulerAdj.has(street.from)) eulerAdj.set(street.from, []);
        eulerAdj.get(street.from).push({
          to: street.to,
          street,
          copyId: `${street.id}#${c}`,
          coords: street.coords,
          revisit: c > 0,
          length_mi: street.length_mi,
          length_ft: street.length_ft
        });
      }
    }

    const tour = hierholzerDirected(eulerAdj, startId);
    const steps = tour.map((hop) => ({
      edgeId: hop.street.id,
      undirected_id: hop.street.undirected_id || hop.street.id,
      from: hop.from,
      to: hop.to,
      name: hop.street.name,
      kind: hop.street.kind || "road",
      length_mi: hop.length_mi,
      length_ft: hop.length_ft,
      coords: hop.coords,
      revisit: hop.revisit
    }));
    let length_mi = steps.reduce((s, x) => s + x.length_mi, 0);
    let length_ft = steps.reduce((s, x) => s + x.length_ft, 0);
    const uniqueCovered = new Set(steps.map((s) => s.edgeId));
    const uniqueMi = streets
      .filter((s) => uniqueCovered.has(s.id))
      .reduce((a, s) => a + s.length_mi, 0);

    const endNodeId = steps.length ? steps[steps.length - 1].to : startId;
    return {
      ok: steps.length > 0,
      steps,
      length_mi: round4(length_mi),
      length_ft: round1(length_ft),
      unique_mi: round4(uniqueMi),
      edges_used: uniqueCovered.size,
      coverage: networkMi > 0 ? round1((uniqueMi / networkMi) * 100) : 0,
      coords: flattenCoords(steps),
      startNodeId: startId,
      endNodeId,
      goal_node_id: closed ? startId : endId || null,
      closed_ok: closed ? endNodeId === startId : !endId || endNodeId === endId,
      returns_to_start: closed && endNodeId === startId,
      closure_mi: 0,
      network_mi: round4(networkMi),
      usedIds: [...uniqueCovered],
      revisited: summarizeRevisits(steps),
      optimal: true,
      trip_closed: Boolean(closed),
      method:
        "Chinese Postman (directed) — minimum length to cover every reachable arc at least once" +
        (closed ? "; returns to start" : ""),
      message: steps.length ? undefined : "Could not build directed Euler tour."
    };
  }

  function dijkstra(out, directed, src) {
    const dist = new Map([[src, 0]]);
    const prev = new Map();
    const pq = [[0, src]];
    while (pq.length) {
      pq.sort((a, b) => a[0] - b[0]);
      const [d, u] = pq.shift();
      if (d !== dist.get(u)) continue;
      for (const e of out.get(u) || []) {
        const nd = d + e.length_mi;
        if (!dist.has(e.to) || nd < dist.get(e.to)) {
          dist.set(e.to, nd);
          prev.set(e.to, { from: u, edge: e });
          pq.push([nd, e.to]);
        }
      }
    }
    return { dist, prev };
  }

  function reconstructPath(prev, src, dst) {
    const path = [];
    let cur = dst;
    while (cur !== src) {
      const p = prev.get(cur);
      if (!p) return null;
      path.push(p.edge);
      cur = p.from;
    }
    path.reverse();
    return path;
  }

  /** Min-cost perfect matching on odd vertices via DP (n<=20) else greedy. */
  function minCostOddPairing(odds, out, directed) {
    if (odds.length < 2) return [];
    const n = odds.length;
    const paths = Array.from({ length: n }, () => Array(n).fill(null));
    const cost = Array.from({ length: n }, () => Array(n).fill(Infinity));
    for (let i = 0; i < n; i++) {
      const { dist, prev } = dijkstra(out, directed, odds[i]);
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        if (!dist.has(odds[j])) continue;
        cost[i][j] = dist.get(odds[j]);
        paths[i][j] = reconstructPath(prev, odds[i], odds[j]);
      }
    }

    let pairing;
    if (n <= 16) {
      pairing = matchingDP(n, cost);
    } else {
      pairing = matchingGreedy(n, cost);
    }
    const result = [];
    for (const [i, j] of pairing) {
      const p = paths[i][j];
      if (p) result.push(p);
    }
    return result;
  }

  function matchingDP(n, cost) {
    const N = 1 << n;
    const dp = Array(N).fill(Infinity);
    const choice = Array(N).fill(null);
    dp[0] = 0;
    for (let mask = 0; mask < N; mask++) {
      if (dp[mask] === Infinity) continue;
      let i = 0;
      while (i < n && mask & (1 << i)) i++;
      if (i >= n) continue;
      for (let j = i + 1; j < n; j++) {
        if (mask & (1 << j)) continue;
        if (cost[i][j] === Infinity && cost[j][i] === Infinity) continue;
        const c = Math.min(cost[i][j], cost[j][i]);
        const useIJ = cost[i][j] <= cost[j][i];
        const nmask = mask | (1 << i) | (1 << j);
        const val = dp[mask] + c;
        if (val < dp[nmask]) {
          dp[nmask] = val;
          choice[nmask] = useIJ ? [i, j] : [j, i];
        }
      }
    }
    const pairs = [];
    let mask = N - 1;
    while (mask && choice[mask]) {
      const [i, j] = choice[mask];
      pairs.push([i, j]);
      mask &= ~((1 << i) | (1 << j));
    }
    return pairs;
  }

  function matchingGreedy(n, cost) {
    const used = Array(n).fill(false);
    const pairs = [];
    for (;;) {
      let best = null;
      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        for (let j = i + 1; j < n; j++) {
          if (used[j]) continue;
          const c = Math.min(cost[i][j], cost[j][i]);
          if (c === Infinity) continue;
          if (!best || c < best.c) {
            best = { c, i, j, ij: cost[i][j] <= cost[j][i] };
          }
        }
      }
      if (!best) break;
      used[best.i] = used[best.j] = true;
      pairs.push(best.ij ? [best.i, best.j] : [best.j, best.i]);
    }
    return pairs;
  }

  function minCostBipartitePaths(surplus, deficit, out, directed) {
    // Greedy: repeatedly connect cheapest surplus->deficit (OK for small imbalance)
    const sLeft = surplus.slice();
    const dLeft = deficit.slice();
    const paths = [];
    while (sLeft.length && dLeft.length) {
      let best = null;
      for (let si = 0; si < sLeft.length; si++) {
        const { dist, prev } = dijkstra(out, directed, sLeft[si]);
        for (let di = 0; di < dLeft.length; di++) {
          if (!dist.has(dLeft[di])) continue;
          const c = dist.get(dLeft[di]);
          if (!best || c < best.c) {
            best = {
              c,
              si,
              di,
              path: reconstructPath(prev, sLeft[si], dLeft[di])
            };
          }
        }
      }
      if (!best || !best.path) break;
      paths.push(best.path);
      sLeft.splice(best.si, 1);
      dLeft.splice(best.di, 1);
    }
    return paths;
  }

  function hierholzerUndirected(eulerAdj, startId) {
    // eulerAdj has both orientations of each copyId; traversing consumes the copy once.
    const dirAdj = new Map();
    for (const [from, arr] of eulerAdj) {
      dirAdj.set(
        from,
        arr.map((h) => ({ ...h, from }))
      );
    }
    const usedCopy = new Set();
    const vstack = [startId];
    const edgeStack = [];
    const hopsOut = [];
    while (vstack.length) {
      const v = vstack[vstack.length - 1];
      const list = dirAdj.get(v) || [];
      const idx = list.findIndex((h) => !usedCopy.has(h.copyId));
      if (idx === -1) {
        if (edgeStack.length) hopsOut.push(edgeStack.pop());
        vstack.pop();
      } else {
        const hop = list[idx];
        usedCopy.add(hop.copyId);
        // remove this orientation stub
        list.splice(idx, 1);
        edgeStack.push({
          from: v,
          to: hop.to,
          street: hop.street,
          coords: hop.coords,
          revisit: hop.revisit,
          length_mi: hop.length_mi,
          length_ft: hop.length_ft
        });
        vstack.push(hop.to);
      }
    }
    hopsOut.reverse();
    return hopsOut.filter((h) => h && h.street);
  }

  function hierholzerDirected(eulerAdj, startId) {
    const adj = new Map();
    for (const [k, arr] of eulerAdj) adj.set(k, arr.map((h) => ({ ...h })));
    const vstack = [startId];
    const edgeStack = [];
    const hopsOut = [];
    while (vstack.length) {
      const v = vstack[vstack.length - 1];
      const list = adj.get(v) || [];
      if (!list.length) {
        if (edgeStack.length) hopsOut.push(edgeStack.pop());
        vstack.pop();
      } else {
        const hop = list.pop();
        edgeStack.push({
          from: v,
          to: hop.to,
          street: hop.street,
          coords: hop.coords,
          revisit: hop.revisit,
          length_mi: hop.length_mi,
          length_ft: hop.length_ft
        });
        vstack.push(hop.to);
      }
    }
    hopsOut.reverse();
    return hopsOut.filter((h) => h && h.street);
  }

  function summarizeRevisits(steps) {
    const counts = new Map();
    for (const s of steps) {
      const id = s.undirected_id || s.edgeId;
      if (!counts.has(id)) {
        counts.set(id, {
          id,
          name: s.name,
          kind: s.kind || "road",
          times: 0,
          length_mi: s.length_mi
        });
      }
      counts.get(id).times += 1;
    }
    return [...counts.values()]
      .filter((x) => x.times > 1)
      .sort((a, b) => b.times - a.times || a.name.localeCompare(b.name));
  }

  function flattenCoords(steps) {
    const coords = [];
    for (const s of steps) {
      const c = s.coords || [];
      for (let i = 0; i < c.length; i++) {
        if (coords.length && i === 0) continue;
        coords.push(c[i]);
      }
    }
    return coords;
  }

  function countVisitedNodes(steps, startId) {
    const nodes = new Set();
    if (startId) nodes.add(startId);
    for (const s of steps || []) {
      if (s.from) nodes.add(s.from);
      if (s.to) nodes.add(s.to);
    }
    return nodes;
  }

  function finalizeTrail(trail, edgeMode, networkMi, meta) {
    const uniqueKeys = new Set(trail.steps.map((s) => usedKey(edgeMode, s)));
    // Unique miles: each street/arc counted once (matches reuse rule)
    const seen = new Set();
    let uniqueMi = 0;
    for (const s of trail.steps) {
      const k = usedKey(edgeMode, s);
      if (seen.has(k)) continue;
      seen.add(k);
      uniqueMi += s.length_mi;
    }
    const startId = trail.steps[0]?.from;
    const endId = trail.nodeId || trail.steps[trail.steps.length - 1]?.to;
    const visited = countVisitedNodes(trail.steps, startId);
    const totalNodes = meta.total_nodes || 0;
    const uniqueNodes = visited.size;
    const optimizeUnit = meta.optimizeUnit || "street";
    const streetCoverage = networkMi > 0 ? round1((uniqueMi / networkMi) * 100) : 0;
    const nodeCoverage = totalNodes > 0 ? round1((uniqueNodes / totalNodes) * 100) : 0;
    const goalId = meta.goal_node_id || null;
    const closedOk =
      trail.closed_ok != null
        ? trail.closed_ok
        : !goalId || endId === goalId;
    const closureMi = trail.closure_mi || 0;
    return {
      ok: true,
      steps: trail.steps.map((s) => ({
        ...s,
        revisit: Boolean(s.revisit || s.closure),
        closure: Boolean(s.closure)
      })),
      length_mi: round4(trail.length_mi),
      length_ft: round1(trail.length_ft),
      unique_mi: round4(uniqueMi),
      unique_nodes: uniqueNodes,
      total_nodes: totalNodes,
      visited_node_ids: [...visited],
      edges_used: uniqueKeys.size,
      coverage: optimizeUnit === "node" ? nodeCoverage : streetCoverage,
      street_coverage: streetCoverage,
      node_coverage: nodeCoverage,
      coords: flattenCoords(trail.steps),
      startNodeId: startId,
      endNodeId: endId,
      goal_node_id: goalId,
      closed_ok: closedOk,
      returns_to_start: Boolean(meta.trip_closed) && endId === startId,
      closure_mi: round4(closureMi),
      network_mi: round4(networkMi),
      usedIds: [...uniqueKeys],
      revisited: summarizeRevisits(trail.steps),
      ...meta
    };
  }

  function emptyResult(message, networkMi, totalNodes = 0) {
    return {
      ok: false,
      message,
      steps: [],
      length_mi: 0,
      length_ft: 0,
      unique_mi: 0,
      unique_nodes: 0,
      total_nodes: totalNodes,
      visited_node_ids: [],
      edges_used: 0,
      coverage: 0,
      street_coverage: 0,
      node_coverage: 0,
      coords: [],
      network_mi: round4(networkMi || 0),
      usedIds: [],
      revisited: [],
      optimal: false,
      method: ""
    };
  }

  function round4(x) {
    return Math.round(x * 10000) / 10000;
  }
  function round1(x) {
    return Math.round(x * 10) / 10;
  }

  function enrichCoverage(result, graph, edgeMode, optimizeUnit) {
    if (!result) return result;
    const startId = result.steps?.[0]?.from;
    const visited = countVisitedNodes(result.steps, startId);
    const totalNodes = (graph.nodes || []).length;
    const uniqueNodes = visited.size;
    const networkMi = result.network_mi || networkMiles(graph, edgeMode);
    const streetCoverage =
      networkMi > 0 ? round1(((result.unique_mi || 0) / networkMi) * 100) : 0;
    const nodeCoverage = totalNodes > 0 ? round1((uniqueNodes / totalNodes) * 100) : 0;
    result.unique_nodes = uniqueNodes;
    result.total_nodes = totalNodes;
    result.visited_node_ids = [...visited];
    result.street_coverage = streetCoverage;
    result.node_coverage = nodeCoverage;
    result.optimizeUnit = optimizeUnit || "street";
    result.coverage = optimizeUnit === "node" ? nodeCoverage : streetCoverage;
    return result;
  }

  function run(graph, edgeMode, options) {
    const goal = options.goal || "max";
    const optimizeUnit = options.optimizeUnit === "node" ? "node" : "street";
    const prefs = normalizePrefs(options.prefs);
    if (goal === "cover100") {
      // Full coverage is optimal for length — dials don't change the CPP solution
      const result = coverAll(graph, edgeMode, {
        startId: options.startId,
        endId: options.endId,
        closed: options.closed !== false && options.tripKind !== "point"
      });
      const enriched = enrichCoverage(result, graph, edgeMode, "street");
      if (enriched) {
        enriched.prefs = prefs;
        enriched.turn_count = countMeaningfulTurns(enriched.steps || []);
        enriched.method =
          (enriched.method || "") +
          " (walk-feel dials apply to max/target heuristics, not full-coverage)";
      }
      return enriched;
    }
    return findTrail(graph, edgeMode, {
      startId: options.startId,
      endId: options.endId,
      closed: options.closed,
      targetMi: goal === "target" ? options.targetMi : null,
      restarts: options.restarts,
      optimizeUnit,
      prefs
    });
  }

  global.Routing = {
    STORAGE_KEY,
    saveGraph,
    loadGraph,
    nearestNode,
    findTrail,
    coverAll,
    run,
    networkMiles,
    haversineM,
    normalizePrefs,
    countMeaningfulTurns
  };
})(typeof window !== "undefined" ? window : globalThis);
