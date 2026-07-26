import * as topojson from "https://cdn.jsdelivr.net/npm/topojson-client@3/+esm";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { AOI_BOUNDS } from "./theme.js";

const WORLD_ATLAS_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

let cached = null;

function boundsIntersectAOI(bounds) {
  const [[lon0, lat0], [lon1, lat1]] = bounds;
  return lon1 >= AOI_BOUNDS.lonMin && lon0 <= AOI_BOUNDS.lonMax
      && lat1 >= AOI_BOUNDS.latMin && lat0 <= AOI_BOUNDS.latMax;
}

/**
 * Returns { countries: FeatureCollection, borders: MultiLineString }, both
 * trimmed to the Atlantic/Europe area of interest. Keeping Antarctica and
 * far-flung landmasses out of the data is what keeps Mercator zoom/pan
 * smooth -- those geometries carry huge coordinate ranges that otherwise
 * get re-rendered on every zoom tick.
 */
export async function loadWorld() {
  if (cached) return cached;

  const res = await fetch(WORLD_ATLAS_URL);
  if (!res.ok) throw new Error(`Failed to load world topology: ${res.status}`);
  const topology = await res.json();

  const allCountries = topojson.feature(topology, topology.objects.countries);
  const keptFeatures = allCountries.features.filter((f) => boundsIntersectAOI(d3.geoBounds(f)));
  const keptIds = new Set(keptFeatures.map((f) => f.id));

  const borders = topojson.mesh(
    topology,
    topology.objects.countries,
    (a, b) => a !== b && (keptIds.has(a.id) || keptIds.has(b.id))
  );

  cached = {
    countries: { type: "FeatureCollection", features: keptFeatures },
    borders
  };
  return cached;
}
