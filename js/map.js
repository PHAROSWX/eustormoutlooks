import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { loadWorld } from "./geo-data.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export class WindstormMap {
  /**
   * @param {HTMLElement} rootEl
   * @param {{center:[number,number], scaleFactor:number}} opts
   */
  constructor(rootEl, opts) {
    this.rootEl = rootEl;
    this.opts = opts;
    this.projection = d3.geoMercator().center(opts.center).scale(opts.scaleFactor);
    this.pathGen = d3.geoPath(this.projection);
    this.zoomTransform = d3.zoomIdentity;

    this._buildSkeleton();
    this._bindZoom();
    this._bindResize();
  }

  async init() {
    this._resize();
    const { countries, borders } = await loadWorld();
    this.landLayer.selectAll("path")
      .data(countries.features)
      .join("path")
      .attr("class", "land-fill")
      .attr("d", this.pathGen);

    this.borderLayer.append("path")
      .datum(borders)
      .attr("class", "coastline")
      .attr("fill", "none")
      .attr("d", this.pathGen);

    this._drawGraticule();
  }

  // ---------------------------------------------------------------- layers
  _buildSkeleton() {
    const svg = d3.select(this.rootEl).append("svg")
      .attr("preserveAspectRatio", "xMidYMid slice");

    const defs = svg.append("defs");
    const hatch = defs.append("pattern")
      .attr("id", "hatchRed")
      .attr("width", 8).attr("height", 8)
      .attr("patternUnits", "userSpaceOnUse")
      .attr("patternTransform", "rotate(45)");
    hatch.append("rect").attr("width", 8).attr("height", 8).attr("fill", "rgba(212,59,59,0.10)");
    hatch.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 8)
      .attr("stroke", "rgba(212,59,59,0.55)").attr("stroke-width", 2);

    this.svg = svg;
    this.zoomLayer = svg.append("g").attr("class", "zoom-layer");
    this.graticuleLayer = this.zoomLayer.append("g").attr("class", "graticule");
    this.landLayer = this.zoomLayer.append("g").attr("class", "land");
    this.borderLayer = this.zoomLayer.append("g").attr("class", "borders");
    this.shapesLayer = this.zoomLayer.append("g").attr("class", "shapes");
    this.markersLayer = this.zoomLayer.append("g").attr("class", "markers");
    this.draftLayer = this.zoomLayer.append("g").attr("class", "draft");
    this.handlesLayer = this.zoomLayer.append("g").attr("class", "handles");
  }

  _drawGraticule() {
    const grat = d3.geoGraticule().step([10, 10]);
    this.graticuleLayer.append("path")
      .datum(grat())
      .attr("class", "graticule-line")
      .attr("d", this.pathGen);
  }

  // ---------------------------------------------------------------- zoom/pan
  _bindZoom() {
    this.zoom = d3.zoom()
      .scaleExtent([0.8, 10])
      .on("zoom", (event) => {
        this.zoomTransform = event.transform;
        this.zoomLayer.attr("transform", event.transform);
      });
    this.svg.call(this.zoom);
  }

  _bindResize() {
    const ro = new ResizeObserver(() => this._resize());
    ro.observe(this.rootEl);
  }

  _resize() {
    const w = this.rootEl.clientWidth || 800;
    const h = this.rootEl.clientHeight || 600;
    this.svg.attr("viewBox", `0 0 ${w} ${h}`);
    this.projection.translate([w / 2, h / 2]);
    if (this.landLayer) {
      this.landLayer.selectAll("path").attr("d", this.pathGen);
      this.borderLayer.selectAll("path").attr("d", this.pathGen);
      this.graticuleLayer.selectAll("path").attr("d", this.pathGen);
    }
  }

  // ---------------------------------------------------------------- coords
  /** Project [lon, lat] to raw (pre-zoom) pixel coords inside the zoom layer. */
  project(lonLat) {
    return this.projection(lonLat);
  }

  /** Convert a pointer/mouse client event into [lon, lat]. */
  screenToLonLat(clientX, clientY) {
    const rect = this.rootEl.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const [zx, zy] = this.zoomTransform.invert([x, y]);
    return this.projection.invert([zx, zy]);
  }

  onPointer(eventName, handler) {
    this.svg.on(eventName, handler);
  }

  disablePan() {
    this.svg.on(".zoom", null);
  }
  enablePan() {
    this.svg.call(this.zoom);
  }
}
