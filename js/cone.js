// Builds a cone-of-uncertainty polygon from a sequence of forecast points,
// each carrying its own radius (km) and forecast hour. Two modes:
//  - straight envelope (fast, angular) -- perpendicular offsets at each point
//  - smoothed (default) -- Catmull-Rom interpolated edges + rounded end caps,
//    closer to how NHC actually draws the cone.

const KM_PER_DEG = 111;

function unit(dx, dy) {
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
}

function offsetPoints(points) {
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
  return { left, right };
}

/** Catmull-Rom spline through a polyline, `segments` interpolated points per span. */
function smoothPolyline(pts, segments = 8) {
  if (pts.length < 3) return pts.slice();
  const out = [];
  const get = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    for (let t = 0; t < segments; t++) {
      const s = t / segments;
      const s2 = s * s;
      const s3 = s2 * s;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * s
        + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * s2
        + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * s3);
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * s
        + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * s2
        + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * s3);
      out.push([x, y]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function arcCap(center, fromAngle, toAngle, radiusKm, segments = 12) {
  const rDeg = radiusKm / KM_PER_DEG;
  const out = [];
  // Always sweep the *short way* around from fromAngle to toAngle.
  let delta = toAngle - fromAngle;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  for (let i = 0; i <= segments; i++) {
    const a = fromAngle + (delta * i) / segments;
    out.push([center.lon + rDeg * Math.cos(a), center.lat + rDeg * Math.sin(a)]);
  }
  return out;
}

export function circlePolygon(pt, segments = 32) {
  const rDeg = pt.radiusKm / KM_PER_DEG;
  const out = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * 2 * Math.PI;
    out.push([pt.lon + rDeg * Math.cos(a), pt.lat + rDeg * Math.sin(a)]);
  }
  return out;
}

/**
 * @param {Array<{lon:number, lat:number, radiusKm:number}>} points
 * @param {{smooth?: boolean}} opts
 */
export function buildConePolygon(points, opts = {}) {
  if (!points || points.length === 0) return [];
  if (points.length === 1) return circlePolygon(points[0]);

  const { left, right } = offsetPoints(points);
  const smooth = opts.smooth !== false;

  if (!smooth) {
    return [...left, ...right.reverse()];
  }

  const smoothLeft = smoothPolyline(left);
  const smoothRight = smoothPolyline(right);

  const first = points[0];
  const last = points[points.length - 1];

  // Round end caps: sweep from the left-edge angle to the right-edge angle
  // around each end point, so the cone doesn't just cut off flat.
  const angle = (center, p) => Math.atan2(p[1] - center.lat, p[0] - center.lon);
  const endCap = arcCap(last, angle(last, smoothLeft[smoothLeft.length - 1]), angle(last, smoothRight[smoothRight.length - 1]), last.radiusKm);
  const startCap = arcCap(first, angle(first, smoothRight[0]), angle(first, smoothLeft[0]), first.radiusKm);

  return [...smoothLeft, ...endCap, ...smoothRight.reverse(), ...startCap];
}
