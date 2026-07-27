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

function svgToImage(svgEl) {
  const clone = svgEl.cloneNode(true);
  const rect = svgEl.getBoundingClientRect();
  clone.setAttribute("width", rect.width);
  clone.setAttribute("height", rect.height);
  const xml = new XMLSerializer().serializeToString(clone);
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  return loadImage(src);
}

/**
 * @param {import('./map.js').WindstormMap} map
 * @param {{shapes:Array, markers:Array, systems:Array}} data
 * @param {{title:string, issuedText:string}} meta
 */
export async function exportOutlookPNG(map, data, meta) {
  const rect = map.rootEl.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // Ocean background, then the SVG layer (land + zones + cones/tracks).
  const rootStyle = getComputedStyle(map.rootEl);
  ctx.fillStyle = rootStyle.backgroundColor || "#64a2ca";
  ctx.fillRect(0, 0, width, height);

  const svgImg = await svgToImage(map.renderer._container);
  ctx.drawImage(svgImg, 0, 0, width, height);

  // Point markers (chance / movement / classification), drawn from data
  // directly so rotation and exact icon match what's on screen.
  const markerDraws = (data.markers || []).map(async (m) => {
    const key = m.kind === "chance" ? `x-${m.tier}` : m.kind === "movement" ? `arrow-${m.tier}` : m.subtype;
    const src = `img/icons/${key}.png`;
    const img = await loadImage(src).catch(() => null);
    if (!img) return;
    const pt = map.containerPointOf(map.toLatLng([m.lon, m.lat]));
    const size = m.kind === "classification" ? 30 : m.kind === "movement" ? 24 : 20;
    ctx.save();
    ctx.translate(pt.x, pt.y);
    if (m.kind === "movement") ctx.rotate(((m.angle || 0) * Math.PI) / 180);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  });

  const systemDraws = (data.systems || []).map(async (s) => {
    const anchor = (s.track && s.track.length) ? s.track[s.track.length - 1]
      : (s.forecast && s.forecast[0] ? [s.forecast[0].lon, s.forecast[0].lat] : null);
    if (!anchor) return;
    const src = `img/icons/${s.classification || "potential"}.png`;
    const img = await loadImage(src).catch(() => null);
    if (!img) return;
    const pt = map.containerPointOf(map.toLatLng(anchor));
    ctx.drawImage(img, pt.x - 14, pt.y - 14, 28, 28);
  });

  await Promise.all([...markerDraws, ...systemDraws]);

  // Simple bulletin header stamp in the corner.
  ctx.font = "600 13px 'IBM Plex Sans', sans-serif";
  ctx.fillStyle = "#0a1420";
  ctx.textBaseline = "top";
  const pad = 10;
  const titleText = meta.title || "Graphical Windstorm Outlook";
  const issuedText = meta.issuedText || "";
  const titleWidth = ctx.measureText(titleText).width;
  ctx.font = "11px 'IBM Plex Mono', monospace";
  const issuedWidth = ctx.measureText(issuedText).width;
  const boxWidth = Math.max(titleWidth, issuedWidth) + pad * 2;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(8, 8, boxWidth, 46);
  ctx.fillStyle = "#0a1420";
  ctx.font = "600 13px 'IBM Plex Sans', sans-serif";
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
