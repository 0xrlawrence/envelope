"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

export type SoundCue =
  | "tap"
  | "open"
  | "copy"
  | "send"
  | "return"
  | "success"
  | "error";

type SoundContextValue = {
  play: (cue: SoundCue) => void;
};

const SoundContext = createContext<SoundContextValue | null>(null);
const SOUND_PREFERENCE = "envelope:sound";

type AudioBus = {
  context: AudioContext;
  output: GainNode;
};

function shape(
  gain: AudioParam,
  at: number,
  duration: number,
  level: number,
  attack = 0.008,
) {
  gain.cancelScheduledValues(at);
  gain.setValueAtTime(0.0001, at);
  gain.exponentialRampToValueAtTime(Math.max(level, 0.0001), at + attack);
  gain.exponentialRampToValueAtTime(0.0001, at + duration);
}

function tone(
  bus: AudioBus,
  options: {
    at?: number;
    duration: number;
    frequency: number;
    endFrequency?: number;
    gain: number;
    type?: OscillatorType;
    pan?: number;
  },
) {
  const { context, output } = bus;
  const at = context.currentTime + (options.at ?? 0);
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  const panner = context.createStereoPanner();

  oscillator.type = options.type ?? "sine";
  oscillator.frequency.setValueAtTime(options.frequency, at);
  if (options.endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(
      options.endFrequency,
      at + options.duration,
    );
  }
  panner.pan.value = options.pan ?? 0;
  shape(envelope.gain, at, options.duration, options.gain);

  oscillator.connect(envelope).connect(panner).connect(output);
  oscillator.start(at);
  oscillator.stop(at + options.duration + 0.03);
}

function noise(
  bus: AudioBus,
  options: {
    at?: number;
    duration: number;
    gain: number;
    frequency: number;
    endFrequency?: number;
    q?: number;
    type?: BiquadFilterType;
    pan?: number;
  },
) {
  const { context, output } = bus;
  const at = context.currentTime + (options.at ?? 0);
  const frames = Math.ceil(context.sampleRate * options.duration);
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < frames; index += 1) {
    const fade = 1 - index / frames;
    data[index] = (Math.random() * 2 - 1) * fade;
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  const panner = context.createStereoPanner();

  source.buffer = buffer;
  filter.type = options.type ?? "bandpass";
  filter.Q.value = options.q ?? 0.8;
  filter.frequency.setValueAtTime(options.frequency, at);
  if (options.endFrequency) {
    filter.frequency.exponentialRampToValueAtTime(
      options.endFrequency,
      at + options.duration,
    );
  }
  panner.pan.value = options.pan ?? 0;
  shape(envelope.gain, at, options.duration, options.gain, 0.012);

  source.connect(filter).connect(envelope).connect(panner).connect(output);
  source.start(at);
  source.stop(at + options.duration + 0.03);
}

function perform(bus: AudioBus, cue: SoundCue) {
  switch (cue) {
    case "tap":
      noise(bus, { duration: 0.045, gain: 0.055, frequency: 2400, q: 1.4 });
      tone(bus, {
        duration: 0.055,
        frequency: 540,
        endFrequency: 390,
        gain: 0.018,
        type: "triangle",
      });
      break;
    case "open":
      noise(bus, {
        duration: 0.18,
        gain: 0.075,
        frequency: 3100,
        endFrequency: 1050,
        q: 0.75,
        pan: -0.1,
      });
      tone(bus, { at: 0.035, duration: 0.16, frequency: 392, gain: 0.025 });
      break;
    case "copy":
      tone(bus, {
        duration: 0.075,
        frequency: 880,
        endFrequency: 760,
        gain: 0.035,
        type: "triangle",
        pan: -0.08,
      });
      tone(bus, {
        at: 0.065,
        duration: 0.12,
        frequency: 1174.66,
        gain: 0.026,
        type: "sine",
        pan: 0.08,
      });
      break;
    case "send":
      noise(bus, {
        duration: 0.72,
        gain: 0.105,
        frequency: 620,
        endFrequency: 3900,
        q: 0.55,
        pan: 0.16,
      });
      tone(bus, {
        duration: 0.22,
        frequency: 110,
        endFrequency: 73.42,
        gain: 0.06,
        type: "sine",
      });
      tone(bus, { at: 0.48, duration: 0.32, frequency: 523.25, gain: 0.02, pan: 0.2 });
      break;
    case "return":
      noise(bus, {
        duration: 0.56,
        gain: 0.09,
        frequency: 2800,
        endFrequency: 520,
        q: 0.6,
        pan: -0.16,
      });
      tone(bus, {
        at: 0.12,
        duration: 0.42,
        frequency: 659.25,
        endFrequency: 329.63,
        gain: 0.028,
        pan: -0.12,
      });
      tone(bus, {
        at: 0.42,
        duration: 0.16,
        frequency: 146.83,
        endFrequency: 110,
        gain: 0.05,
      });
      break;
    case "success":
      tone(bus, {
        duration: 0.18,
        frequency: 130.81,
        endFrequency: 98,
        gain: 0.05,
        type: "sine",
      });
      tone(bus, { at: 0.045, duration: 0.5, frequency: 523.25, gain: 0.034, pan: -0.12 });
      tone(bus, { at: 0.105, duration: 0.52, frequency: 659.25, gain: 0.03 });
      tone(bus, { at: 0.165, duration: 0.56, frequency: 783.99, gain: 0.027, pan: 0.12 });
      break;
    case "error":
      tone(bus, {
        duration: 0.24,
        frequency: 220,
        endFrequency: 174.61,
        gain: 0.04,
        type: "triangle",
        pan: -0.06,
      });
      tone(bus, {
        at: 0.055,
        duration: 0.28,
        frequency: 207.65,
        endFrequency: 164.81,
        gain: 0.033,
        type: "sine",
        pan: 0.06,
      });
      break;
  }
}

export function SoundProvider({ children }: { children: ReactNode }) {
  const busRef = useRef<AudioBus | null>(null);

  useEffect(() => {
    try {
      window.localStorage.removeItem(SOUND_PREFERENCE);
    } catch {
      // Sound still works when storage is blocked.
    }
  }, []);

  useEffect(
    () => () => {
      void busRef.current?.context.close();
      busRef.current = null;
    },
    [],
  );

  const getBus = useCallback((): AudioBus | null => {
    if (busRef.current) {
      if (busRef.current.context.state === "suspended") {
        void busRef.current.context.resume();
      }
      return busRef.current;
    }

    try {
      const context = new AudioContext({ latencyHint: "interactive" });
      const compressor = context.createDynamicsCompressor();
      const output = context.createGain();

      compressor.threshold.value = -18;
      compressor.knee.value = 16;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.16;
      output.gain.value = 0.52;
      output.connect(compressor).connect(context.destination);

      busRef.current = { context, output };
      return busRef.current;
    } catch {
      return null;
    }
  }, []);

  const play = useCallback(
    (cue: SoundCue) => {
      const bus = getBus();
      if (!bus) return;
      perform(bus, cue);
    },
    [getBus],
  );

  const value = useMemo(() => ({ play }), [play]);

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound(): SoundContextValue {
  const value = useContext(SoundContext);
  if (!value) throw new Error("useSound must be used inside SoundProvider");
  return value;
}
