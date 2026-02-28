import type { DrumClipModel, DrumPattern, TrackModel } from "../model/types";
import { encodeWav } from "./utils/wav";

type RenderOptions = {
  bpm: number;
  pattern: DrumPattern;
  bars?: number;
  durationSeconds?: number;
  volume?: number;
  masterVolume?: number;
};

type ArrangementOptions = {
  bpm: number;
  songBars: number;
  tracks: TrackModel[];
  patterns: Record<string, DrumPattern>;
  durationSeconds: number;
  masterVolume: number;
};

const clampVolume = (value: number): number => Math.min(1, Math.max(0, value));

const getTrackAudibleVolume = (
  track: Pick<TrackModel, "volume" | "muted" | "solo">,
  hasSolo: boolean
): number => {
  const audible = hasSolo ? track.solo : !track.muted;
  return audible ? clampVolume(track.volume) : 0;
};

const isDrumClip = (clip: TrackModel["clips"][number]): clip is DrumClipModel => clip.kind === "drum";

// Offline renderer/export (drum pattern only).
export class Renderer {
  static async renderDrumPatternToWav(options: RenderOptions): Promise<Blob> {
    const stepsPerBar = 16;
    const stepSeconds = (60 / options.bpm) / 4;
    const bars = options.bars ?? 1;
    const durationSeconds =
      options.durationSeconds !== undefined
        ? Math.max(0, options.durationSeconds)
        : stepsPerBar * bars * stepSeconds;
    const totalSteps = Math.ceil(durationSeconds / stepSeconds);
    const sampleRate = 44_100;

    const offlineLength = Math.max(1, Math.ceil(durationSeconds * sampleRate));
    const offline = new OfflineAudioContext(2, offlineLength, sampleRate);
    const noiseBuffer = Renderer.createNoiseBuffer(offline, 0.2);
    const masterGain = offline.createGain();
    masterGain.gain.value = clampVolume(options.masterVolume ?? 1);
    masterGain.connect(offline.destination);
    const trackGain = offline.createGain();
    trackGain.gain.value = clampVolume(options.volume ?? 1);
    trackGain.connect(masterGain);

    for (let step = 0; step < totalSteps; step += 1) {
      const stepIndex = step % stepsPerBar;
      const time = step * stepSeconds;

      if (options.pattern[0]?.[stepIndex]) {
        Renderer.scheduleKick(offline, trackGain, time);
      }
      if (options.pattern[1]?.[stepIndex]) {
        Renderer.scheduleSnare(offline, trackGain, time, noiseBuffer);
      }
      if (options.pattern[2]?.[stepIndex]) {
        Renderer.scheduleHat(offline, trackGain, time, noiseBuffer);
      }
    }

    const rendered = await offline.startRendering();
    const wavBuffer = encodeWav(rendered);
    return new Blob([wavBuffer], { type: "audio/wav" });
  }

  static async renderDrumArrangementToWav(options: ArrangementOptions): Promise<Blob> {
    const stepsPerBar = 16;
    const stepSeconds = (60 / options.bpm) / 4;
    const durationSeconds = Math.max(0, options.durationSeconds);
    const totalSteps = Math.ceil(durationSeconds / stepSeconds);
    const sampleRate = 44_100;

    const offlineLength = Math.max(1, Math.ceil(durationSeconds * sampleRate));
    const offline = new OfflineAudioContext(2, offlineLength, sampleRate);
    const noiseBuffer = Renderer.createNoiseBuffer(offline, 0.2);
    const masterGain = offline.createGain();
    masterGain.gain.value = clampVolume(options.masterVolume);
    masterGain.connect(offline.destination);

    const hasSolo = options.tracks.some((track) => track.solo);
    const trackOutputs = new Map<string, GainNode>();
    for (const track of options.tracks) {
      const gainNode = offline.createGain();
      gainNode.gain.value = getTrackAudibleVolume(track, hasSolo);
      gainNode.connect(masterGain);
      trackOutputs.set(track.id, gainNode);
    }

    const safeSongBars = Math.max(1, options.songBars);

    for (let step = 0; step < totalSteps; step += 1) {
      const stepIndex = step % stepsPerBar;
      const barIndex = Math.floor(step / stepsPerBar) % safeSongBars;
      const time = step * stepSeconds;

      for (const track of options.tracks) {
        if (track.type !== "drum") {
          continue;
        }

        const output = trackOutputs.get(track.id);
        if (!output || output.gain.value <= 0) {
          continue;
        }

        const activeClip =
          track.clips
            .filter(isDrumClip)
            .sort((a, b) => a.startBar - b.startBar)
            .find(
              (clip) => barIndex >= clip.startBar && barIndex < clip.startBar + clip.lengthBars
            ) ?? null;

        if (!activeClip) {
          continue;
        }

        const pattern = options.patterns[activeClip.patternId];
        if (!pattern) {
          continue;
        }

        if (pattern[0]?.[stepIndex]) {
          Renderer.scheduleKick(offline, output, time);
        }
        if (pattern[1]?.[stepIndex]) {
          Renderer.scheduleSnare(offline, output, time, noiseBuffer);
        }
        if (pattern[2]?.[stepIndex]) {
          Renderer.scheduleHat(offline, output, time, noiseBuffer);
        }
      }
    }

    const rendered = await offline.startRendering();
    const wavBuffer = encodeWav(rendered);
    return new Blob([wavBuffer], { type: "audio/wav" });
  }

  private static scheduleKick(ctx: BaseAudioContext, destination: AudioNode, time: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(50, time + 0.12);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.8, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(time);
    osc.stop(time + 0.22);
  }

  private static scheduleSnare(
    ctx: BaseAudioContext,
    destination: AudioNode,
    time: number,
    noiseBuffer: AudioBuffer
  ): void {
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1800;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(destination);

    const tone = ctx.createOscillator();
    tone.type = "triangle";
    tone.frequency.value = 180;
    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(0.18, time);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);

    tone.connect(toneGain);
    toneGain.connect(destination);

    noise.start(time);
    noise.stop(time + 0.2);
    tone.start(time);
    tone.stop(time + 0.2);
  }

  private static scheduleHat(
    ctx: BaseAudioContext,
    destination: AudioNode,
    time: number,
    noiseBuffer: AudioBuffer
  ): void {
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 6000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    noise.start(time);
    noise.stop(time + 0.08);
  }

  private static createNoiseBuffer(ctx: BaseAudioContext, durationSeconds: number): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * durationSeconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}
