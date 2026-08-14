// Key/value storage adapter. Everything the game persists (save roster,
// language, guidance mode, onboarding flags) goes through here instead of
// touching `localStorage` directly, so a host platform can swap in its own
// storage without any call site knowing about it.
//
// Yandex Games requires platform storage rather than raw localStorage, and its
// `ysdk.getStorage()` returns a localStorage-compatible object — so swapping the
// backend at boot is all the integration needs (see platform/yandex.js).

function defaultBackend() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Storage can throw on access alone (private mode, blocked cookies).
  }
  return null;
}

let backend = defaultBackend();

// Called once at boot, before anything reads a save.
export function setStorageBackend(next) {
  if (next && typeof next.getItem === "function" && typeof next.setItem === "function") backend = next;
}

export function readKey(key) {
  try {
    return backend?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

// Every write is best-effort: storage may be unavailable or over quota, and a
// failed save must never break the running game.
export function writeKey(key, value) {
  try {
    backend?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key) {
  try {
    backend?.removeItem(key);
  } catch {
    // Ignore.
  }
}
