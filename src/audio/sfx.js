// Sound effects, synthesized at runtime with the Web Audio API.
//
// There are no audio FILES: every cue is a few oscillator notes with a short
// envelope. That keeps the download at zero bytes (the build is already heavy
// with art), matches the chiptune register of the pixel art, and means a new
// cue is a line of data rather than a new asset to author.
//
// Rules this module respects:
//   • Browsers only allow audio after a user gesture      → primeAudio() on first tap
//   • Yandex Games requires silence while an ad is shown  → setAudioSuspended(true)
//   • A muted game must stay muted across sessions        → persisted preference

import { readKey, writeKey } from "../core/storage.js";

const STORAGE_KEY = "flowcorp.sound.v1";
const MASTER_GAIN = 0.22;

// Each cue is a sequence of [frequency, startOffset, duration] notes plus a
// waveform. Kept as plain data so the whole sound design is readable at once.
const CUES = {
  // Money arrived — the sound the player should want to hear again.
  cash: { type: "square", gain: 1, notes: [[880, 0, 0.06], [1318.5, 0.055, 0.09]] },
  // Someone joined the company.
  hire: { type: "triangle", gain: 1.1, notes: [[523.25, 0, 0.06], [659.25, 0.05, 0.06], [783.99, 0.1, 0.1]] },
  // A tool was installed: the system itself got better.
  automation: { type: "square", gain: 0.9, notes: [[659.25, 0, 0.06], [880, 0.06, 0.06], [1046.5, 0.12, 0.12]] },
  // A goal was completed.
  goal: { type: "triangle", gain: 1, notes: [[783.99, 0, 0.08], [1046.5, 0.08, 0.14]] },
  // A bottleneck cleared — relief, not triumph.
  unblocked: { type: "triangle", gain: 0.8, notes: [[440, 0, 0.07], [659.25, 0.07, 0.11]] },
  // Something is wrong. Low and short, never shrill.
  alert: { type: "square", gain: 0.55, notes: [[196, 0, 0.1], [155.56, 0.1, 0.16]] },
  // Milestone fanfare.
  achievement: { type: "square", gain: 1, notes: [[523.25, 0, 0.07], [659.25, 0.07, 0.07], [783.99, 0.14, 0.07], [1046.5, 0.21, 0.18]] },
  // UI tap. Barely there on purpose.
  tap: { type: "triangle", gain: 0.35, notes: [[1174.66, 0, 0.025]] },
};

// Payments can land several times a second in a well-run company; without this
// the cash cue would turn into a drone.
const MIN_INTERVAL_MS = { cash: 320, alert: 2500 };

let context = null;
let master = null;
// Resolved lazily, NOT at module scope: this module is imported before the boot
// sequence installs the platform storage backend, so reading here on load would
// consult the wrong storage and silently lose a muted preference.
let muted = null;
// Silence has several independent causes (an ad is playing, the tab is hidden).
// A single boolean lets whichever one ends last un-mute the others — during an
// ad that would break a platform rule — so each reason is tracked separately.
const suspendReasons = new Set();
const lastPlayedAt = {};

export function isMuted() {
  if (muted === null) muted = readKey(STORAGE_KEY) === "off";
  return muted;
}

export function setMuted(next) {
  muted = Boolean(next);
  writeKey(STORAGE_KEY, muted ? "off" : "on");
  if (master) master.gain.value = muted ? 0 : MASTER_GAIN;
}

// Must be called from a real user gesture — browsers refuse to start an audio
// context otherwise. Safe to call repeatedly.
export function primeAudio() {
  if (typeof window === "undefined") return;
  const Ctor = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctor) return;

  if (!context) {
    try {
      context = new Ctor();
      master = context.createGain();
      master.gain.value = isMuted() ? 0 : MASTER_GAIN;
      master.connect(context.destination);
    } catch {
      context = null;
      return;
    }
  }
  if (context.state === "suspended" && !suspendReasons.size) context.resume().catch(() => {});
}

// Silence everything while an ad plays ("ad", required by the platform) or the
// tab is in the background ("hidden"). Sound returns only once EVERY reason has
// been cleared, so a tab regaining focus mid-ad cannot un-mute the ad.
export function setAudioSuspended(next, reason = "app") {
  if (next) suspendReasons.add(reason);
  else suspendReasons.delete(reason);
  if (!context) return;
  if (suspendReasons.size) context.suspend().catch(() => {});
  else context.resume().catch(() => {});
}

export function playSfx(id) {
  const cue = CUES[id];
  if (!cue || isMuted() || suspendReasons.size || !context || context.state !== "running") return;

  const minInterval = MIN_INTERVAL_MS[id];
  if (minInterval) {
    const now = Date.now();
    if (now - (lastPlayedAt[id] ?? 0) < minInterval) return;
    lastPlayedAt[id] = now;
  }

  const start = context.currentTime;
  for (const [frequency, offset, duration] of cue.notes) {
    playNote(frequency, start + offset, duration, cue.type, cue.gain);
  }
}

function playNote(frequency, at, duration, type, gain) {
  try {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    // A short attack and an exponential tail: square waves clip audibly without it.
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  } catch {
    // A dead audio context must never break gameplay.
  }
}
