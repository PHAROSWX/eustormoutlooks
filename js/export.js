import { TIER_COLORS, ICONS, TRACK_COLOR, CONE_COLOR } from "./theme.js";
import { LAND_COLOR, LAND_BORDER } from "./map.js";
import { buildConePolygon } from "./cone.js";

const iconImageCache = new Map();

function loadImage(src) {
  if (iconImageCache.has(src)) return iconImageCache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  iconImageCache.set(src, p);
  return p;
}

function ringToPath(ctx, ring, project) {
  ring.forEach(([lon, lat], i) => {
    const p = project(lon, lat);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
}

function drawPolygonGeometry(ctx, geometry, project) {
  if (geometry.type === "Polygon") {
    geometry.coordinates.forEach((ring) => ringToPath(ctx, ring, project));
  } else if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach((poly) => poly.forEach((ring) => ringToPath(ctx, ring, project)));
  }
}

function drawHatchedPolygon(ctx, points, project, color) {
  ctx.save();
  ctx.beginPath();
  points.forEach(([lon, lat], i) => {
    const p = project(lon, lat);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.16;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.clip();

  // Diagonal hatch lines, clipped to the polygon.
  const bounds = points.map(([lon, lat]) => project(lon, lat));
  const xs = bounds.map((p) => p.x);
  const ys = bounds.map((p) => p.y);
  const minX = Math.min(...xs) - 20;
  const maxX = Math.max(...xs) + 20;
  const minY = Math.min(...ys) - 20;
  const maxY = Math.max(...ys) + 20;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 2;
  const step = 8;
  for (let x = minX - (maxY - minY); x < maxX; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, minY);
    ctx.lineTo(x + (maxY - minY), maxY);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.beginPath();
  points.forEach(([lon, lat], i) => {
    const p = project(lon, lat);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.stroke();
}

/**
 * Renders a standalone shareable "Key Messages" card (title + system label +
 * icon + bulleted list) -- NHC's Key Messages graphic is its own image, not
 * a map overlay, so this is a separate canvas/download from the main map.
 * @param {{label:string, classification:string, keyMessages:string[]}} system
 * @param {string} bulletinTitle
 */
export async function exportKeyMessagesPNG(system, bulletinTitle) {
  const width = 900;
  const padding = 40;
  const lineHeight = 34;
  const bulletFont = "500 22px 'IBM Plex Sans', sans-serif";

  // Measure first with a scratch canvas to size the final one.
  const scratch = document.createElement("canvas").getContext("2d");
  scratch.font = bulletFont;
  const maxTextWidth = width - padding * 2 - 40;
  const wrapLine = (text) => {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    words.forEach((w) => {
      const test = line ? `${line} ${w}` : w;
      if (scratch.measureText(test).width > maxTextWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  };

  const messages = system.keyMessages && system.keyMessages.length
    ? system.keyMessages
    : ["No key messages have been posted for this system yet."];
  const wrapped = messages.map(wrapLine);
  const bulletLineCount = wrapped.reduce((sum, l) => sum + l.length, 0);
  const headerHeight = 150;
  const height = headerHeight + bulletLineCount * lineHeight + messages.length * 10 + padding;

  const canvas = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  ctx.fillStyle = "#0a1420";
  ctx.fillRect(0, 0, width, height);

  const headerColor = system.classification === "major-storm" ? "#9b1c1c"
    : system.classification === "storm" ? "#e0080a"
    : system.classification === "remnants" ? "#7a1f1f" : "#e0a33d";
  ctx.fillStyle = headerColor;
  ctx.fillRect(0, 0, width, 8);

  ctx.fillStyle = "#8ea3b3";
  ctx.font = "600 13px 'IBM Plex Mono', monospace";
  ctx.textBaseline = "top";
  ctx.fillText((bulletinTitle || "Graphical Windstorm Outlook").toUpperCase(), padding, 30);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 30px 'IBM Plex Sans', sans-serif";
  ctx.fillText(`Key Messages: ${system.label || "System"}`, padding, 58);

  const src = ICONS[system.classification] || ICONS.potential;
  try {
    const img = await loadImage(src);
    ctx.drawImage(img, width - padding - 56, 24, 56, 56);
  } catch (e) {
    // Icon failing to load shouldn't block the rest of the graphic.
  }

  let y = headerHeight;
  ctx.fillStyle = "#e7edf1";
  wrapped.forEach((lines) => {
    ctx.font = "700 26px 'IBM Plex Sans', sans-serif";
    ctx.fillStyle = headerColor;
    ctx.fillText("\u25CF", padding, y + 2);
    ctx.font = bulletFont;
    ctx.fillStyle = "#e7edf1";
    lines.forEach((line, i) => {
      ctx.fillText(line, padding + 32, y);
      y += lineHeight;
    });
    y += 10;
  });

  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  a.download = `key-messages-${(system.label || "system").replace(/\s+/g, "-").toLowerCase()}-${stamp}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Renders the current view (land, zones, cones/tracks, markers) directly to
 * a canvas using live screen coordinates from the map, then downloads it.
 * (Deliberately not touching Leaflet's internal SVG -- its panning offset
 * makes a naive clone-and-serialize unreliable.)
 *
 * @param {import('./map.js').WindstormMap} map
 * @param {{shapes:Array, markers:Array, systems:Array}} data
 * @param {{title:string, issuedText:string}} meta
 */
export async function exportOutlookPNG(map, data, meta) {
  const rect = map.rootEl.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  const dpr = window.devicePixelRatio || 1;

  const canvas = document.createElement("canvas");
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const project = (lon, lat) => map.map.latLngToContainerPoint(map.toLatLng([lon, lat]));

  // Ocean background.
  const rootStyle = getComputedStyle(map.rootEl);
  ctx.fillStyle = rootStyle.backgroundColor || "#64a2ca";
  ctx.fillRect(0, 0, width, height);

  // Land, from the same GeoJSON the live map uses.
  ctx.fillStyle = LAND_COLOR;
  ctx.strokeStyle = LAND_BORDER;
  ctx.lineWidth = 0.8;
  (map.landFeatures || []).forEach((feature) => {
    ctx.beginPath();
    drawPolygonGeometry(ctx, feature.geometry, project);
    ctx.fill();
    ctx.stroke();
  });

  // Zones (tiered hatch fill).
  (data.shapes || []).forEach((shape) => {
    if (!shape.points || shape.points.length < 3) return;
    const color = TIER_COLORS[shape.tier] || TIER_COLORS.high;
    drawHatchedPolygon(ctx, shape.points, project, color);
  });

  // Systems: cone + forecast track + best track + current-position icon.
  // The export always includes every system's full picture (unlike the
  // live decluttered view), since this graphic is meant to be the
  // complete shareable bulletin.
  const systemIconDraws = [];
  (data.systems || []).forEach((system) => {
    if (system.forecast && system.forecast.length) {
      const conePts = buildConePolygon(system.forecast, { smooth: system.coneSmooth !== false });
      if (conePts.length >= 3) {
        ctx.beginPath();
        conePts.forEach(([lon, lat], i) => {
          const p = project(lon, lat);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fillStyle = CONE_COLOR;
        ctx.globalAlpha = 0.3;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = CONE_COLOR;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      system.forecast.forEach((p, i) => {
        const pt = project(p.lon, p.lat);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      system.forecast.forEach((p) => {
        const pt = project(p.lon, p.lat);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "#333333";
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

    if (system.track && system.track.length) {
      ctx.beginPath();
      system.track.forEach(([lon, lat], i) => {
        const pt = project(lon, lat);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = TRACK_COLOR;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.setLineDash([]);
      system.track.forEach(([lon, lat]) => {
        const pt = project(lon, lat);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.2, 0, 2 * Math.PI);
        ctx.fillStyle = TRACK_COLOR;
        ctx.fill();
      });
    }

    const anchor = (system.track && system.track.length)
      ? system.track[system.track.length - 1]
      : (system.forecast && system.forecast[0] ? [system.forecast[0].lon, system.forecast[0].lat] : null);
    if (anchor) {
      const src = ICONS[system.classification] || ICONS.potential;
      systemIconDraws.push(
        loadImage(src).then((img) => {
          const pt = project(anchor[0], anchor[1]);
          ctx.drawImage(img, pt.x - 14, pt.y - 14, 28, 28);
        }).catch(() => {})
      );
    }
  });
  await Promise.all(systemIconDraws);

  // Point markers (chance / movement / classification).
  const markerDraws = (data.markers || []).map(async (m) => {
    const key = m.kind === "chance" ? `x-${m.tier}` : m.kind === "movement" ? `arrow-${m.tier}` : m.subtype;
    const src = ICONS[key];
    if (!src) return;
    const img = await loadImage(src).catch(() => null);
    if (!img) return;
    const pt = project(m.lon, m.lat);
    const size = m.kind === "classification" ? 30 : m.kind === "movement" ? 24 : 20;
    ctx.save();
    ctx.translate(pt.x, pt.y);
    if (m.kind === "movement") ctx.rotate(((m.angle || 0) * Math.PI) / 180);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  });
  await Promise.all(markerDraws);

  // Bulletin stamp.
  const pad = 10;
  const titleText = meta.title || "Graphical Windstorm Outlook";
  const issuedText = meta.issuedText || "";
  ctx.font = "600 13px 'IBM Plex Sans', sans-serif";
  const titleWidth = ctx.measureText(titleText).width;
  ctx.font = "11px 'IBM Plex Mono', monospace";
  const issuedWidth = ctx.measureText(issuedText).width;
  const boxWidth = Math.max(titleWidth, issuedWidth) + pad * 2;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillRect(8, 8, boxWidth, 46);
  ctx.fillStyle = "#0a1420";
  ctx.font = "600 13px 'IBM Plex Sans', sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(titleText, 8 + pad, 8 + 8);
  ctx.font = "11px 'IBM Plex Mono', monospace";
  ctx.fillText(issuedText, 8 + pad, 8 + 28);

  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  a.download = `windstorm-outlook-${stamp}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
