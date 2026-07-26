import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const MARKER_GLYPH = {
  low: { symbol: "\u00D7", class: "m-low" },
  mid: { symbol: "\u00D7", class: "m-mid" },
  high: { symbol: "\u00D7", class: "m-high" },
  storm: { symbol: "\u2618", class: "m-storm" },
  major: { symbol: "\u2618", class: "m-major" },
  remnant: { symbol: "\u2297", class: "m-remnant" }
};

const MARKER_FILL = {
  low: "#f2d233", mid: "#ef9a2b", high: "#d43b3b",
  storm: "#e8524a", major: "#9b1c1c", remnant: "#7a1f1f"
};

/** Renders shapes + markers into the map's shapesLayer/markersLayer. Non-interactive. */
export function renderOutlook(map, data) {
  const shapes = (data && data.shapes) || [];
  const markers = (data && data.markers) || [];

  const lineGen = d3.line()
    .x((d) => map.project(d)[0])
    .y((d) => map.project(d)[1])
    .curve(d3.curveCatmullRomClosed.alpha(0.6));

  map.shapesLayer.selectAll("path.zone-shape")
    .data(shapes, (d) => d.id)
    .join("path")
    .attr("class", "zone-shape")
    .attr("d", (d) => (d.points && d.points.length >= 3 ? lineGen(d.points) : null));

  const markerG = map.markersLayer.selectAll("g.marker")
    .data(markers, (d) => d.id)
    .join((enter) => {
      const g = enter.append("g").attr("class", "marker");
      g.append("circle").attr("r", 10);
      g.append("text")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("dy", "0.5");
      return g;
    });

  markerG.attr("transform", (d) => {
    const [x, y] = map.project([d.lon, d.lat]);
    return `translate(${x},${y})`;
  });

  markerG.select("circle")
    .attr("fill", (d) => MARKER_FILL[d.tier] || "#888")
    .attr("stroke", "#081420")
    .attr("stroke-width", 1.2);

  markerG.select("text")
    .attr("fill", (d) => (d.tier === "low" || d.tier === "mid" ? "#221800" : "#ffffff"))
    .attr("font-size", (d) => (d.tier === "storm" || d.tier === "major" ? 11 : 12))
    .attr("font-weight", 700)
    .text((d) => (MARKER_GLYPH[d.tier] || { symbol: "?" }).symbol);
}

export function clearOutlook(map) {
  map.shapesLayer.selectAll("*").remove();
  map.markersLayer.selectAll("*").remove();
}
