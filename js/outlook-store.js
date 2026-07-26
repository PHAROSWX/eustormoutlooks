import {
  collection, addDoc, doc, getDoc, getDocs,
  query, orderBy, limit, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-init.js";

const OUTLOOKS = "outlooks";

export async function publishOutlook({ title, shapes, markers }, user) {
  const ref = await addDoc(collection(db, OUTLOOKS), {
    title: title || "Graphical Windstorm Outlook",
    shapes: shapes || [],
    markers: markers || [],
    issuedAt: serverTimestamp(),
    issuedBy: user ? (user.email || user.uid) : "unknown"
  });
  return ref.id;
}

/** Live-subscribes to the single most recent published outlook. */
export function subscribeLatest(callback) {
  const q = query(collection(db, OUTLOOKS), orderBy("issuedAt", "desc"), limit(1));
  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      callback(null);
      return;
    }
    const d = snap.docs[0];
    callback({ id: d.id, ...d.data() });
  });
}

/** One-off fetch of the archive list (id/title/issuedAt only, capped at 100). */
export async function listArchive(max = 100) {
  const q = query(collection(db, OUTLOOKS), orderBy("issuedAt", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getOutlookById(id) {
  const snap = await getDoc(doc(db, OUTLOOKS, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
