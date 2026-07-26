// ============================================================================
// Firebase project configuration
// ----------------------------------------------------------------------------
// Get these values from: Firebase Console > Project settings > General >
// "Your apps" > Web app > SDK setup and configuration > Config.
// See README.md for full step-by-step setup instructions.
// ============================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyAERvpoYEqkl_TER4WX6KGXC5fZXPjh-Oo",
  authDomain: "windstorm-outlook.firebaseapp.com",
  projectId: "windstorm-outlook",
  storageBucket: "windstorm-outlook.firebasestorage.app",
  messagingSenderId: "312726410387",
  appId: "1:312726410387:web:dff7b7927d142900b22966"
};

// Map initial view: [longitude, latitude] center and a rough zoom scale.
// Defaults roughly frame the North Atlantic + Europe, matching the example bulletin.
export const mapDefaults = {
  center: [-20, 48],
  scaleFactor: 380
};
