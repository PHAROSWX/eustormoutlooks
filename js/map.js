import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { loadWorld } from "./geo-data.js";
import { TIER_COLORS } from "./theme.js";

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
    Object.entries(TIER_COLORS).forEach(([tier, color]) => {
      const hatch = defs.append("pattern")
        .attr("id", `hatch-${tier}`)
        .attr("width", 8).attr("height", 8)
        .attr("patternUnits", "userSpaceOnUse")
        .attr("patternTransform", "rotate(45)");
      hatch.append("rect").attr("width", 8).attr("height", 8)
        .attr("fill", color).attr("fill-opacity", 0.16);
      hatch.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 8)
        .attr("stroke", color).attr("stroke-opacity", 0.75).attr("stroke-width", 2.2);
    });

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
    // Extent constrained to the AOI: an unbounded graticule blows up near
    // the poles under Mercator and was the main source of zoom/pan jank.
    const grat = d3.geoGraticule().extent([[-95, 12], [55, 80]]).step([10, 10]);
    this.graticuleLayer.append("path")
      .datum(grat())
      .attr("class", "graticule-line")
      .attr("d", this.pathGen);
  }

  // ---------------------------------------------------------------- zoom/pan
  _bindZoom() {
    this.zoom = d3.zoom()
      .scaleExtent([0.8, 12])
      .on("zoom", (event) => {
        this.zoomTransform = event.transform;
        this.zoomLayer.attr("transform", event.transform);
      });
    this.svg.call(this.zoom);
    // dblclick is reserved for finishing a polygon draft, not map zoom.
    this.svg.on("dblclick.zoom", null);
  }

  zoomBy(factor) {
    this.svg.transition().duration(220).ease(d3.easeCubicOut).call(this.zoom.scaleBy, factor);
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
    // Clip well outside the viewport (not tightly) so panning doesn't pop
    // geometry in/out, but far enough to drop degenerate Mercator geometry.
    this.projection.clipExtent([[-w, -h], [2 * w, 2 * h]]);
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
    this.svg.on("dblclick.zoom", null);
  }
}
