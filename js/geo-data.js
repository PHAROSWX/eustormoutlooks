import * as topojson from "https://cdn.jsdelivr.net/npm/topojson-client@3/+esm";

const WORLD_ATLAS_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

let cached = null;

/**
 * Returns { countries: FeatureCollection, borders: MultiLineString }
 * Countries are used for the land fill, borders for the internal
 * country-boundary mesh drawn on top (as in the reference bulletin graphic).
 */
export async function loadWorld() {
  if (cached) return cached;

  const res = await fetch(WORLD_ATLAS_URL);
  if (!res.ok) throw new Error(`Failed to load world topology: ${res.status}`);
  const topology = await res.json();

  const countries = topojson.feature(topology, topology.objects.countries);
  const borders = topojson.mesh(topology, topology.objects.countries, (a, b) => a !== b);

  cached = { countries, borders };
  return cached;
}
