// Builds a cone-of-uncertainty polygon from a sequence of forecast points,
// each carrying its own radius (km). This is a straight-edge envelope
// (perpendicular offsets at each point) rather than a fully rounded NHC
// cone -- a deliberate simplification that still reads clearly as an
// expanding forecast cone without pulling in a curve-fitting library.

const KM_PER_DEG = 111;

function unit(dx, dy) {
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
}

export function buildConePolygon(points) {
  if (!points || points.length === 0) return [];

  if (points.length === 1) {
    return circlePolygon(points[0]);
  }

  const left = [];
  const right = [];

  points.forEach((curr, i) => {
    const prev = points[i - 1];
    const next = points[i + 1];
    let dx = 0;
    let dy = 0;
    if (prev) {
      dx += curr.lon - prev.lon;
      dy += curr.lat - prev.lat;
    }
    if (next) {
      dx += next.lon - curr.lon;
      dy += next.lat - curr.lat;
    }
    if (dx === 0 && dy === 0) dx = 1;
    const [ux, uy] = unit(dx, dy);
    const px = -uy;
    const py = ux;
    const rDeg = curr.radiusKm / KM_PER_DEG;
    left.push([curr.lon + px * rDeg, curr.lat + py * rDeg]);
    right.push([curr.lon - px * rDeg, curr.lat - py * rDeg]);
  });

  return [...left, ...right.reverse()];
}

export function circlePolygon(pt, segments = 28) {
  const rDeg = pt.radiusKm / KM_PER_DEG;
  const out = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * 2 * Math.PI;
    out.push([pt.lon + rDeg * Math.cos(a), pt.lat + rDeg * Math.sin(a)]);
  }
  return out;
}
