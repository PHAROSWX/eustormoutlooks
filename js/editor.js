import { renderOutlook } from "./renderer.js";
import { DEFAULT_CONE_STEP_KM, DEFAULT_CONE_SMOOTH } from "./theme.js";

const L = window.L;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function angleFromVector(dx, dy) {
  // 0deg = pointing up/north, increasing clockwise -- matches CSS rotate().
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

const CLOSE_RADIUS_PX = 14;
const DEFAULT_HOUR_STEP = 24;

export class OutlookEditor {
  /**
   * @param {import('./map.js').WindstormMap} map
   * @param {{onChange:Function, onSelectionChange:Function, onCoord:Function, onSystemClick:Function}} hooks
   */
  constructor(map, hooks = {}) {
    this.map = map;
    this.hooks = hooks;
    this.data = { shapes: [], markers: [], systems: [] };
    this.tool = null;
    this.value = null;
    this.draft = null;
    this.arrowDraft = null; // { lon, lat, anchorPoint, angle } -- two-click gesture
    this.selected = null; // { type: 'shape'|'marker', id }
    this.activeSystemId = null;
    this.coneStepKm = DEFAULT_CONE_STEP_KM;
    this.hourStepDefault = DEFAULT_HOUR_STEP;
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
      markers: (data && data.markers) ? data.markers.map((m) => ({ ...m })) : [],
      systems: (data && data.systems) ? data.systems.map((s) => ({
        coneSmooth: DEFAULT_CONE_SMOOTH,
        ...s,
        track: (s.track || []).map((p) => [...p]),
        forecast: (s.forecast || []).map((p) => ({ ...p }))
      })) : []
    };
    this.draft = null;
    this.arrowDraft = null;
    this.selected = null;
    this.activeSystemId = null;
    this.render();
  }

  getData() {
    return {
      shapes: this.data.shapes.map((s) => ({ ...s })),
      markers: this.data.markers.map((m) => ({ ...m })),
      systems: this.data.systems.map((s) => ({
        ...s,
        track: (s.track || []).map((p) => [...p]),
        forecast: (s.forecast || []).map((p) => ({ ...p }))
      }))
    };
  }

  setTool(tool, value = null) {
    const changingWhileDrafting = this.tool === "polygon" && (tool !== "polygon" || value !== this.value);
    if (changingWhileDrafting) this._cancelDraft();
    if (this.tool === "movement" && tool !== "movement") this._cancelArrowDraft();
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

  // ------------------------------------------------------------- systems
  addSystem() {
    const n = this.data.systems.length + 1;
    const system = {
      id: uid(),
      label: `System ${n}`,
      classification: "potential",
      discussion: "",
      track: [],
      forecast: [],
      coneSmooth: DEFAULT_CONE_SMOOTH
    };
    this.data.systems.push(system);
    this.activeSystemId = system.id;
    this._notifyChange();
    return system;
  }

  setActiveSystem(id) {
    this.activeSystemId = this.activeSystemId === id ? null : id;
    this.render();
  }

  getActiveSystem() {
    return this.data.systems.find((s) => s.id === this.activeSystemId) || null;
  }

  updateActiveSystemField(field, value) {
    const system = this.getActiveSystem();
    if (!system) return;
    system[field] = value;
    this._notifyChange();
  }

  deleteActiveSystem() {
    if (!this.activeSystemId) return;
    this.data.systems = this.data.systems.filter((s) => s.id !== this.activeSystemId);
    this.activeSystemId = null;
    this._notifyChange();
  }

  removeLastTrackPoint() {
    const system = this.getActiveSystem();
    if (!system || !system.track.length) return;
    system.track.pop();
    this._notifyChange();
  }

  /** Update one field (lon, lat, radiusKm, hours) of a specific forecast point by index. */
  updateForecastPoint(index, field, value) {
    const system = this.getActiveSystem();
    if (!system || !system.forecast[index]) return;
    system.forecast[index][field] = value;
    this._notifyChange();
  }

  removeForecastPointAt(index) {
    const system = this.getActiveSystem();
    if (!system || !system.forecast[index]) return;
    system.forecast.splice(index, 1);
    this._notifyChange();
  }

  setConeStepKm(km) {
    this.coneStepKm = km;
  }

  setHourStep(hours) {
    this.hourStepDefault = hours;
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
      tool: this.tool,
      selectedId: this.selected && this.selected.type === "shape" ? this.selected.id : null,
      activeSystemId: this.activeSystemId,
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
      },
      onSystemClick: (id) => {
        this.setActiveSystem(id);
        if (this.hooks.onSystemClick) this.hooks.onSystemClick(this.activeSystemId);
      }
    });
    this._renderVertexHandles();
  }

  // ------------------------------------------------------------- map events
  _bindMapEvents() {
    this.map.map.on("click", (e) => this._handleClick(e));
    this.map.map.on("dblclick", (e) => this._handleDblClick(e));
    this.map.map.on("mousemove", (e) => this._handleMove(e));
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
    } else if (this.tool === "track") {
      this._addTrackPoint(lon, lat);
    } else if (this.tool === "forecast") {
      this._addForecastPoint(lon, lat);
    } else if (this.tool === "movement") {
      this._handleMovementClick(e, lon, lat);
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
    if (this.draft && this.draft.length) this._renderDraft();
    if (this.arrowDraft) this._updateArrowDraft(e);
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

  _addTrackPoint(lon, lat) {
    const system = this.getActiveSystem();
    if (!system) return;
    system.track.push([lon, lat]);
    this._notifyChange();
  }

  _addForecastPoint(lon, lat) {
    const system = this.getActiveSystem();
    if (!system) return;
    const n = system.forecast.length + 1;
    system.forecast.push({ lon, lat, radiusKm: n * this.coneStepKm, hours: n * this.hourStepDefault });
    this._notifyChange();
  }

  // ------------------------------------------------------------- point markers
  _placeMarker(marker) {
    if (marker.kind === "chance" && !marker.tier) return;
    if (marker.kind === "classification" && !marker.subtype) return;
    this.data.markers.push({ id: uid(), ...marker });
    this._notifyChange();
  }

  // ------------------------------------------------------------- movement arrows (click to anchor, click to aim)
  _handleMovementClick(e, lon, lat) {
    if (!this.value) return;
    if (!this.arrowDraft) {
      this.arrowDraft = { lon, lat, anchorPoint: this.map.containerPointOf(e.latlng), angle: 0 };
      this._renderArrowDraft();
      return;
    }
    const { angle } = this.arrowDraft;
    this.data.markers.push({ id: uid(), kind: "movement", tier: this.value, lon: this.arrowDraft.lon, lat: this.arrowDraft.lat, angle });
    this._cancelArrowDraft();
    this._notifyChange();
  }

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
    const len = 40;
    const endPt = L.point(startPt.x + len * Math.sin(rad), startPt.y - len * Math.cos(rad));
    const endLatLng = this.map.map.containerPointToLatLng(endPt);
    L.circleMarker(start, { renderer: this.map.renderer, radius: 4, color: "#2c8a80", fillColor: "#2c8a80", fillOpacity: 1 })
      .addTo(this.map.draftLayer);
    L.polyline([start, endLatLng], { renderer: this.map.renderer, color: "#2c8a80", weight: 2.4 })
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
      tool: this.tool,
      selectedId: this.selected ? this.selected.id : null,
      activeSystemId: this.activeSystemId,
      onShapeClick: (id) => { if (this.tool === "select") this._select("shape", id); },
      onMarkerClick: (id) => { if (this.tool === "select") this._select("marker", id); },
      onMarkerDrag: (id, lon, lat) => {
        const marker = this.data.markers.find((m) => m.id === id);
        if (marker) { marker.lon = lon; marker.lat = lat; }
      },
      onSystemClick: () => {}
    });
  }

  _notifyChange() {
    this.render();
    if (this.hooks.onChange) this.hooks.onChange(this.getData());
  }
}
