import { mapDefaults } from "./config.js";
import { WindstormMap } from "./map.js";
import { OutlookEditor } from "./editor.js";
import { watchAuth, login, logout } from "./auth.js";
import { publishOutlook, subscribeLatest, listArchive, getOutlookById, COLLECTIONS } from "./outlook-store.js";
import { exportOutlookPNG, exportKeyMessagesPNG } from "./export.js";

// ---------------------------------------------------------------- DOM refs
const $ = (sel) => document.querySelector(sel);

const mapRoot = $("#mapRoot");
const coordReadout = $("#coordReadout");
const outlookTitleEl = $("#outlookTitle");
const outlookIssuedEl = $("#outlookIssued");

const toolPanel = $("#toolPanel");
const toolButtons = document.querySelectorAll(".tool-btn");
const zoneNote = $("#zoneNote");
const deleteSelectedBtn = $("#deleteSelected");
const titleInput = $("#titleInput");
const publishBtn = $("#publishBtn");
const publishStatus = $("#publishStatus");

const loginBtn = $("#loginBtn");
const userBadge = $("#userBadge");
const userEmail = $("#userEmail");
const logoutBtn = $("#logoutBtn");

const loginModal = $("#loginModal");
const emailInput = $("#emailInput");
const passwordInput = $("#passwordInput");
const loginError = $("#loginError");
const loginSubmit = $("#loginSubmit");
const loginCancel = $("#loginCancel");

const archiveToggle = $("#archiveToggle");
const archiveDrawer = $("#archiveDrawer");
const archiveClose = $("#archiveClose");
const archiveList = $("#archiveList");
const drawerScrim = $("#drawerScrim");

const systemsList = $("#systemsList");
const newSystemBtn = $("#newSystemBtn");
const systemEditor = $("#systemEditor");
const systemLabel = $("#systemLabel");
const systemClassification = $("#systemClassification");
const advisoryHistory = $("#advisoryHistory");
const newAdvisoryText = $("#newAdvisoryText");
const newAdvisoryWind = $("#newAdvisoryWind");
const postAdvisoryBtn = $("#postAdvisoryBtn");
const undoTrackPoint = $("#undoTrackPoint");
const hourStepDefault = $("#hourStepDefault");
const coneStepKm = $("#coneStepKm");
const coneSmooth = $("#coneSmooth");
const forecastPointsList = $("#forecastPointsList");
const removeLastWarningBtn = $("#removeLastWarningBtn");
const keyMessagesList = $("#keyMessagesList");
const newKeyMessageText = $("#newKeyMessageText");
const addKeyMessageBtn = $("#addKeyMessageBtn");
const exportKeyMessagesBtn = $("#exportKeyMessagesBtn");
const deleteSystemBtn = $("#deleteSystemBtn");

const exportPngBtn = $("#exportPngBtn");

// ---------------------------------------------------------------- mode (standard 2-day vs extended 7-day)
const MODE_META = {
  standard: { collection: COLLECTIONS.standard, defaultTitle: "Graphical Windstorm Outlook" },
  extended: { collection: COLLECTIONS.extended, defaultTitle: "7-Day Extended Outlook" }
};
let currentMode = "standard";
const latestByMode = { standard: null, extended: null };

// ---------------------------------------------------------------- state
let currentUser = null;
let userIsEditor = false;
let liveUnsub = null;
let activeArchiveId = null; // null == "live latest"

// ---------------------------------------------------------------- map + editor
const map = new WindstormMap(mapRoot, mapDefaults);

const editor = new OutlookEditor(map, {
  onChange: () => {
    publishStatus.textContent = "Unsaved changes";
    refreshSystemsPanel();
  },
  onSelectionChange: (selected) => {
    if (selected && selected.type === "shape") {
      zoneNote.disabled = false;
      zoneNote.value = editor.getSelectedShapeNote();
      deleteSelectedBtn.disabled = false;
    } else if (selected && selected.type === "marker") {
      zoneNote.disabled = true;
      zoneNote.value = "";
      deleteSelectedBtn.disabled = false;
    } else {
      zoneNote.disabled = true;
      zoneNote.value = "";
      deleteSelectedBtn.disabled = true;
    }
  },
  onCoord: (lon, lat) => {
    const ns = lat >= 0 ? "N" : "S";
    const ew = lon >= 0 ? "E" : "W";
    coordReadout.textContent = `${Math.abs(lat).toFixed(2)}\u00B0${ns}  ${Math.abs(lon).toFixed(2)}\u00B0${ew}`;
  },
  onSystemClick: (id) => {
    editor.setActiveSystem(id);
    refreshSystemsPanel();
  }
});

map.init().catch((err) => console.error("Failed to load base map:", err));

// ---------------------------------------------------------------- header helpers
function formatIssued(ts) {
  if (!ts) return "Issued: \u2014";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const iso = date.toUTCString().replace("GMT", "UTC");
  return `Issued: ${iso}`;
}

function applyOutlookToView(data, { editable } = { editable: false }) {
  editor.setData(data || { shapes: [], markers: [], systems: [] });
  const fallbackTitle = MODE_META[currentMode].defaultTitle;
  outlookTitleEl.textContent = (data && data.title) || fallbackTitle;
  outlookIssuedEl.textContent = formatIssued(data && data.issuedAt);
  if (editable) titleInput.value = (data && data.title) || fallbackTitle;
  publishStatus.textContent = "";
  refreshSystemsPanel();
}

// ---------------------------------------------------------------- live subscription (read-only visitors)
function startLiveSubscription() {
  if (liveUnsub) return;
  const mode = currentMode;
  liveUnsub = subscribeLatest((data) => {
    latestByMode[mode] = data;
    if (mode === currentMode && activeArchiveId === null) applyOutlookToView(data);
  }, MODE_META[mode].collection);
}
function stopLiveSubscription() {
  if (liveUnsub) {
    liveUnsub();
    liveUnsub = null;
  }
}

startLiveSubscription();

// ---------------------------------------------------------------- systems panel
let lastForecastSignature = "";

function refreshSystemsPanel() {
  const data = editor.getData();
  const systems = data.systems || [];
  systemsList.innerHTML = "";

  if (!systems.length) {
    const p = document.createElement("p");
    p.className = "empty-hint";
    p.textContent = "No tracked systems yet.";
    systemsList.appendChild(p);
  }

  systems.forEach((s) => {
    const pill = document.createElement("button");
    pill.className = "system-pill" + (s.id === editor.activeSystemId ? " active" : "");
    pill.innerHTML = `<img src="img/icons/${s.classification || "potential"}.png" alt="">
      <span class="system-pill-label">${s.label || "Untitled system"}</span>`;
    pill.addEventListener("click", () => {
      editor.setActiveSystem(s.id);
      refreshSystemsPanel();
    });
    systemsList.appendChild(pill);
  });

  const active = editor.getActiveSystem();
  if (active && userIsEditor) {
    systemEditor.classList.remove("hidden");
    if (document.activeElement !== systemLabel) systemLabel.value = active.label || "";
    systemClassification.value = active.classification || "potential";
    hourStepDefault.value = editor.hourStepDefault;
    coneStepKm.value = editor.coneStepKm;
    coneSmooth.checked = active.coneSmooth !== false;

    renderAdvisoryHistory(active);
    renderKeyMessagesList(active);

    // Only rebuild the list (which would steal focus) when the point count
    // actually changed -- not on every keystroke while editing a value.
    const signature = `${active.id}:${active.forecast.length}`;
    if (signature !== lastForecastSignature) {
      renderForecastPointsList(active);
      lastForecastSignature = signature;
    }
  } else {
    systemEditor.classList.add("hidden");
    lastForecastSignature = "";
  }
}

function renderAdvisoryHistory(system) {
  advisoryHistory.innerHTML = "";
  if (!system.advisories.length) {
    const p = document.createElement("p");
    p.className = "empty-hint";
    p.textContent = "No advisories posted yet.";
    advisoryHistory.appendChild(p);
    return;
  }
  [...system.advisories].reverse().forEach((a) => {
    const row = document.createElement("div");
    row.className = "advisory-row";
    const date = new Date(a.issuedAt);
    row.innerHTML = `<div class="advisory-row-head">Advisory #${a.number} &middot; ${date.toUTCString().replace("GMT", "UTC")}</div>
      ${a.windSpeedKmh ? `<div class="advisory-row-wind">Max sustained winds: ${a.windSpeedKmh} km/h</div>` : ""}
      <div class="advisory-row-text"></div>`;
    row.querySelector(".advisory-row-text").textContent = a.text;
    advisoryHistory.appendChild(row);
  });
}

function renderKeyMessagesList(system) {
  keyMessagesList.innerHTML = "";
  if (!system.keyMessages.length) {
    const p = document.createElement("p");
    p.className = "empty-hint";
    p.textContent = "No key messages yet.";
    keyMessagesList.appendChild(p);
    return;
  }
  system.keyMessages.forEach((msg, i) => {
    const row = document.createElement("div");
    row.className = "key-message-row";
    const bullet = document.createElement("span");
    bullet.className = "key-message-bullet";
    bullet.textContent = "\u2022";
    const text = document.createElement("span");
    text.className = "key-message-text";
    text.textContent = msg;
    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn-text key-message-remove";
    removeBtn.textContent = "\u2715";
    removeBtn.addEventListener("click", () => editor.removeKeyMessage(i));
    row.appendChild(bullet);
    row.appendChild(text);
    row.appendChild(removeBtn);
    keyMessagesList.appendChild(row);
  });
}

function renderForecastPointsList(system) {
  forecastPointsList.innerHTML = "";
  if (!system.forecast.length) {
    const p = document.createElement("p");
    p.className = "empty-hint";
    p.textContent = "No forecast points yet.";
    forecastPointsList.appendChild(p);
    return;
  }
  system.forecast.forEach((pt, i) => {
    const row = document.createElement("div");
    row.className = "forecast-point-row";

    const hourInput = document.createElement("input");
    hourInput.type = "number";
    hourInput.min = "1";
    hourInput.title = "Forecast hour (+h)";
    hourInput.value = pt.hours != null ? pt.hours : (i + 1) * editor.hourStepDefault;
    hourInput.addEventListener("input", () => {
      editor.updateForecastPoint(i, "hours", Number(hourInput.value) || 0);
    });

    const hourSuffix = document.createElement("span");
    hourSuffix.className = "forecast-point-suffix";
    hourSuffix.textContent = "h";

    const radiusInput = document.createElement("input");
    radiusInput.type = "number";
    radiusInput.min = "1";
    radiusInput.step = "10";
    radiusInput.title = "Cone radius at this point (km)";
    radiusInput.value = pt.radiusKm;
    radiusInput.addEventListener("input", () => {
      editor.updateForecastPoint(i, "radiusKm", Number(radiusInput.value) || 1);
    });

    const radiusSuffix = document.createElement("span");
    radiusSuffix.className = "forecast-point-suffix";
    radiusSuffix.textContent = "km";

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn-text forecast-point-remove";
    removeBtn.textContent = "\u2715";
    removeBtn.title = "Remove this forecast point";
    removeBtn.addEventListener("click", () => {
      editor.removeForecastPointAt(i);
    });

    row.appendChild(hourInput);
    row.appendChild(hourSuffix);
    row.appendChild(radiusInput);
    row.appendChild(radiusSuffix);
    row.appendChild(removeBtn);
    forecastPointsList.appendChild(row);
  });
}

newSystemBtn.addEventListener("click", () => {
  editor.addSystem();
  refreshSystemsPanel();
});
systemLabel.addEventListener("input", () => editor.updateActiveSystemField("label", systemLabel.value));
systemClassification.addEventListener("change", () => {
  editor.updateActiveSystemField("classification", systemClassification.value);
});
postAdvisoryBtn.addEventListener("click", () => {
  editor.postAdvisory(newAdvisoryText.value, Number(newAdvisoryWind.value) || null);
  newAdvisoryText.value = "";
  newAdvisoryWind.value = "";
});
undoTrackPoint.addEventListener("click", () => editor.removeLastTrackPoint());
hourStepDefault.addEventListener("input", () => editor.setHourStep(Number(hourStepDefault.value) || 24));
coneStepKm.addEventListener("input", () => editor.setConeStepKm(Number(coneStepKm.value) || 60));
removeLastWarningBtn.addEventListener("click", () => editor.removeLastWarning());
addKeyMessageBtn.addEventListener("click", () => {
  editor.addKeyMessage(newKeyMessageText.value);
  newKeyMessageText.value = "";
});
coneSmooth.addEventListener("change", () => editor.updateActiveSystemField("coneSmooth", coneSmooth.checked));
deleteSystemBtn.addEventListener("click", () => {
  editor.deleteActiveSystem();
  refreshSystemsPanel();
});

// ---------------------------------------------------------------- auth wiring
watchAuth(({ user, isEditor }) => {
  currentUser = user;
  userIsEditor = isEditor;

  if (user) {
    loginBtn.classList.add("hidden");
    userBadge.classList.remove("hidden");
    userEmail.textContent = user.email || user.uid;
  } else {
    loginBtn.classList.remove("hidden");
    userBadge.classList.add("hidden");
  }

  if (isEditor) {
    toolPanel.classList.remove("hidden");
    stopLiveSubscription();
    activeArchiveId = null;
    editor.setEditable(true);
    applyOutlookToView(latestByMode[currentMode], { editable: true });
  } else {
    toolPanel.classList.add("hidden");
    editor.setTool(null);
    editor.setEditable(false);
    startLiveSubscription();
  }
});

loginBtn.addEventListener("click", () => {
  loginError.classList.add("hidden");
  emailInput.value = "";
  passwordInput.value = "";
  loginModal.classList.remove("hidden");
});
loginCancel.addEventListener("click", () => loginModal.classList.add("hidden"));
loginSubmit.addEventListener("click", async () => {
  try {
    await login(emailInput.value.trim(), passwordInput.value);
    loginModal.classList.add("hidden");
  } catch (err) {
    loginError.textContent = "Sign-in failed. Check your email and password.";
    loginError.classList.remove("hidden");
  }
});
logoutBtn.addEventListener("click", () => logout());

// ---------------------------------------------------------------- toolbar
toolButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tool = btn.dataset.tool;
    const tier = btn.dataset.tier || null;
    toolButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    editor.setTool(tool, tier);
  });
});

deleteSelectedBtn.addEventListener("click", () => editor.deleteSelected());
zoneNote.addEventListener("input", () => editor.updateSelectedNote(zoneNote.value));

publishBtn.addEventListener("click", async () => {
  if (!userIsEditor) return;
  publishBtn.disabled = true;
  publishStatus.textContent = "Publishing\u2026";
  try {
    const data = editor.getData();
    await publishOutlook({ title: titleInput.value.trim(), ...data }, currentUser, MODE_META[currentMode].collection);
    publishStatus.textContent = "Published.";
    outlookTitleEl.textContent = titleInput.value.trim();
    outlookIssuedEl.textContent = formatIssued(new Date());
  } catch (err) {
    console.error(err);
    publishStatus.textContent = "Publish failed \u2014 see console.";
  } finally {
    publishBtn.disabled = false;
  }
});

// ---------------------------------------------------------------- archive drawer
async function openArchive() {
  archiveDrawer.classList.add("open");
  drawerScrim.classList.remove("hidden");
  archiveList.innerHTML = '<p class="muted">Loading\u2026</p>';
  try {
    const rows = await listArchive(100, MODE_META[currentMode].collection);
    archiveList.innerHTML = "";

    const liveRow = document.createElement("div");
    liveRow.className = "archive-row";
    if (activeArchiveId === null) liveRow.classList.add("active");
    liveRow.innerHTML = '<div class="archive-row-title">Current (live)</div><div class="archive-row-meta">latest published outlook</div>';
    liveRow.addEventListener("click", () => {
      activeArchiveId = null;
      applyOutlookToView(latestByMode[currentMode], { editable: userIsEditor });
      document.querySelectorAll(".archive-row").forEach((r) => r.classList.remove("active"));
      liveRow.classList.add("active");
    });
    archiveList.appendChild(liveRow);

    if (!rows.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "No published outlooks yet.";
      archiveList.appendChild(p);
      return;
    }

    rows.forEach((row) => {
      const el = document.createElement("div");
      el.className = "archive-row";
      if (row.id === activeArchiveId) el.classList.add("active");
      const title = document.createElement("div");
      title.className = "archive-row-title";
      title.textContent = row.title || "Untitled outlook";
      const meta = document.createElement("div");
      meta.className = "archive-row-meta";
      meta.textContent = formatIssued(row.issuedAt).replace("Issued: ", "");
      el.appendChild(title);
      el.appendChild(meta);
      el.addEventListener("click", async () => {
        const full = await getOutlookById(row.id, MODE_META[currentMode].collection);
        activeArchiveId = row.id;
        applyOutlookToView(full);
        document.querySelectorAll(".archive-row").forEach((r) => r.classList.remove("active"));
        el.classList.add("active");
      });
      archiveList.appendChild(el);
    });
  } catch (err) {
    archiveList.innerHTML = '<p class="muted">Could not load archive.</p>';
    console.error(err);
  }
}

function closeArchive() {
  archiveDrawer.classList.remove("open");
  drawerScrim.classList.add("hidden");
}

// ---------------------------------------------------------------- nav tabs / mode switching
const navTabs = document.querySelectorAll(".nav-tab");
function setActiveTab(name) {
  navTabs.forEach((t) => t.classList.toggle("active", t.dataset.nav === name));
}

function switchMode(mode) {
  if (mode === currentMode) return;
  currentMode = mode;
  activeArchiveId = null;
  closeArchive();

  if (userIsEditor) {
    stopLiveSubscription();
    applyOutlookToView(latestByMode[currentMode], { editable: true });
  } else {
    stopLiveSubscription();
    startLiveSubscription();
    // Show whatever we already have cached (if any) immediately; the live
    // subscription callback will refresh it a moment later regardless.
    applyOutlookToView(latestByMode[currentMode], { editable: false });
  }
}

document.querySelector('.nav-tab[data-nav="outlook"]').addEventListener("click", () => {
  closeArchive();
  setActiveTab("outlook");
  switchMode("standard");
});
document.querySelector('.nav-tab[data-nav="extended"]').addEventListener("click", () => {
  closeArchive();
  setActiveTab("extended");
  switchMode("extended");
});
archiveToggle.addEventListener("click", () => {
  setActiveTab("archive");
  openArchive();
});
archiveClose.addEventListener("click", () => {
  closeArchive();
  setActiveTab(currentMode === "extended" ? "extended" : "outlook");
});
drawerScrim.addEventListener("click", () => {
  closeArchive();
  setActiveTab(currentMode === "extended" ? "extended" : "outlook");
});

// ---------------------------------------------------------------- zoom controls
$("#zoomIn").addEventListener("click", () => map.zoomBy(1.5));
$("#zoomOut").addEventListener("click", () => map.zoomBy(1 / 1.5));

// ---------------------------------------------------------------- export
exportPngBtn.addEventListener("click", async () => {
  exportPngBtn.disabled = true;
  const originalText = exportPngBtn.textContent;
  exportPngBtn.textContent = "Exporting\u2026";
  try {
    await exportOutlookPNG(map, editor.getData(), {
      title: outlookTitleEl.textContent,
      issuedText: outlookIssuedEl.textContent
    });
  } catch (err) {
    console.error("PNG export failed:", err);
  } finally {
    exportPngBtn.disabled = false;
    exportPngBtn.textContent = originalText;
  }
});

exportKeyMessagesBtn.addEventListener("click", async () => {
  const active = editor.getActiveSystem();
  if (!active) return;
  exportKeyMessagesBtn.disabled = true;
  try {
    await exportKeyMessagesPNG(active, outlookTitleEl.textContent);
  } catch (err) {
    console.error("Key Messages export failed:", err);
  } finally {
    exportKeyMessagesBtn.disabled = false;
  }
});
