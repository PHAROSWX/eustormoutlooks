import { renderOutlook } from "./renderer.js";

const L = window.L;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function angleFromVector(dx, dy) {
  // 0deg = pointing up/north, increasing clockwise -- matches CSS rotate().
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

const CLOSE_RADIUS_PX = 14;

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
    this.editable = false;
    this._bindMapEvents();
  }

  setEditable(editable) {
    this.editable = editable;
    this.render();
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
    if (this.arrowDraft) this._cancelArrowDraft();
    if (tool !== "select") this._deselect();

    this.tool = tool;
    this.value = value;
    this.map.rootEl.classList.toggle("tool-active", !!tool && tool !== "select");

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
    renderOutlook(this.map, this.data, {
      editable: this.editable,
      selectedId: this.selected && this.selected.type === "shape" ? this.selected.id : null,
      onShapeClick: (id) => {
        if (this.tool === "select") this._select("shape", id);
      },
      onMarkerClick: (id) => {
        if (this.tool === "select") this._select("marker", id);
      },
      onMarkerDrag: (id, lon, lat) => {
        const marker = this.data.markers.find((m) => m.id === id);
        if (marker) {
          marker.lon = lon;
          marker.lat = lat;
          this._notifyChange();
        }
      }
    });
    this._renderVertexHandles();
  }

  // ------------------------------------------------------------- map events
  _bindMapEvents() {
    this.map.map.on("click", (e) => this._handleClick(e));
    this.map.map.on("dblclick", (e) => this._handleDblClick(e));
    this.map.map.on("mousemove", (e) => this._handleMove(e));
    this.map.map.on("mousedown", (e) => this._handleMouseDown(e));
    this.map.map.on("mouseup", () => this._handleMouseUp());
  }

  _handleClick(e) {
    const lon = e.latlng.lng;
    const lat = e.latlng.lat;
    if (this.hooks.onCoord) this.hooks.onCoord(lon, lat);

    if (this.tool === "polygon") {
      this._addDraftPoint(e, lon, lat);
    } else if (this.tool === "chance") {
      this._placeMarker({ kind: "chance", tier: this.value, lon, lat });
    } else if (this.tool === "classification") {
      this._placeMarker({ kind: "classification", subtype: this.value, lon, lat });
    } else if (this.tool === "select") {
      this._deselect();
    }
  }

  _handleDblClick(e) {
    if (this.tool === "polygon") {
      L.DomEvent.stopPropagation(e);
      this._finishDraft();
    }
  }

  _handleMove(e) {
    if (this.hooks.onCoord) this.hooks.onCoord(e.latlng.lng, e.latlng.lat);
    if (this.draft && this.draft.length) this._renderDraft(e);
    if (this.arrowDraft) this._updateArrowDraft(e);
  }

  _handleMouseDown(e) {
    if (this.tool !== "movement" || !this.value) return;
    this.arrowDraft = {
      lon: e.latlng.lng,
      lat: e.latlng.lat,
      anchorPoint: this.map.containerPointOf(e.latlng),
      angle: 0
    };
    this._renderArrowDraft();
  }

  _handleMouseUp() {
    if (!this.arrowDraft) return;
    const { lon, lat, angle } = this.arrowDraft;
    this.data.markers.push({ id: uid(), kind: "movement", tier: this.value, lon, lat, angle });
    this._cancelArrowDraft();
    this._notifyChange();
  }

  // ------------------------------------------------------------- polygon draft
  _addDraftPoint(e, lon, lat) {
    if (!this.draft) this.draft = [];

    if (this.draft.length >= 3) {
      const firstPoint = this.map.containerPointOf(this.map.toLatLng(this.draft[0]));
      const dist = firstPoint.distanceTo(e.containerPoint);
      if (dist <= CLOSE_RADIUS_PX) {
        this._finishDraft();
        return;
      }
    }
    this.draft.push([lon, lat]);
    this._renderDraft();
  }

  _renderDraft() {
    this.map.draftLayer.clearLayers();
    if (!this.draft || !this.draft.length) return;
    const latlngs = this.draft.map((p) => this.map.toLatLng(p));
    L.polyline(latlngs, { renderer: this.map.renderer, color: "#2c8a80", weight: 1.6, dashArray: "4 3" })
      .addTo(this.map.draftLayer);
    this.draft.forEach((p) => {
      L.circleMarker(this.map.toLatLng(p), { renderer: this.map.renderer, radius: 4, color: "#2c8a80", fillColor: "#2c8a80", fillOpacity: 1 })
        .addTo(this.map.draftLayer);
    });
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
    this.map.draftLayer.clearLayers();
  }

  // ------------------------------------------------------------- point markers
  _placeMarker(marker) {
    if (marker.kind === "chance" && !marker.tier) return;
    if (marker.kind === "classification" && !marker.subtype) return;
    this.data.markers.push({ id: uid(), ...marker });
    this._notifyChange();
  }

  // ------------------------------------------------------------- movement arrows (drag to set direction)
  _updateArrowDraft(e) {
    if (!this.arrowDraft) return;
    const dx = e.containerPoint.x - this.arrowDraft.anchorPoint.x;
    const dy = e.containerPoint.y - this.arrowDraft.anchorPoint.y;
    this.arrowDraft.angle = angleFromVector(dx, dy);
    this._renderArrowDraft();
  }

  _renderArrowDraft() {
    if (!this.arrowDraft) return;
    this.map.draftLayer.clearLayers();
    const start = this.map.toLatLng([this.arrowDraft.lon, this.arrowDraft.lat]);
    const startPt = this.map.containerPointOf(start);
    const rad = (this.arrowDraft.angle * Math.PI) / 180;
    const endPt = L.point(startPt.x + 34 * Math.sin(rad), startPt.y - 34 * Math.cos(rad));
    const endLatLng = this.map.map.containerPointToLatLng(endPt);
    L.polyline([start, endLatLng], { renderer: this.map.renderer, color: "#2c8a80", weight: 2.2 })
      .addTo(this.map.draftLayer);
  }

  _cancelArrowDraft() {
    this.arrowDraft = null;
    this.map.draftLayer.clearLayers();
  }

  // ------------------------------------------------------------- selection / vertex editing
  _select(type, id) {
    this.selected = { type, id };
    if (this.hooks.onSelectionChange) this.hooks.onSelectionChange(this.selected);
    this.render();
  }

  _deselect() {
    if (!this.selected) return;
    this.selected = null;
    if (this.hooks.onSelectionChange) this.hooks.onSelectionChange(null);
    this.render();
  }

  _renderVertexHandles() {
    this.map.handlesLayer.clearLayers();
    if (!this.editable || !this.selected || this.selected.type !== "shape") return;
    const shape = this.data.shapes.find((s) => s.id === this.selected.id);
    if (!shape) return;

    shape.points.forEach((p, i) => {
      const handle = L.marker(this.map.toLatLng(p), {
        draggable: true,
        icon: L.divIcon({ className: "gwo-vertex-handle", iconSize: [12, 12], iconAnchor: [6, 6] })
      });
      handle.on("drag", () => {
        const ll = handle.getLatLng();
        shape.points[i] = this.map.fromLatLng(ll);
        this._redrawSelectedShapeOnly();
      });
      handle.on("dragend", () => this._notifyChange());
      handle.addTo(this.map.handlesLayer);
    });
  }

  /** Lightweight live-update while dragging a vertex, without a full re-render + handle rebuild. */
  _redrawSelectedShapeOnly() {
    renderOutlook(this.map, this.data, {
      editable: this.editable,
      selectedId: this.selected ? this.selected.id : null,
      onShapeClick: (id) => { if (this.tool === "select") this._select("shape", id); },
      onMarkerClick: (id) => { if (this.tool === "select") this._select("marker", id); },
      onMarkerDrag: (id, lon, lat) => {
        const marker = this.data.markers.find((m) => m.id === id);
        if (marker) { marker.lon = lon; marker.lat = lat; }
      }
    });
  }

  _notifyChange() {
    this.render();
    if (this.hooks.onChange) this.hooks.onChange(this.getData());
  }
}
