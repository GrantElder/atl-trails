/**
 * Human-readable place labels for graph intersections (avoid raw n47 / lat-lon).
 */
(function (global) {
  function roadwayName(u) {
    const n = (u && (u.name || u.props?.FullName || u.props?.Name)) || "";
    return String(n).trim();
  }

  function uniqueNames(names) {
    const seen = new Set();
    const out = [];
    for (const n of names) {
      const key = n.toLowerCase();
      if (!n || seen.has(key)) continue;
      seen.add(key);
      out.push(n);
    }
    return out;
  }

  /**
   * @param {object} graph - exported RoadGraph / routing graph
   * @param {string} nodeId
   * @returns {{ title: string, detail: string, names: string[] }}
   */
  function describeIntersection(graph, nodeId) {
    if (!graph || !nodeId) {
      return { title: "Intersection not set", detail: "", names: [] };
    }
    const pieces = graph.undirected?.length ? graph.undirected : graph.edges || [];
    const names = [];
    for (const u of pieces) {
      if (u.from === nodeId || u.to === nodeId) {
        const n = roadwayName(u);
        if (n) names.push(n);
      }
    }
    const uniq = uniqueNames(names);
    if (uniq.length >= 2) {
      const title = `${uniq[0]} & ${uniq[1]}`;
      const extra = uniq.length > 2 ? ` (+${uniq.length - 2} more)` : "";
      return {
        title: title + extra,
        detail: "Intersection of " + uniq.slice(0, 4).join(", "),
        names: uniq
      };
    }
    if (uniq.length === 1) {
      return {
        title: `On ${uniq[0]}`,
        detail: "Along this roadway",
        names: uniq
      };
    }
    return {
      title: "Intersection",
      detail: "Unnamed meeting of roadways",
      names: []
    };
  }

  function shortLabel(graph, nodeId) {
    return describeIntersection(graph, nodeId).title;
  }

  global.Places = {
    describeIntersection,
    shortLabel,
    roadwayName
  };
})(typeof window !== "undefined" ? window : globalThis);
