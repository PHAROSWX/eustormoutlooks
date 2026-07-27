import { TIER_COLORS, ICONS } from "./theme.js";

const L = window.L;

const ICON_SIZE = { chance: 20, movement: 24, classification: 30 };

function iconKeyFor(marker) {
  if (marker.kind === "chance") return `x-${marker.tier}`;
  if (marker.kind === "movement") return `arrow-${marker.tier}`;
  if (marker.kind === "classification") return marker.subtype; // storm | major-storm | remnants
  return null;
}

function buildDivIcon(marker) {
  const size = ICON_SIZE[marker.kind] || 20;
  const src = ICONS[iconKeyFor(marker)] || "";
  const rotate = marker.kind === "movement" ? `transform:rotate(${marker.angle || 0}deg);` : "";
  return L.divIcon({
    className: "gwo-marker-icon",
    html: `<img src="${src}" alt="" style="width:${size}px;height:${size}px;display:block;${rotate}">`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

/**
 * Renders shapes + markers as native Leaflet layers (so panning/zooming is
 * Leaflet's own, not something we reposition by hand).
 *
 * @param {import('./map.js').WindstormMap} map
 * @param {{shapes:Array, markers:Array}} data
 * @param {{editable:boolean, selectedId:?string, onShapeClick:Function,
 *          onMarkerClick:Function, onMarkerDrag:Function}} hooks
 */
export function renderOutlook(map, data, hooks = {}) {
  map.shapesLayer.clearLayers();
  map.markersLayer.clearLayers();

  (data.shapes || []).forEach((shape) => {
    if (!shape.points || shape.points.length < 3) return;
    const latlngs = shape.points.map((p) => map.toLatLng(p));
    const color = TIER_COLORS[shape.tier] || TIER_COLORS.high;
    const isSelected = hooks.selectedId === shape.id;

    const layer = L.polygon(latlngs, {
      renderer: map.renderer,
      color,
      weight: isSelected ? 2.6 : 1.8,
      dashArray: isSelected ? "5 3" : null,
      fill: true,
      fillColor: `url(#hatch-${shape.tier || "high"})`,
      fillOpacity: 1
    });
    layer._gwoId = shape.id;
    layer.on("click", (e) => {
      L.DomEvent.stopPropagation(e);
      if (hooks.onShapeClick) hooks.onShapeClick(shape.id);
    });
    layer.addTo(map.shapesLayer);
  });

  (data.markers || []).forEach((marker) => {
    const m = L.marker(map.toLatLng([marker.lon, marker.lat]), {
      icon: buildDivIcon(marker),
      draggable: !!hooks.editable
    });
    m._gwoId = marker.id;
    m.on("click", (e) => {
      L.DomEvent.stopPropagation(e);
      if (hooks.onMarkerClick) hooks.onMarkerClick(marker.id);
    });
    m.on("dragend", () => {
      const ll = m.getLatLng();
      if (hooks.onMarkerDrag) hooks.onMarkerDrag(marker.id, ll.lng, ll.lat);
    });
    m.addTo(map.markersLayer);
  });
}

export function clearOutlook(map) {
  map.shapesLayer.clearLayers();
  map.markersLayer.clearLayers();
}
