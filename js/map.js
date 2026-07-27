import { TIER_COLORS } from "./theme.js";

const L = window.L;

// CARTO Voyager, no labels: real-world, high-resolution coastlines and
// country borders baked into the tiles (no custom projection math needed,
// and panning/zooming is Leaflet's own well-tested implementation).
const TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
  '&copy; <a href="https://carto.com/attributions">CARTO</a>';

export class WindstormMap {
  /**
   * @param {HTMLElement} rootEl
   * @param {{center:[number,number], zoom:number}} opts  center is [lon, lat]
   */
  constructor(rootEl, opts) {
    this.rootEl = rootEl;

    this.map = L.map(rootEl, {
      center: [opts.center[1], opts.center[0]],
      zoom: opts.zoom || 5,
      minZoom: 3,
      maxZoom: 12,
      zoomControl: false,
      doubleClickZoom: false, // dblclick is reserved for finishing a zone
      worldCopyJump: false
    });

    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 20 }).addTo(this.map);

    // Force the SVG renderer to exist immediately so we can inject shared
    // hatch-pattern <defs> that our zone polygons reference by url(#...).
    this.renderer = L.svg({ padding: 2 }).addTo(this.map);
    this._injectHatchDefs();

    this.shapesLayer = L.layerGroup().addTo(this.map);
    this.markersLayer = L.layerGroup().addTo(this.map);
    this.draftLayer = L.layerGroup().addTo(this.map);
    this.handlesLayer = L.layerGroup().addTo(this.map);
  }

  // eslint-disable-next-line class-methods-use-this
  async init() {
    // Tiles load themselves -- nothing async needed before first render.
  }

  _injectHatchDefs() {
    const svg = this.renderer._container;
    const NS = "http://www.w3.org/2000/svg";
    const defs = document.createElementNS(NS, "defs");
    Object.entries(TIER_COLORS).forEach(([tier, color]) => {
      const pattern = document.createElementNS(NS, "pattern");
      pattern.setAttribute("id", `hatch-${tier}`);
      pattern.setAttribute("width", "8");
      pattern.setAttribute("height", "8");
      pattern.setAttribute("patternUnits", "userSpaceOnUse");
      pattern.setAttribute("patternTransform", "rotate(45)");

      const rect = document.createElementNS(NS, "rect");
      rect.setAttribute("width", "8");
      rect.setAttribute("height", "8");
      rect.setAttribute("fill", color);
      rect.setAttribute("fill-opacity", "0.22");

      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", "0");
      line.setAttribute("y1", "0");
      line.setAttribute("x2", "0");
      line.setAttribute("y2", "8");
      line.setAttribute("stroke", color);
      line.setAttribute("stroke-opacity", "0.85");
      line.setAttribute("stroke-width", "2.2");

      pattern.appendChild(rect);
      pattern.appendChild(line);
      defs.appendChild(pattern);
    });
    svg.insertBefore(defs, svg.firstChild);
  }

  // ---------------------------------------------------------------- coords
  /** Our data model stores points as [lon, lat] (GeoJSON order). */
  toLatLng([lon, lat]) {
    return L.latLng(lat, lon);
  }
  fromLatLng(latlng) {
    return [latlng.lng, latlng.lat];
  }

  screenToLonLat(clientX, clientY) {
    const rect = this.rootEl.getBoundingClientRect();
    const point = L.point(clientX - rect.left, clientY - rect.top);
    const latlng = this.map.containerPointToLatLng(point);
    return [latlng.lng, latlng.lat];
  }

  containerPointOf(latlng) {
    return this.map.latLngToContainerPoint(latlng);
  }

  zoomBy(factor) {
    const delta = factor > 1 ? 1 : -1;
    this.map.setZoom(this.map.getZoom() + delta, { animate: true });
  }

  disablePan() {
    this.map.dragging.disable();
  }
  enablePan() {
    this.map.dragging.enable();
  }
}
