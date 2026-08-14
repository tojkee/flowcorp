// Yandex Games platform integration.
//
// The game must run identically OUTSIDE the platform (local dev, itch.io, plain
// static hosting), so every export here degrades to a harmless no-op when the
// SDK is absent: `initYandexPlatform()` always resolves, `isYandex()` is false,
// and the ad/gameplay calls simply do nothing.
//
// What the platform requires of us (and where it is satisfied):
//   • SDK connected and initialized      → initYandexPlatform()
//   • LoadingAPI.ready() once playable   → notifyGameReady(), called from main.jsx
//   • GameplayAPI.start/stop             → notifyGameplay(), driven by tab visibility
//   • progress saved in platform storage → getPlatformStorage() feeds core/storage.js
//   • ads only at logical pauses, with   → showInterstitial() / showRewardedVideo(),
//     gameplay paused while they show      both stop gameplay for the duration
//   • player data in the cloud           → loadCloudSave() / saveCloudSave()

import { setAudioSuspended } from "../audio/sfx.js";

// Monetization switch. The ad integration below is complete, but it ships
// TURNED OFF because no advertising network is connected to the developer
// account: without one every ad call resolves to "nothing was shown", and a
// rewarded button that promises a bonus and then does nothing is worse than no
// button at all. Flip this to true once monetization is connected in the
// console — no other change is needed.
const ADS_ENABLED = false;

const SDK_URL = "/sdk.js";
const SDK_TIMEOUT_MS = 4000;
// player.setData is rate-limited (100 calls / 5 min). The local save runs on a
// 5s autosave; the cloud copy only needs to be eventually consistent, so it is
// throttled hard and also flushed when the player leaves.
const CLOUD_SYNC_MIN_INTERVAL_MS = 60_000;
const CLOUD_SAVE_KEY = "roster";

let ysdk = null;
let player = null;
// `desiredGameplay` is what the APP says (is a company on screen and running);
// `adOpen` is what an ad imposes. The markup we report is the combination, so a
// stale captured flag can never resurrect gameplay the player has left.
let desiredGameplay = false;
let adOpen = false;
let gameplayReported = false;
let readyRequested = false;
let readySent = false;
let lastCloudSyncAt = 0;
let pendingCloudPayload = null;

export function isYandex() {
  return Boolean(ysdk);
}

// The SDK is only ever served by the platform itself. On a local dev host there
// is nothing at /sdk.js, so skip the request entirely and keep the dev console
// clean. This is a load-time convenience only — it never gates gameplay, which
// the platform explicitly forbids.
function isLocalHost() {
  const host = typeof location === "undefined" ? "" : location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "";
}

function loadSdkScript() {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(false);
    if (window.YaGames) return resolve(true);
    if (isLocalHost()) return resolve(false);

    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    // Off-platform (local dev) /sdk.js simply 404s — that is the expected path,
    // not an error, so it resolves false and the game runs standalone.
    script.onload = () => resolve(Boolean(window.YaGames));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);

    window.setTimeout(() => resolve(Boolean(window.YaGames)), SDK_TIMEOUT_MS);
  });
}

// The full handshake, with no deadline of its own. It keeps running even after
// initYandexPlatform() has already answered, so an SDK that arrives late still
// gets wired up — critically, it still fires LoadingAPI.ready(), without which
// the platform's own loading screen never goes away.
async function bootstrapSdk() {
  const loaded = await loadSdkScript();
  if (!loaded) return null;

  ysdk = await window.YaGames.init();

  // safeStorage mimics localStorage but survives the iOS app updates that wipe
  // it, and is the storage the platform expects a game to use.
  let storage = null;
  try {
    storage = await ysdk.getStorage();
  } catch {
    storage = null;
  }

  try {
    player = await ysdk.getPlayer({ scopes: false });
  } catch {
    player = null;
  }

  // The game may have declared itself playable while we were still loading.
  fireReadyIfPossible();
  applyGameplay();
  return { available: true, language: ysdk?.environment?.i18n?.lang?.toLowerCase() ?? null, storage };
}

const UNAVAILABLE = { available: false, language: null, storage: null };

// Resolves with what the app needs at boot: the platform language (so a Russian
// player never lands on the English build) and the storage to persist into.
// Never rejects, and never blocks the game for longer than SDK_TIMEOUT_MS — a
// slow SDK must delay the platform features, never the first frame.
export function initYandexPlatform() {
  const handshake = bootstrapSdk().catch(() => {
    ysdk = null;
    return null;
  });
  const deadline = new Promise((resolve) => {
    setTimeout(() => resolve(null), SDK_TIMEOUT_MS);
  });
  return Promise.race([handshake, deadline]).then((result) => result ?? UNAVAILABLE);
}

// The platform hides its loading screen only after this call, so it must fire
// once the first playable frame is on screen. Recording the request separately
// from sending it means a late-initializing SDK still gets told.
export function notifyGameReady() {
  readyRequested = true;
  fireReadyIfPossible();
}

function fireReadyIfPossible() {
  if (!ysdk || !readyRequested || readySent) return;
  readySent = true;
  try {
    ysdk.features.LoadingAPI?.ready();
  } catch {
    // Ignore — an SDK hiccup must not stop the game from running.
  }
}

// Gameplay markup: on while the player is actually playing, off while the tab is
// hidden, the player is back in the menu, or an ad is on screen. Idempotent, so
// callers can fire it from any lifecycle event without tracking current state.
export function notifyGameplay(active) {
  desiredGameplay = Boolean(active);
  applyGameplay();
}

function applyGameplay() {
  const active = desiredGameplay && !adOpen;
  if (!ysdk || gameplayReported === active) return;
  gameplayReported = active;
  try {
    if (active) ysdk.features.GameplayAPI?.start();
    else ysdk.features.GameplayAPI?.stop();
  } catch {
    // Ignore.
  }
}

// A fullscreen ad. Only ever called from a logical pause (see App.jsx), with
// gameplay stopped for the duration as the platform requires.
function beginAd() {
  adOpen = true;
  applyGameplay();
  setAudioSuspended(true, "ad");
}

// Restores whatever the app wants NOW, which is not necessarily what it wanted
// when the ad opened: an ad shown on the way back to the menu must not restart
// gameplay markup for a company the player has already left.
function endAd() {
  adOpen = false;
  applyGameplay();
  setAudioSuspended(false, "ad");
}

export function showInterstitial() {
  if (!ADS_ENABLED || !ysdk) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      ysdk.adv.showFullscreenAdv({
        callbacks: {
          onOpen: beginAd,
          onClose: (wasShown) => {
            endAd();
            resolve(Boolean(wasShown));
          },
          onError: () => {
            endAd();
            resolve(false);
          },
        },
      });
    } catch {
      endAd();
      resolve(false);
    }
  });
}

// A rewarded video. Resolves true ONLY when the impression was counted, so the
// caller can grant the reward without a second check.
export function showRewardedVideo() {
  if (!ADS_ENABLED || !ysdk) return Promise.resolve(false);
  return new Promise((resolve) => {
    let rewarded = false;
    try {
      ysdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: beginAd,
          onRewarded: () => {
            rewarded = true;
          },
          onClose: () => {
            endAd();
            resolve(rewarded);
          },
          onError: () => {
            endAd();
            resolve(false);
          },
        },
      });
    } catch {
      endAd();
      resolve(false);
    }
  });
}

// Is a rewarded offer worth showing at all? With ads off, or off-platform, there
// is no ad to play — so the button stays hidden rather than promising a reward
// it cannot deliver.
export function canShowRewarded() {
  return ADS_ENABLED && Boolean(ysdk);
}

// --- Cloud save -------------------------------------------------------------

export async function loadCloudSave() {
  if (!player) return null;
  try {
    const data = await player.getData([CLOUD_SAVE_KEY]);
    const raw = data?.[CLOUD_SAVE_KEY];
    return typeof raw === "string" ? raw : null;
  } catch {
    return null;
  }
}

// Throttled: the local save runs every few seconds, the cloud copy at most once
// a minute (plus a forced flush when the player leaves), which keeps us far
// inside the platform's rate limit.
export function saveCloudSave(raw, { force = false } = {}) {
  if (!player || typeof raw !== "string") return;
  pendingCloudPayload = raw;
  const now = Date.now();
  if (!force && now - lastCloudSyncAt < CLOUD_SYNC_MIN_INTERVAL_MS) return;
  lastCloudSyncAt = now;
  const payload = pendingCloudPayload;
  pendingCloudPayload = null;
  try {
    player.setData({ [CLOUD_SAVE_KEY]: payload }, false);
  } catch {
    // Ignore — the local save remains the source of truth.
  }
}
