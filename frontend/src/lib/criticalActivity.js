// src/lib/criticalActivity.js
// Tracks whether something safety-critical or unsaved is happening right
// now (e.g. an SOS hold/send in progress), so the PWA auto-update logic
// in PWAManager.jsx knows to defer its reload instead of firing blind.
//
// Deliberately plain module-level state, not React state or a store —
// this needs to be read from a non-React context (a service-worker
// message listener), and a simple counter is enough: it supports more
// than one critical-activity source later (e.g. an unsaved farmer-visit
// form) without them stepping on each other.

let activeCount = 0;

export function beginCriticalActivity() {
  activeCount += 1;
}

export function endCriticalActivity() {
  activeCount = Math.max(0, activeCount - 1);
}

export function isCriticalActivityActive() {
  return activeCount > 0;
}