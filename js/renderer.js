import { TIER_COLORS, ICONS, TRACK_COLOR, CONE_COLOR } from "./theme.js";
import { buildConePolygon } from "./cone.js";

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
  map.systemsLayer.clearLayers();
  map.shapesLayer.clearLayers();
  map.markersLayer.clearLayers();

  (data.systems || []).forEach((system) => {
    const isActive = hooks.activeSystemId === system.id;

    // Forecast cone -- envelope of growing-radius circles.
    if (system.forecast && system.forecast.length) {
      const conePts = buildConePolygon(system.forecast);
      if (conePts.length >= 3) {
        L.polygon(conePts.map(([lon, lat]) => map.toLatLng([lon, lat])), {
          renderer: map.renderer,
          color: CONE_COLOR,
          weight: 1.4,
          dashArray: "5 4",
          fill: true,
          fillColor: CONE_COLOR,
          fillOpacity: 0.28
        }).addTo(map.systemsLayer);
      }
      // forecast track line + numbered points
      const fLatLngs = system.forecast.map((p) => map.toLatLng([p.lon, p.lat]));
      L.polyline(fLatLngs, { renderer: map.renderer, color: "#ffffff", weight: 1.4 }).addTo(map.systemsLayer);
      system.forecast.forEach((p, i) => {
        L.circleMarker(map.toLatLng([p.lon, p.lat]), {
          renderer: map.renderer, radius: 4, color: "#333", weight: 1,
          fillColor: "#ffffff", fillOpacity: 1
        }).bindTooltip(`+${i + 1}`, { permanent: false, direction: "top" }).addTo(map.systemsLayer);
      });
    }

    // Best track -- past fixes, dark dashed line with small dots.
    if (system.track && system.track.length) {
      const tLatLngs = system.track.map((p) => map.toLatLng(p));
      L.polyline(tLatLngs, { renderer: map.renderer, color: TRACK_COLOR, weight: 1.8, dashArray: "2 3" })
        .addTo(map.systemsLayer);
      system.track.forEach((p) => {
        L.circleMarker(map.toLatLng(p), {
          renderer: map.renderer, radius: 3.2, color: TRACK_COLOR, weight: 1,
          fillColor: TRACK_COLOR, fillOpacity: 1
        }).addTo(map.systemsLayer);
      });
    }

    // Current position / classification icon, at the last track point (or first forecast point).
    const anchor = (system.track && system.track.length)
      ? system.track[system.track.length - 1]
      : (system.forecast && system.forecast[0] ? [system.forecast[0].lon, system.forecast[0].lat] : null);
    if (anchor) {
      const src = ICONS[system.classification] || ICONS.potential;
      const m = L.marker(map.toLatLng(anchor), {
        icon: L.divIcon({
          className: isActive ? "gwo-marker-icon gwo-system-active" : "gwo-marker-icon",
          html: `<img src="${src}" alt="" style="width:28px;height:28px;display:block;">`,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        })
      });
      m.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        if (hooks.onSystemClick) hooks.onSystemClick(system.id);
      });
      m.addTo(map.systemsLayer);
    }
  });

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
