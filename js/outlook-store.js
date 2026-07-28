import {
  collection, addDoc, doc, getDoc, getDocs,
  query, orderBy, limit, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-init.js";

export const COLLECTIONS = {
  standard: "outlooks",
  extended: "extendedOutlooks"
};

// Firestore does not support arrays-of-arrays (our shape.points are
// [lon, lat] tuples), so we translate to/from {lon, lat} objects only at
// the persistence boundary -- every other module keeps using [lon, lat].
function toFirestoreShapes(shapes = []) {
  return shapes.map((s) => ({
    ...s,
    points: (s.points || []).map(([lon, lat]) => ({ lon, lat }))
  }));
}
function fromFirestoreShapes(shapes = []) {
  return shapes.map((s) => ({
    ...s,
    points: (s.points || []).map((p) => (Array.isArray(p) ? p : [p.lon, p.lat]))
  }));
}

// Systems' track points and warning-area points are also [lon, lat] tuples
// -- same nested-array translation as shapes.points.
function toFirestoreSystems(systems = []) {
  return systems.map((s) => ({
    ...s,
    track: (s.track || []).map(([lon, lat]) => ({ lon, lat })),
    warnings: (s.warnings || []).map((w) => ({
      ...w,
      points: (w.points || []).map(([lon, lat]) => ({ lon, lat }))
    }))
  }));
}
function fromFirestoreSystems(systems = []) {
  return systems.map((s) => ({
    ...s,
    track: (s.track || []).map((p) => (Array.isArray(p) ? p : [p.lon, p.lat])),
    warnings: (s.warnings || []).map((w) => ({
      ...w,
      points: (w.points || []).map((p) => (Array.isArray(p) ? p : [p.lon, p.lat]))
    }))
  }));
}

function fromFirestoreDoc(id, data) {
  return {
    id,
    ...data,
    shapes: fromFirestoreShapes(data.shapes),
    systems: fromFirestoreSystems(data.systems)
  };
}

export async function publishOutlook({ title, shapes, markers, systems }, user, collectionName = COLLECTIONS.standard) {
  const ref = await addDoc(collection(db, collectionName), {
    title: title || "Graphical Windstorm Outlook",
    shapes: toFirestoreShapes(shapes || []),
    markers: markers || [],
    systems: toFirestoreSystems(systems || []),
    issuedAt: serverTimestamp(),
    issuedBy: user ? (user.email || user.uid) : "unknown"
  });
  return ref.id;
}

/** Live-subscribes to the single most recent published outlook in the given collection. */
export function subscribeLatest(callback, collectionName = COLLECTIONS.standard) {
  const q = query(collection(db, collectionName), orderBy("issuedAt", "desc"), limit(1));
  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      callback(null);
      return;
    }
    const d = snap.docs[0];
    callback(fromFirestoreDoc(d.id, d.data()));
  });
}

/** One-off fetch of the archive list (id/title/issuedAt only, capped at 100). */
export async function listArchive(max = 100, collectionName = COLLECTIONS.standard) {
  const q = query(collection(db, collectionName), orderBy("issuedAt", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getOutlookById(id, collectionName = COLLECTIONS.standard) {
  const snap = await getDoc(doc(db, collectionName, id));
  if (!snap.exists()) return null;
  return fromFirestoreDoc(snap.id, snap.data());
}
