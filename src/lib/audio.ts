/**
 * Web Audio API synthesizer for timer completion chimes.
 *
 * No asset files needed — all tones are generated programmatically via
 * OscillatorNode + GainNode.  Works even when the tab is backgrounded
 * because AudioContext is not throttled the same way as rAF.
 *
 * Call `playCompletionChime()` on timer completion.  The context is
 * lazily created on first user gesture (required by browsers) and
 * reused thereafter.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (ctx && ctx.state !== "closed") {
    // Resume if suspended (e.g. after tab backgrounding)
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  ctx = new AudioContext();
  return ctx;
}

/**
 * Eagerly create and resume the AudioContext on user gesture.
 * Call this from a click/tap handler on the app shell so browsers
 * unblock audio playback before the timer needs to fire alarms.
 */
export function resumeAudioContext(): void {
  try {
    const ac = getCtx();
    if (ac.state === "suspended") ac.resume();
  } catch {
    // Web Audio not available — silently ignore
  }
}

/**
 * Schedule a single sine tone at the given frequency & duration.
 */
function scheduleTone(
  ac: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  volume: number,
  detune: number = 0,
) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, startTime);
  if (detune) osc.detune.setValueAtTime(detune, startTime);

  // Quick fade-in, sustain, smooth fade-out
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
  gain.gain.setValueAtTime(volume, startTime + duration - 0.08);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(gain);
  gain.connect(ac.destination);

  osc.start(startTime);
  osc.stop(startTime + duration);
}

/**
 * Play a pleasant multi-layer chime sequence.
 *
 * Structure (three ascending bell tones followed by a soft pad):
 *   Tone 1 — E5  (659 Hz)  0.0s   0.40s
 *   Tone 2 — G#5 (831 Hz)  0.15s  0.40s
 *   Tone 3 — B5  (988 Hz)  0.30s  0.50s
 *   Tone 4 — E6 (1319 Hz)  0.45s  0.70s   (shimmer)
 *   Pad    — E4  (330 Hz)  0.0s   1.60s   (warm undertone)
 */
export function playCompletionChime(): void {
  let ac: AudioContext;
  try {
    ac = getCtx();
  } catch {
    // Web Audio not available — silently ignore
    return;
  }

  const now = ac.currentTime + 0.01; // tiny offset to avoid clicks

  // Bell tones — higher harmonics with slight detuning for richness
  const bells: [number, number, number, number][] = [
    [659.25, 0.0, 0.40, 0.22],   // E5
    [830.61, 0.15, 0.40, 0.20],  // G#5
    [987.77, 0.30, 0.50, 0.18],  // B5
    [1318.5, 0.45, 0.70, 0.15],  // E6 — shimmer
  ];

  for (const [freq, offset, dur, vol] of bells) {
    scheduleTone(ac, freq, now + offset, dur, vol);
    // Slight detuned double for chorus effect
    scheduleTone(ac, freq, now + offset, dur, vol * 0.4, 6);
  }

  // Warm undertone pad
  scheduleTone(ac, 329.63, now, 1.6, 0.08);   // E4
  scheduleTone(ac, 164.81, now, 1.6, 0.04);   // E3 (sub-octave)

  // Soft high shimmer overtone
  scheduleTone(ac, 2637.0, now + 0.45, 0.50, 0.04); // E7
}

/**
 * Play a softer "tick" chime used for the last-5-seconds warning.
 * Single short tone.
 */
export function playWarningTick(): void {
  let ac: AudioContext;
  try {
    ac = getCtx();
  } catch {
    return;
  }

  const now = ac.currentTime + 0.01;
  scheduleTone(ac, 880, now, 0.12, 0.10); // A5
  scheduleTone(ac, 1760, now, 0.08, 0.04); // A6 overtone
}
