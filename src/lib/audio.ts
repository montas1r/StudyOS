/**
 * Web Audio API synthesizer for timer completion chimes AND
 * Focus Frequencies & Binaural Noise module.
 *
 * All tones are generated programmatically via OscillatorNode + GainNode.
 * No external MP3 files needed.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (ctx && ctx.state !== "closed") {
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  ctx = new AudioContext();
  return ctx;
}

export function resumeAudioContext(): void {
  try {
    const ac = getCtx();
    if (ac.state === "suspended") ac.resume();
  } catch { /* Web Audio not available */ }
}

export function getSharedAudioContext(): AudioContext | null {
  try { return getCtx(); } catch { return null; }
}

/* ================================================================
   TIMER CHIMES
   ================================================================ */

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
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
  gain.gain.setValueAtTime(volume, startTime + duration - 0.08);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

export function playCompletionChime(): void {
  let ac: AudioContext;
  try { ac = getCtx(); } catch { return; }
  const now = ac.currentTime + 0.01;
  const bells: [number, number, number, number][] = [
    [659.25, 0.0, 0.40, 0.22],
    [830.61, 0.15, 0.40, 0.20],
    [987.77, 0.30, 0.50, 0.18],
    [1318.5, 0.45, 0.70, 0.15],
  ];
  for (const [freq, offset, dur, vol] of bells) {
    scheduleTone(ac, freq, now + offset, dur, vol);
    scheduleTone(ac, freq, now + offset, dur, vol * 0.4, 6);
  }
  scheduleTone(ac, 329.63, now, 1.6, 0.08);
  scheduleTone(ac, 164.81, now, 1.6, 0.04);
  scheduleTone(ac, 2637.0, now + 0.45, 0.50, 0.04);
}

export function playWarningTick(): void {
  let ac: AudioContext;
  try { ac = getCtx(); } catch { return; }
  const now = ac.currentTime + 0.01;
  scheduleTone(ac, 880, now, 0.12, 0.10);
  scheduleTone(ac, 1760, now, 0.08, 0.04);
}

/* ================================================================
   FOCUS FREQUENCIES & BINAURAL NOISE
   
   Each frequency type uses dedicated Web Audio nodes:
     gamma   — 40Hz binaural beat (peak focus)
     beta    — 14Hz binaural beat (active studying)
     alpha   — 10Hz alpha waves (deep comprehension)
     pink    — Pink noise 1/f spectrum (memory retention)
     brown   — Brown noise / Brownian (ADHD-friendly focus)
   ================================================================ */

export interface FrequencyPreset {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;     // waveform SVG path data
  color: string;    // accent color for UI
}

export const FOCUS_FREQUENCIES: FrequencyPreset[] = [
  {
    id: "gamma",
    label: "40Hz Gamma",
    shortLabel: "GAMMA",
    description: "Peak focus",
    icon: "M0,8 Q2,2 4,8 Q6,14 8,8 Q10,2 12,8 Q14,14 16,8",
    color: "#e8a33d",
  },
  {
    id: "beta",
    label: "14Hz Beta",
    shortLabel: "BETA",
    description: "Active study",
    icon: "M0,8 Q4,2 8,8 Q12,14 16,8",
    color: "#e1614b",
  },
  {
    id: "alpha",
    label: "Alpha Waves",
    shortLabel: "ALPHA",
    description: "Deep comprehension",
    icon: "M0,8 Q4,4 8,8 Q12,12 16,8",
    color: "#6fbf8b",
  },
  {
    id: "theta",
    label: "Theta Waves",
    shortLabel: "THETA",
    description: "Creativity",
    icon: "M0,8 Q2,4 4,8 Q6,12 8,8 Q10,4 12,8 Q14,12 16,8",
    color: "#6ec6e6",
  },
  {
    id: "solfeggio",
    label: "432Hz Solfeggio",
    shortLabel: "SOLF",
    description: "Relaxation",
    icon: "M0,8 C3,2 6,14 8,8 C10,2 13,14 16,8",
    color: "#d4a574",
  },
  {
    id: "pink",
    label: "Pink Noise",
    shortLabel: "PINK",
    description: "Memory retention",
    icon: "M0,8 L2,4 L4,10 L6,6 L8,9 L10,5 L12,8 L14,6 L16,8",
    color: "#c4a1d9",
  },
  {
    id: "white",
    label: "White Noise",
    shortLabel: "WHITE",
    description: "Sound masking",
    icon: "M0,8 L1,3 L2,11 L3,2 L4,12 L5,4 L6,10 L7,1 L8,13 L9,3 L10,11 L11,5 L12,9 L13,2 L14,12 L15,6 L16,8",
    color: "#b0b8c8",
  },
  {
    id: "green",
    label: "Green Noise",
    shortLabel: "GREEN",
    description: "Warm comfort",
    icon: "M0,8 L2,5 L4,9 L6,6 L8,10 L10,5 L12,9 L14,7 L16,8",
    color: "#7db87d",
  },
  {
    id: "brown",
    label: "Brown Noise",
    shortLabel: "BROWN",
    description: "ADHD-friendly",
    icon: "M0,8 L2,3 L4,11 L6,5 L8,12 L10,4 L12,10 L14,6 L16,8",
    color: "#8b7355",
  },
  {
    id: "ocean",
    label: "Ocean Waves",
    shortLabel: "OCEAN",
    description: "Rhythmic tides",
    icon: "M0,10 Q4,4 8,10 Q12,16 16,10",
    color: "#4a8fb8",
  },
];

/* -- Active frequency node tracking -- */
interface FrequencyNode {
  masterGain: GainNode;
  nodes: AudioNode[];
  stop: () => void;
}

const activeFrequenciesRef = new Map<string, FrequencyNode>();

/** Check if a frequency is currently playing */
export function isFrequencyActive(id: string): boolean {
  return activeFrequenciesRef.has(id);
}

/** Set volume for a specific active frequency (0–1) */
export function setFrequencyVolume(id: string, vol: number): void {
  const node = activeFrequenciesRef.get(id);
  if (node) {
    node.masterGain.gain.setValueAtTime(vol, (activeFrequenciesRef.get(id) as any)._ac.currentTime);
  }
}

/** Stop a single active frequency */
export function stopFrequency(id: string): void {
  const node = activeFrequenciesRef.get(id);
  if (node) {
    node.stop();
    activeFrequenciesRef.delete(id);
  }
}

/** Stop all active frequencies */
export function stopAllFrequencies(): void {
  for (const [id] of activeFrequenciesRef) {
    stopFrequency(id);
  }
}

/* -- Binaural beat generator (two slightly detuned oscillators) -- */
function createBinauralBeat(
  ac: AudioContext,
  baseFreq: number,
  beatFreq: number,
  masterGain: GainNode,
): AudioNode[] {
  // Left ear — base frequency
  const oscL = ac.createOscillator();
  oscL.type = "sine";
  oscL.frequency.value = baseFreq;

  // Right ear — offset by beat frequency
  const oscR = ac.createOscillator();
  oscR.type = "sine";
  oscR.frequency.value = baseFreq + beatFreq;

  // Split into stereo channels
  const merger = ac.createChannelMerger(2);
  const gainL = ac.createGain();
  gainL.gain.value = 0.15;
  const gainR = ac.createGain();
  gainR.gain.value = 0.15;

  oscL.connect(gainL).connect(merger, 0, 0);
  oscR.connect(gainR).connect(merger, 0, 1);
  merger.connect(masterGain);

  oscL.start();
  oscR.start();

  return [oscL, oscR, merger, gainL, gainR];
}

/* -- Brownian noise generator (integrated white noise) -- */
function createBrownNoise(
  ac: AudioContext,
  masterGain: GainNode,
): AudioNode[] {
  const bufferSize = ac.sampleRate * 2;
  const buffer = ac.createBuffer(2, bufferSize, ac.sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5; // amplify
    }
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  // Low-pass to keep it warm and rumbling
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 500;
  lp.Q.value = 0.5;

  source.connect(lp).connect(masterGain);
  source.start();

  return [source, lp];
}

/* -- White noise generator (flat spectrum) -- */
function createWhiteNoise(
  ac: AudioContext,
  masterGain: GainNode,
): AudioNode[] {
  const bufferSize = ac.sampleRate * 2;
  const buffer = ac.createBuffer(2, bufferSize, ac.sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const gain = ac.createGain();
  gain.gain.value = 0.3; // tame the raw volume

  source.connect(gain).connect(masterGain);
  source.start();

  return [source, gain];
}

/* -- Green noise generator (band-pass centered ~4000Hz, warm mid-range) -- */
function createGreenNoise(
  ac: AudioContext,
  masterGain: GainNode,
): AudioNode[] {
  const bufferSize = ac.sampleRate * 2;
  const buffer = ac.createBuffer(2, bufferSize, ac.sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Green noise = pink + brown hybrid, warm mid-range
      data[i] = (lastOut + 0.04 * white) / 1.04;
      lastOut = data[i];
      data[i] *= 3.0;
    }
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  // Bandpass to keep it warm and mid-focused
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 4000;
  bp.Q.value = 0.4;

  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 6000;
  lp.Q.value = 0.3;

  source.connect(bp).connect(lp).connect(masterGain);
  source.start();

  return [source, bp, lp];
}

/* -- Ocean waves generator (LFO-modulated filtered noise) -- */
function createOceanWaves(
  ac: AudioContext,
  masterGain: GainNode,
): AudioNode[] {
  const bufferSize = ac.sampleRate * 4;
  const buffer = ac.createBuffer(2, bufferSize, ac.sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  // Low-pass filter modulated by LFO to simulate wave swell
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 400;
  lp.Q.value = 0.7;

  // LFO: slow oscillator modulating filter cutoff
  const lfo = ac.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.08; // ~12 second wave cycle
  const lfoGain = ac.createGain();
  lfoGain.gain.value = 350;
  lfo.connect(lfoGain).connect(lp.frequency);
  lfo.start();

  // Second LFO for amplitude modulation (swell)
  const ampLfo = ac.createOscillator();
  ampLfo.type = "sine";
  ampLfo.frequency.value = 0.08;
  const ampLfoGain = ac.createGain();
  ampLfoGain.gain.value = 0.15;
  const ampOffset = ac.createGain();
  ampOffset.gain.value = 0.85;
  ampLfo.connect(ampLfoGain).connect(ampOffset.gain);
  ampLfo.start();

  source.connect(lp).connect(ampOffset).connect(masterGain);
  source.start();

  return [source, lp, lfo, lfoGain, ampLfo, ampLfoGain, ampOffset];
}

/* -- Theta waves binaural (6Hz, creativity/meditation) -- */
function createThetaWaves(
  ac: AudioContext,
  masterGain: GainNode,
): AudioNode[] {
  return createBinauralBeat(ac, 140, 6, masterGain);
}

/* -- 432Hz Solfeggio binaural (5Hz beat, deep relaxation) -- */
function createSolfeggio(
  ac: AudioContext,
  masterGain: GainNode,
): AudioNode[] {
  return createBinauralBeat(ac, 432, 5, masterGain);
}

/* -- Pink noise generator (Voss-McCartney algorithm) -- */
function createPinkNoise(
  ac: AudioContext,
  masterGain: GainNode,
): AudioNode[] {
  const bufferSize = ac.sampleRate * 2;
  const buffer = ac.createBuffer(2, bufferSize, ac.sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    // 12/octave Voss-McCartney for accurate 1/f spectrum
    const rows = 16;
    const runningSum = new Float64Array(rows);
    let val = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      let idx = 0;
      // Count trailing zeros to determine which row to update
      let n = i;
      if (n > 0) {
        while ((n & 1) === 0 && idx < rows - 1) { n >>= 1; idx++; }
      }
      val -= runningSum[idx];
      runningSum[idx] = white;
      val += white;
      data[i] = val / rows * 2.5;
    }
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  // Gentle roll-off above 8kHz for warm sound
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 8000;
  lp.Q.value = 0.3;

  source.connect(lp).connect(masterGain);
  source.start();

  return [source, lp];
}

/* -- Start a focus frequency by ID -- */
export function startFrequency(id: string, volume01: number): void {
  // Stop if already playing
  stopFrequency(id);

  const ac = getSharedAudioContext();
  if (!ac || ac.state === "closed") return;
  if (ac.state === "suspended") ac.resume();

  const masterGain = ac.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(ac.destination);

  let nodes: AudioNode[] = [];
  const allNodes: AudioNode[] = [];

  switch (id) {
    case "gamma": {
      // 40Hz binaural beat at 200Hz base (gamma range perceptible as binaural)
      // NOTE: 40Hz binaural beats use ~200Hz carrier, the beat is in the brain
      const n = createBinauralBeat(ac, 200, 40, masterGain);
      nodes = n;
      allNodes.push(...n);
      break;
    }
    case "beta": {
      // 14Hz binaural beat at 180Hz base (active study)
      const n = createBinauralBeat(ac, 180, 14, masterGain);
      nodes = n;
      allNodes.push(...n);
      break;
    }
    case "alpha": {
      // 10Hz alpha binaural beat at 160Hz base (deep comprehension)
      const n = createBinauralBeat(ac, 160, 10, masterGain);
      nodes = n;
      allNodes.push(...n);
      break;
    }
    case "theta": {
      // 6Hz theta binaural at 140Hz base (creativity/meditation)
      const n = createThetaWaves(ac, masterGain);
      nodes = n;
      allNodes.push(...n);
      break;
    }
    case "solfeggio": {
      // 432Hz base with 5Hz beat (deep relaxation)
      const n = createSolfeggio(ac, masterGain);
      nodes = n;
      allNodes.push(...n);
      break;
    }
    case "pink": {
      const n = createPinkNoise(ac, masterGain);
      nodes = n;
      allNodes.push(...n);
      break;
    }
    case "brown": {
      const n = createBrownNoise(ac, masterGain);
      nodes = n;
      allNodes.push(...n);
      break;
    }
    case "white": {
      const n = createWhiteNoise(ac, masterGain);
      nodes = n;
      allNodes.push(...n);
      break;
    }
    case "green": {
      const n = createGreenNoise(ac, masterGain);
      nodes = n;
      allNodes.push(...n);
      break;
    }
    case "ocean": {
      const n = createOceanWaves(ac, masterGain);
      nodes = n;
      allNodes.push(...n);
      break;
    }
    default:
      return;
  }

  // Fade in smoothly
  masterGain.gain.setValueAtTime(0, ac.currentTime);
  masterGain.gain.linearRampToValueAtTime(volume01, ac.currentTime + 0.5);

  const stop = () => {
    try {
      // Fade out before stopping
      masterGain.gain.setValueAtTime(masterGain.gain.value, ac.currentTime);
      masterGain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.3);
      setTimeout(() => {
        try {
          for (const n of allNodes) {
            if (n instanceof OscillatorNode) { try { n.stop(); } catch {} }
            if (n instanceof AudioBufferSourceNode) { try { n.stop(); } catch {} }
            try { n.disconnect(); } catch {}
          }
          masterGain.disconnect();
        } catch {}
      }, 350);
    } catch {}
  };

  // Store reference with access to ac for volume updates
  activeFrequenciesRef.set(id, {
    masterGain,
    nodes: allNodes,
    stop,
    _ac: ac,
  } as FrequencyNode & { _ac: AudioContext });
}

/* -- Legacy ambient track support (mapped to new frequency types) -- */
const AMBIENT_TO_FREQUENCY: Record<string, string> = {
  rain: "pink",
  forest: "brown",
  cafe: "beta",
  waves: "alpha",
};

export function startAmbient(id: string, volume01: number): void {
  const freqId = AMBIENT_TO_FREQUENCY[id] ?? id;
  startFrequency(freqId, volume01);
}

export function stopAmbient(id: string): void {
  const freqId = AMBIENT_TO_FREQUENCY[id] ?? id;
  stopFrequency(freqId);
}

export function setAmbientVolume(id: string, volume01: number): void {
  const freqId = AMBIENT_TO_FREQUENCY[id] ?? id;
  setFrequencyVolume(freqId, volume01);
}
