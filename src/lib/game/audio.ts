import { collectibleIdentityFor } from "../game-rules";
import type { Curio } from "../scale-data";

type PickupSoundProfile = {
  wave: OscillatorType;
  base: number;
  glide: number;
  interval: number;
  decay: number;
};

const PICKUP_SOUND_PROFILES: Record<Curio["shape"], PickupSoundProfile> = {
  bubble: { wave: "sine", base: 180, glide: 1.8, interval: 1.5, decay: 0.2 },
  spark: { wave: "triangle", base: 620, glide: 2.2, interval: 2, decay: 0.11 },
  quark: { wave: "square", base: 280, glide: 1.4, interval: 1.25, decay: 0.13 },
  hadron: { wave: "sawtooth", base: 150, glide: 0.72, interval: 1.5, decay: 0.16 },
  atom: { wave: "sine", base: 440, glide: 1.5, interval: 2, decay: 0.18 },
  molecule: { wave: "triangle", base: 350, glide: 1.25, interval: 1.33, decay: 0.2 },
  virus: { wave: "sawtooth", base: 240, glide: 1.8, interval: 1.5, decay: 0.15 },
  cell: { wave: "sine", base: 300, glide: 0.78, interval: 1.25, decay: 0.24 },
  fiber: { wave: "triangle", base: 520, glide: 0.65, interval: 1.5, decay: 0.12 },
  dust: { wave: "square", base: 700, glide: 0.55, interval: 1.6, decay: 0.07 },
  stone: { wave: "triangle", base: 170, glide: 0.62, interval: 1.25, decay: 0.12 },
  object: { wave: "square", base: 360, glide: 1.2, interval: 1.5, decay: 0.1 },
  chair: { wave: "sawtooth", base: 230, glide: 0.75, interval: 1.33, decay: 0.13 },
  car: { wave: "sawtooth", base: 180, glide: 0.58, interval: 2, decay: 0.16 },
  house: { wave: "triangle", base: 130, glide: 0.7, interval: 1.5, decay: 0.2 },
  mountain: { wave: "sine", base: 95, glide: 1.33, interval: 2, decay: 0.24 },
  planet: { wave: "sine", base: 120, glide: 1.8, interval: 1.5, decay: 0.28 },
  star: { wave: "triangle", base: 480, glide: 1.65, interval: 2, decay: 0.24 },
  system: { wave: "sine", base: 260, glide: 1.25, interval: 1.618, decay: 0.28 },
  galaxy: { wave: "sine", base: 210, glide: 0.72, interval: 1.5, decay: 0.32 },
  universe: { wave: "triangle", base: 160, glide: 2.1, interval: 2, decay: 0.35 },
};

type GameAudioOptions = {
  isEnabled: () => boolean;
  pickedCount: () => number;
};

export function createGameAudio({
  isEnabled,
  pickedCount,
}: GameAudioOptions) {
  let context: AudioContext | null = null;

  const ensureContext = () => {
    const AudioConstructor =
      window.AudioContext ||
      (window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;
    if (!AudioConstructor) return null;
    context ??= new AudioConstructor();
    return context;
  };

  const ping = (pitch = 440, fanfare = false) => {
    if (!isEnabled()) return;
    const audio = ensureContext();
    if (!audio) return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const now = audio.currentTime;
    oscillator.type = fanfare ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(pitch, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      pitch * (fanfare ? 2.25 : 1.4),
      now + (fanfare ? 0.38 : 0.1),
    );
    gain.gain.setValueAtTime(fanfare ? 0.1 : 0.045, now);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      now + (fanfare ? 0.46 : 0.13),
    );
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(now + (fanfare ? 0.47 : 0.14));
  };

  const playPickupSound = (curio: Curio, sourceEra: number) => {
    if (!isEnabled()) return;
    const audio = ensureContext();
    if (!audio) return;
    const profile = PICKUP_SOUND_PROFILES[curio.shape];
    const identity = collectibleIdentityFor(curio.id, curio.shape);
    const itemPitch = 2 ** (((identity.seed % 17) - 8) / 38);
    const eraPitch = 2 ** ((sourceEra % 6) / 18);
    const basePitch = profile.base * itemPitch * eraPitch;
    const start =
      audio.currentTime +
      (pickedCount() % 3) * 0.009 +
      identity.soundRhythm * 0.18;
    const master = audio.createGain();
    const filter = audio.createBiquadFilter();
    filter.type = identity.seed % 4 === 0 ? "bandpass" : "lowpass";
    filter.Q.setValueAtTime(0.7 + identity.soundBrightness * 4.2, start);
    filter.frequency.setValueAtTime(
      Math.min(7600, basePitch * (5 + identity.soundBrightness * 5)),
      start,
    );
    master.gain.setValueAtTime(0.0001, start);
    master.gain.exponentialRampToValueAtTime(0.034, start + 0.012);
    master.gain.exponentialRampToValueAtTime(
      0.0001,
      start + profile.decay + identity.soundRhythm,
    );
    filter.connect(master);
    master.connect(audio.destination);

    identity.soundRatios.forEach((signatureRatio, index) => {
      const oscillator = audio.createOscillator();
      const ratio =
        signatureRatio * (index === 1 ? profile.interval / 1.5 : 1);
      oscillator.type =
        index === 0
          ? profile.wave
          : index === 1
            ? identity.soundWave
            : "sine";
      const noteStart = start + index * identity.soundRhythm;
      oscillator.detune.setValueAtTime(
        index === 2 ? ((identity.seed >>> 8) % 13) - 6 : 0,
        noteStart,
      );
      oscillator.frequency.setValueAtTime(basePitch * ratio, noteStart);
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(35, basePitch * ratio * profile.glide),
        noteStart + profile.decay * (0.62 + index * 0.12),
      );
      oscillator.connect(filter);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + profile.decay + 0.035);
    });

    if (identity.soundNoise <= 0.34) return;
    const sampleCount = Math.max(
      1,
      Math.floor(audio.sampleRate * 0.045),
    );
    const buffer = audio.createBuffer(1, sampleCount, audio.sampleRate);
    const samples = buffer.getChannelData(0);
    let noiseState = identity.seed || 1;
    for (let index = 0; index < samples.length; index += 1) {
      noiseState ^= noiseState << 13;
      noiseState ^= noiseState >>> 17;
      noiseState ^= noiseState << 5;
      samples[index] =
        (((noiseState >>> 0) / 0xffffffff) * 2 - 1) *
        (1 - index / samples.length);
    }
    const noise = audio.createBufferSource();
    const noiseGain = audio.createGain();
    noise.buffer = buffer;
    noiseGain.gain.setValueAtTime(identity.soundNoise * 0.018, start);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
    noise.connect(noiseGain);
    noiseGain.connect(master);
    noise.start(start);
  };

  return {
    ping,
    playPickupSound,
    resume() {
      void ensureContext()?.resume();
    },
    close() {
      const active = context;
      if (active && active.state !== "closed") void active.close();
      context = null;
    },
  };
}
