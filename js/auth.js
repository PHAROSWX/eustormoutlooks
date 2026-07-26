import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";

/**
 * An "editor" is any signed-in user whose uid has a document in the
 * top-level `editors` collection. Add editors from the Firebase console
 * (Firestore Database) once their auth account exists. See README.md.
 */
export async function isEditor(uid) {
  if (!uid) return false;
  try {
    const snap = await getDoc(doc(db, "editors", uid));
    return snap.exists();
  } catch (err) {
    console.error("Editor check failed:", err);
    return false;
  }
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback({ user: null, isEditor: false });
      return;
    }
    const editor = await isEditor(user.uid);
    callback({ user, isEditor: editor });
  });
}

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout() {
  await fbSignOut(auth);
}
