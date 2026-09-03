import "@testing-library/jest-dom/vitest";

// ── Mock BroadcastChannel (jsdom doesn't provide it) ──────────────────────────
class MockBroadcastChannel {
  name: string;
  private listeners: Record<string, ((ev: MessageEvent) => void)[]> = {};
  onmessage: ((ev: MessageEvent) => void) | null = null;

  constructor(name: string) {
    this.name = name;
  }

  postMessage(data: unknown) {
    // no-op in tests
  }

  addEventListener(type: string, listener: (ev: MessageEvent) => void) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (ev: MessageEvent) => void) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
  }

  close() {
    this.listeners = {};
  }
}

if (typeof globalThis.BroadcastChannel === "undefined") {
  (globalThis as Record<string, unknown>).BroadcastChannel = MockBroadcastChannel;
}

// ── Mock Worker (jsdom doesn't provide it) ────────────────────────────────────
class MockWorker {
  url: string;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;

  constructor(url: string | URL) {
    this.url = typeof url === "string" ? url : url.toString();
  }

  postMessage(_data: unknown) {}
  terminate() {}
  addEventListener(_type: string, _listener: (...args: unknown[]) => void) {}
  removeEventListener(_type: string, _listener: (...args: unknown[]) => void) {}
}

if (typeof globalThis.Worker === "undefined") {
  (globalThis as Record<string, unknown>).Worker = MockWorker;
}

// ── Mock AudioContext ──────────────────────────────────────────────────────────
if (typeof globalThis.AudioContext === "undefined") {
  (globalThis as Record<string, unknown>).AudioContext = class MockAudioContext {
    state = "running";
    sampleRate = 44100;
    currentTime = 0;
    destination = {};
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
    createGain() {
      return {
        gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() { return this; },
        disconnect() {},
      };
    }
    createOscillator() {
      return {
        type: "sine",
        frequency: { value: 440 },
        connect() { return this; },
        disconnect() {},
        start() {},
        stop() {},
      };
    }
    createBiquadFilter() {
      return {
        type: "lowpass",
        frequency: { value: 1000 },
        Q: { value: 1 },
        connect() { return this; },
        disconnect() {},
      };
    }
    createBuffer(_channels: number, length: number, sampleRate: number) {
      return {
        getChannelData() {
          return new Float32Array(length);
        },
        sampleRate,
        length,
        numberOfChannels: _channels,
      };
    }
    createBufferSource() {
      return {
        buffer: null,
        loop: false,
        connect() { return this; },
        disconnect() {},
        start() {},
        stop() {},
      };
    }
  };
}

// ── Suppress noisy console.error during expected test failures ────────────────
const originalError = console.error;
console.error = (...args: unknown[]) => {
  if (
    typeof args[0] === "string" &&
    args[0].includes("Warning: ReactDOM.render is no longer supported")
  ) {
    return;
  }
  originalError(...args);
};
