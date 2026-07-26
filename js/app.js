import { mapDefaults } from "./config.js";
import { WindstormMap } from "./map.js";
import { OutlookEditor } from "./editor.js";
import { watchAuth, login, logout } from "./auth.js";
import { publishOutlook, subscribeLatest, listArchive, getOutlookById } from "./outlook-store.js";

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

// ---------------------------------------------------------------- state
let currentUser = null;
let userIsEditor = false;
let liveUnsub = null;
let latestSnapshot = null;
let activeArchiveId = null; // null == "live latest"

// ---------------------------------------------------------------- map + editor
const map = new WindstormMap(mapRoot, mapDefaults);

const editor = new OutlookEditor(map, {
  onChange: () => {
    publishStatus.textContent = "Unsaved changes";
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
  }
});

map.init();

// ---------------------------------------------------------------- header helpers
function formatIssued(ts) {
  if (!ts) return "Issued: \u2014";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const iso = date.toUTCString().replace("GMT", "UTC");
  return `Issued: ${iso}`;
}

function applyOutlookToView(data, { editable } = { editable: false }) {
  editor.setData(data || { shapes: [], markers: [] });
  outlookTitleEl.textContent = (data && data.title) || "Graphical Windstorm Outlook";
  outlookIssuedEl.textContent = formatIssued(data && data.issuedAt);
  if (editable) titleInput.value = (data && data.title) || "Graphical Windstorm Outlook";
  publishStatus.textContent = "";
}

// ---------------------------------------------------------------- live subscription (read-only visitors)
function startLiveSubscription() {
  if (liveUnsub) return;
  liveUnsub = subscribeLatest((data) => {
    latestSnapshot = data;
    if (activeArchiveId === null) applyOutlookToView(data);
  });
}
function stopLiveSubscription() {
  if (liveUnsub) {
    liveUnsub();
    liveUnsub = null;
  }
}

startLiveSubscription();

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
    applyOutlookToView(latestSnapshot, { editable: true });
  } else {
    toolPanel.classList.add("hidden");
    editor.setTool(null);
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
    await publishOutlook({ title: titleInput.value.trim(), ...data }, currentUser);
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
    const rows = await listArchive();
    if (!rows.length) {
      archiveList.innerHTML = '<p class="muted">No published outlooks yet.</p>';
      return;
    }
    archiveList.innerHTML = "";

    const liveRow = document.createElement("div");
    liveRow.className = "archive-row";
    if (activeArchiveId === null) liveRow.classList.add("active");
    liveRow.innerHTML = '<div class="archive-row-title">Current (live)</div><div class="archive-row-meta">latest published outlook</div>';
    liveRow.addEventListener("click", () => {
      activeArchiveId = null;
      applyOutlookToView(latestSnapshot, { editable: userIsEditor });
      document.querySelectorAll(".archive-row").forEach((r) => r.classList.remove("active"));
      liveRow.classList.add("active");
    });
    archiveList.appendChild(liveRow);

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
        const full = await getOutlookById(row.id);
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

archiveToggle.addEventListener("click", openArchive);
archiveClose.addEventListener("click", closeArchive);
drawerScrim.addEventListener("click", closeArchive);
