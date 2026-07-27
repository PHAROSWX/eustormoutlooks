import { TIER_COLORS, ICONS, TRACK_COLOR, CONE_COLOR, SYSTEM_CLASSIFICATIONS } from "./theme.js";
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

function classificationLabel(value) {
  const found = SYSTEM_CLASSIFICATIONS.find((c) => c.value === value);
  return found ? found.label : "Unclassified";
}

function systemHeaderColor(classification) {
  if (classification === "major-storm") return "#9b1c1c";
  if (classification === "storm") return "#e0080a";
  if (classification === "remnants") return "#7a1f1f";
  return "#e0a33d"; // potential / unclassified
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function popupHtml({ headerColor, headerText, bodyLines }) {
  const body = bodyLines.filter(Boolean).map((l) => `<div class="gwo-popup-line">${l}</div>`).join("");
  return `<div class="gwo-popup">
    <div class="gwo-popup-header" style="background:${headerColor}">${escapeHtml(headerText)}</div>
    <div class="gwo-popup-body">${body}</div>
  </div>`;
}

/**
 * Renders shapes + markers + systems as native Leaflet layers.
 *
 * @param {import('./map.js').WindstormMap} map
 * @param {{shapes:Array, markers:Array, systems:Array}} data
 * @param {{editable:boolean, selectedId:?string, tool:?string, activeSystemId:?string,
 *          onShapeClick:Function, onMarkerClick:Function, onMarkerDrag:Function, onSystemClick:Function}} hooks
 */
export function renderOutlook(map, data, hooks = {}) {
  map.systemsLayer.clearLayers();
  map.shapesLayer.clearLayers();
  map.markersLayer.clearLayers();

  const isSelectTool = hooks.tool === "select";

  // ---------------------------------------------------------------- zones
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

    const tierPct = shape.tier === "low" ? "< 40%" : shape.tier === "mid" ? "40\u201360%" : "> 60%";
    layer.bindTooltip(`Potential windstorm &middot; ${tierPct}`, { sticky: true });
    layer.bindPopup(popupHtml({
      headerColor: color,
      headerText: `Potential windstorm \u2014 formation chance ${tierPct} (click icon for details)`,
      bodyLines: [shape.note ? escapeHtml(shape.note) : "No additional notes."]
    }));

    layer.on("click", (e) => {
      if (isSelectTool) {
        L.DomEvent.stopPropagation(e);
        if (hooks.onShapeClick) hooks.onShapeClick(shape.id);
      }
    });
    layer.addTo(map.shapesLayer);
  });

  // ---------------------------------------------------------------- point markers
  (data.markers || []).forEach((marker) => {
    const m = L.marker(map.toLatLng([marker.lon, marker.lat]), {
      icon: buildDivIcon(marker),
      draggable: !!hooks.editable
    });
    m._gwoId = marker.id;
    m.on("click", (e) => {
      if (isSelectTool) {
        L.DomEvent.stopPropagation(e);
        if (hooks.onMarkerClick) hooks.onMarkerClick(marker.id);
      }
    });
    m.on("dragend", () => {
      const ll = m.getLatLng();
      if (hooks.onMarkerDrag) hooks.onMarkerDrag(marker.id, ll.lng, ll.lat);
    });
    m.addTo(map.markersLayer);
  });

  // ---------------------------------------------------------------- tracked systems
  (data.systems || []).forEach((system) => {
    const isExpanded = hooks.activeSystemId === system.id;
    const color = systemHeaderColor(system.classification);

    if (isExpanded) {
      // Forecast cone -- only shown once a system is opened, to keep the
      // default view uncluttered (just icons) like the reference site.
      if (system.forecast && system.forecast.length) {
        const conePts = buildConePolygon(system.forecast, { smooth: system.coneSmooth !== false });
        if (conePts.length >= 3) {
          L.polygon(conePts.map(([lon, lat]) => map.toLatLng([lon, lat])), {
            renderer: map.renderer,
            color: CONE_COLOR,
            weight: 1.4,
            dashArray: "5 4",
            fill: true,
            fillColor: CONE_COLOR,
            fillOpacity: 0.3
          }).addTo(map.systemsLayer);
        }
        const fLatLngs = system.forecast.map((p) => map.toLatLng([p.lon, p.lat]));
        L.polyline(fLatLngs, { renderer: map.renderer, color: "#ffffff", weight: 1.4 }).addTo(map.systemsLayer);
        system.forecast.forEach((p) => {
          const label = p.hours != null ? `+${p.hours}h` : "";
          L.circleMarker(map.toLatLng([p.lon, p.lat]), {
            renderer: map.renderer, radius: 4, color: "#333", weight: 1,
            fillColor: "#ffffff", fillOpacity: 1
          }).bindTooltip(label || "forecast point", { permanent: false, direction: "top" }).addTo(map.systemsLayer);
        });
      }

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
    }

    const anchor = (system.track && system.track.length)
      ? system.track[system.track.length - 1]
      : (system.forecast && system.forecast[0] ? [system.forecast[0].lon, system.forecast[0].lat] : null);
    if (!anchor) return;

    const src = ICONS[system.classification] || ICONS.potential;
    const m = L.marker(map.toLatLng(anchor), {
      icon: L.divIcon({
        className: isExpanded ? "gwo-marker-icon gwo-system-active" : "gwo-marker-icon",
        html: `<img src="${src}" alt="" style="width:28px;height:28px;display:block;">`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      })
    });

    m.bindTooltip(`<b>${escapeHtml(system.label || "System")}</b><br>${classificationLabel(system.classification)} \u2014 click for details`,
      { sticky: true });
    m.bindPopup(popupHtml({
      headerColor: color,
      headerText: `${system.label || "System"} (click icon on map to toggle cone)`,
      bodyLines: [
        `<b>${classificationLabel(system.classification)}</b>`,
        system.discussion ? escapeHtml(system.discussion) : "No discussion posted yet."
      ]
    }));

    m.on("click", (e) => {
      L.DomEvent.stopPropagation(e);
      if (hooks.onSystemClick) hooks.onSystemClick(system.id);
    });
    m.addTo(map.systemsLayer);
  });
}

export function clearOutlook(map) {
  map.systemsLayer.clearLayers();
  map.shapesLayer.clearLayers();
  map.markersLayer.clearLayers();
}
