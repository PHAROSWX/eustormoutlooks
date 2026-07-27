// Central place for tier colors + icon paths so the toolbar, legend,
// renderer, and editor all agree on the same values.

export const TIER_COLORS = {
  low: "#f5f90b",   // < 40%
  mid: "#ffa500",   // 40-60%
  high: "#e0080a"   // > 60%
};

export const TIER_LABELS = {
  low: "< 40%",
  mid: "40\u201360%",
  high: "> 60%"
};

export const ICONS = {
  "x-low": "img/icons/x-low.png",
  "x-mid": "img/icons/x-mid.png",
  "x-high": "img/icons/x-high.png",
  "arrow-low": "img/icons/arrow-low.png",
  "arrow-mid": "img/icons/arrow-mid.png",
  "arrow-high": "img/icons/arrow-high.png",
  "storm": "img/icons/storm.png",
  "major-storm": "img/icons/major-storm.png",
  "remnants": "img/icons/remnants.png",
  "potential-outline": "img/icons/potential-outline.png",
  "potential": "img/icons/potential-outline.png"
};

// Classification options available for a tracked system.
export const SYSTEM_CLASSIFICATIONS = [
  { value: "potential", label: "Potential windstorm" },
  { value: "storm", label: "Storm" },
  { value: "major-storm", label: "Major storm" },
  { value: "remnants", label: "Remnants" }
];

export const TRACK_COLOR = "#2b2f33";
export const CONE_COLOR = "#ffffff";
export const DEFAULT_CONE_STEP_KM = 60;
export const DEFAULT_CONE_SMOOTH = true;

// Rough North Atlantic + Europe area of interest, used to trim world
// topology to just what's relevant (better performance, no far-flung
// landmasses distorting the Mercator projection at the edges).
export const AOI_BOUNDS = { lonMin: -95, lonMax: 55, latMin: 10, latMax: 82 };
