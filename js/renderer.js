import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { TIER_COLORS, ICONS } from "./theme.js";

const ICON_SIZE = {
  chance: 20,
  movement: 22,
  classification: 30
};

function iconKeyFor(marker) {
  if (marker.kind === "chance") return `x-${marker.tier}`;
  if (marker.kind === "movement") return `arrow-${marker.tier}`;
  if (marker.kind === "classification") return marker.subtype; // storm | major-storm | remnants
  return null;
}

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
    .attr("fill", (d) => `url(#hatch-${d.tier || "high"})`)
    .attr("stroke", (d) => TIER_COLORS[d.tier] || TIER_COLORS.high)
    .attr("d", (d) => (d.points && d.points.length >= 3 ? lineGen(d.points) : null));

  const markerG = map.markersLayer.selectAll("g.marker")
    .data(markers, (d) => d.id)
    .join((enter) => {
      const g = enter.append("g").attr("class", "marker");
      g.append("image").attr("class", "marker-icon");
      return g;
    });

  markerG.attr("transform", (d) => {
    const [x, y] = map.project([d.lon, d.lat]);
    const rotate = d.kind === "movement" ? ` rotate(${d.angle || 0})` : "";
    return `translate(${x},${y})${rotate}`;
  });

  markerG.select("image.marker-icon")
    .attr("href", (d) => ICONS[iconKeyFor(d)] || "")
    .attr("width", (d) => ICON_SIZE[d.kind] || 20)
    .attr("height", (d) => ICON_SIZE[d.kind] || 20)
    .attr("x", (d) => -(ICON_SIZE[d.kind] || 20) / 2)
    .attr("y", (d) => -(ICON_SIZE[d.kind] || 20) / 2);
}

export function clearOutlook(map) {
  map.shapesLayer.selectAll("*").remove();
  map.markersLayer.selectAll("*").remove();
}
