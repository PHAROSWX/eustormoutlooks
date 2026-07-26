import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { renderOutlook } from "./renderer.js";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function angleFromVector(dx, dy) {
  // 0deg = pointing up/north, increasing clockwise -- matches SVG rotate().
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

const CLOSE_RADIUS_PX = 12;

export class OutlookEditor {
  /**
   * @param {import('./map.js').WindstormMap} map
   * @param {{onChange:Function, onSelectionChange:Function, onCoord:Function}} hooks
   */
  constructor(map, hooks = {}) {
    this.map = map;
    this.hooks = hooks;
    this.data = { shapes: [], markers: [] };
    this.tool = null;
    this.value = null;
    this.draft = null;
    this.arrowDraft = null;
    this.selected = null; // { type: 'shape'|'marker', id }
    this._bindMapEvents();
    this._bindArrowDrag();
  }

  setData(data) {
    this.data = {
      shapes: (data && data.shapes) ? data.shapes.map((s) => ({ ...s })) : [],
      markers: (data && data.markers) ? data.markers.map((m) => ({ ...m })) : []
    };
    this.draft = null;
    this.selected = null;
    this.render();
  }

  getData() {
    return {
      shapes: this.data.shapes.map((s) => ({ ...s })),
      markers: this.data.markers.map((m) => ({ ...m }))
    };
  }

  setTool(tool, value = null) {
    const changingWhileDrafting = this.tool === "polygon" && (tool !== "polygon" || value !== this.value);
    if (changingWhileDrafting) this._cancelDraft();
    if (tool !== "select") this._deselect();

    this.tool = tool;
    this.value = value;
    this.map.rootEl.classList.toggle("tool-active", !!tool && tool !== "select" && tool !== null);

    if (tool && tool !== "select") {
      this.map.disablePan();
    } else {
      this.map.enablePan();
    }
  }

  deleteSelected() {
    if (!this.selected) return;
    if (this.selected.type === "shape") {
      this.data.shapes = this.data.shapes.filter((s) => s.id !== this.selected.id);
    } else if (this.selected.type === "marker") {
      this.data.markers = this.data.markers.filter((m) => m.id !== this.selected.id);
    }
    this._deselect();
    this._notifyChange();
  }

  updateSelectedNote(note) {
    if (!this.selected || this.selected.type !== "shape") return;
    const shape = this.data.shapes.find((s) => s.id === this.selected.id);
    if (shape) {
      shape.note = note;
      this._notifyChange();
    }
  }

  getSelectedShapeNote() {
    if (!this.selected || this.selected.type !== "shape") return "";
    const shape = this.data.shapes.find((s) => s.id === this.selected.id);
    return shape ? (shape.note || "") : "";
  }

  render() {
    renderOutlook(this.map, this.data);
    this._attachElementHandlers();
    this._renderHandles();
  }

  // ------------------------------------------------------------- map events
  _bindMapEvents() {
    this.map.svg.on("click.editor", (event) => this._handleClick(event));
    this.map.svg.on("dblclick.editor", (event) => this._handleDblClick(event));
    this.map.svg.on("mousemove.editor", (event) => this._handleMove(event));
  }

  _handleClick(event) {
    const [lon, lat] = this.map.screenToLonLat(event.clientX, event.clientY);
    if (this.hooks.onCoord) this.hooks.onCoord(lon, lat);

    if (this.tool === "polygon") {
      this._addDraftPoint(event, lon, lat);
    } else if (this.tool === "chance") {
      this._placeMarker({ kind: "chance", tier: this.value, lon, lat });
    } else if (this.tool === "classification") {
      this._placeMarker({ kind: "classification", subtype: this.value, lon, lat });
    } else if (this.tool === "select") {
      if (event.target.tagName.toLowerCase() === "svg") this._deselect();
    }
    // "movement" placement is handled entirely by the drag gesture below.
  }

  _handleDblClick(event) {
    if (this.tool === "polygon") {
      event.preventDefault();
      this._finishDraft();
    }
  }

  _handleMove(event) {
    const [lon, lat] = this.map.screenToLonLat(event.clientX, event.clientY);
    if (this.hooks.onCoord) this.hooks.onCoord(lon, lat);
    if (this.draft && this.draft.length) this._renderDraft(event);
  }

  // ------------------------------------------------------------- polygon draft
  _addDraftPoint(event, lon, lat) {
    if (!this.draft) this.draft = [];

    if (this.draft.length >= 3) {
      const first = this.map.project(this.draft[0]);
      const rect = this.map.rootEl.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const zx = first[0] * this.map.zoomTransform.k + this.map.zoomTransform.x;
      const zy = first[1] * this.map.zoomTransform.k + this.map.zoomTransform.y;
      const dist = Math.hypot(px - zx, py - zy);
      if (dist <= CLOSE_RADIUS_PX) {
        this._finishDraft();
        return;
      }
    }
    this.draft.push([lon, lat]);
    this._renderDraft();
  }

  _renderDraft() {
    const pts = this.draft.map((p) => this.map.project(p));
    const dAttr = pts.length ? `M${pts.map((p) => p.join(",")).join("L")}` : "";

    this.map.draftLayer.selectAll("path.zone-draft-line").data([dAttr]).join("path")
      .attr("class", "zone-draft-line")
      .attr("d", dAttr);

    this.map.draftLayer.selectAll("circle.zone-vertex").data(this.draft).join("circle")
      .attr("class", "zone-vertex")
      .attr("r", 4)
      .attr("cx", (d) => this.map.project(d)[0])
      .attr("cy", (d) => this.map.project(d)[1]);
  }

  _finishDraft() {
    if (this.draft && this.draft.length >= 3) {
      this.data.shapes.push({ id: uid(), points: this.draft, note: "", tier: this.value || "high" });
      this._notifyChange();
    }
    this._cancelDraft();
  }

  _cancelDraft() {
    this.draft = null;
    this.map.draftLayer.selectAll("*").remove();
  }

  // ------------------------------------------------------------- point markers
  _placeMarker(marker) {
    if (marker.kind === "chance" && !marker.tier) return;
    if (marker.kind === "classification" && !marker.subtype) return;
    this.data.markers.push({ id: uid(), ...marker });
    this._notifyChange();
  }

  // ------------------------------------------------------------- movement arrows (drag to set direction)
  _bindArrowDrag() {
    const drag = d3.drag()
      .on("start", (event) => {
        if (this.tool !== "movement" || !this.value) return;
        const [lon, lat] = this.map.screenToLonLat(event.sourceEvent.clientX, event.sourceEvent.clientY);
        this.arrowDraft = { lon, lat, angle: 0, anchorScreen: [event.sourceEvent.clientX, event.sourceEvent.clientY] };
        this._renderArrowDraft();
      })
      .on("drag", (event) => {
        if (!this.arrowDraft) return;
        const [ax, ay] = this.arrowDraft.anchorScreen;
        const dx = event.sourceEvent.clientX - ax;
        const dy = event.sourceEvent.clientY - ay;
        this.arrowDraft.angle = angleFromVector(dx, dy);
        this._renderArrowDraft();
      })
      .on("end", () => {
        if (!this.arrowDraft) return;
        const { lon, lat, angle } = this.arrowDraft;
        this.data.markers.push({ id: uid(), kind: "movement", tier: this.value, lon, lat, angle });
        this.arrowDraft = null;
        this.map.draftLayer.selectAll("*").remove();
        this._notifyChange();
      });
    this.map.svg.call(drag);
  }

  _renderArrowDraft() {
    if (!this.arrowDraft) return;
    const [x, y] = this.map.project([this.arrowDraft.lon, this.arrowDraft.lat]);
    this.map.draftLayer.selectAll("line.arrow-draft-line").data([this.arrowDraft]).join("line")
      .attr("class", "arrow-draft-line")
      .attr("x1", x).attr("y1", y)
      .attr("x2", x + 30 * Math.sin((this.arrowDraft.angle * Math.PI) / 180))
      .attr("y2", y - 30 * Math.cos((this.arrowDraft.angle * Math.PI) / 180));
  }

  // ------------------------------------------------------------- selection
  _attachElementHandlers() {
    this.map.shapesLayer.selectAll("path.zone-shape")
      .on("click", (event, d) => {
        if (this.tool !== "select") return;
        event.stopPropagation();
        this._select("shape", d.id);
      });

    const dragMarker = d3.drag()
      .on("drag", (event, d) => {
        if (this.tool !== "select") return;
        const [lon, lat] = this.map.screenToLonLat(event.sourceEvent.clientX, event.sourceEvent.clientY);
        d.lon = lon;
        d.lat = lat;
        this.render();
      });

    this.map.markersLayer.selectAll("g.marker")
      .on("click", (event, d) => {
        if (this.tool !== "select") return;
        event.stopPropagation();
        this._select("marker", d.id);
      })
      .call(dragMarker);
  }

  _select(type, id) {
    this.selected = { type, id };
    if (this.hooks.onSelectionChange) this.hooks.onSelectionChange(this.selected);
    this._renderHandles();
  }

  _deselect() {
    this.selected = null;
    if (this.hooks.onSelectionChange) this.hooks.onSelectionChange(null);
    if (this.map.handlesLayer) this.map.handlesLayer.selectAll("*").remove();
  }

  _renderHandles() {
    this.map.handlesLayer.selectAll("*").remove();
    this.map.shapesLayer.selectAll("path.zone-shape")
      .classed("editing", (d) => this.selected && this.selected.type === "shape" && d.id === this.selected.id);

    if (!this.selected || this.selected.type !== "shape") return;
    const shape = this.data.shapes.find((s) => s.id === this.selected.id);
    if (!shape) return;

    const dragVertex = d3.drag().on("drag", (event, d) => {
      const [lon, lat] = this.map.screenToLonLat(event.sourceEvent.clientX, event.sourceEvent.clientY);
      shape.points[d.i] = [lon, lat];
      this.render();
      this._select("shape", shape.id);
    });

    this.map.handlesLayer.selectAll("circle.zone-vertex")
      .data(shape.points.map((p, i) => ({ p, i })))
      .join("circle")
      .attr("class", "zone-vertex")
      .attr("r", 5)
      .attr("cx", (d) => this.map.project(d.p)[0])
      .attr("cy", (d) => this.map.project(d.p)[1])
      .call(dragVertex);
  }

  _notifyChange() {
    this.render();
    if (this.hooks.onChange) this.hooks.onChange(this.getData());
  }
}
