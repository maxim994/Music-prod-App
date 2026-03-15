import type {
  AudioClipModel,
  AutomationPointModel,
  DrumClipModel,
  DrumPattern,
  SynthClipModel,
  TrackModel
} from "../model/types";
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
const MIN_AUTOMATION_STEP = 1 / 16;

const clampTrackBpm = (value: number, fallbackBpm: number): number => {
  if (!Number.isFinite(value)) {
    return Math.max(30, Math.min(300, Math.round(fallbackBpm)));
  }
  return Math.max(30, Math.min(300, Math.round(value)));
};

const getTrackTempoRatio = (track: Pick<TrackModel, "bpm">, projectBpm: number): number =>
  clampTrackBpm(track.bpm, projectBpm) / Math.max(1, projectBpm);

const getTrackAudibleVolume = (
  track: Pick<TrackModel, "volume" | "muted" | "solo">,
  hasSolo: boolean
): number => {
  const audible = hasSolo ? track.solo : !track.muted;
  return audible ? clampVolume(track.volume) : 0;
};

const isDrumClip = (clip: TrackModel["clips"][number]): clip is DrumClipModel => clip.kind === "drum";
const isAudioClip = (clip: TrackModel["clips"][number]): clip is AudioClipModel => clip.kind === "audio";
const isSynthClip = (clip: TrackModel["clips"][number]): clip is SynthClipModel => clip.kind === "synth";

const toOscillatorType = (oscillator: TrackModel["synthSettings"]["oscillator"]): OscillatorType =>
  oscillator === "saw" ? "sawtooth" : oscillator;

const midiToFrequency = (pitch: number): number => 440 * 2 ** ((pitch - 69) / 12);
const clampFilterFrequency = (value: number): number => Math.max(80, Math.min(18_000, value));
const createDriveCurve = (amount: number): Float32Array => {
  const safeAmount = Math.max(0, Math.min(1, amount));
  const samples = 512;
  const curve = new Float32Array(samples);
  const drive = 1 + safeAmount * 18;

  for (let index = 0; index < samples; index += 1) {
    const x = (index / (samples - 1)) * 2 - 1;
    curve[index] = Math.tanh(x * drive);
  }

  return curve;
};

const sortAutomationPoints = (points: AutomationPointModel[]): AutomationPointModel[] =>
  [...points].sort((left, right) => left.bar - right.bar);

type SynthNoteEvent = {
  duration: number;
  pitch: number;
  startTime: number;
  velocity: number;
};

const buildMonophonicNoteEvents = (events: SynthNoteEvent[]): SynthNoteEvent[] =>
  events.map((event, index) => {
    const nextEvent = events[index + 1];
    if (!nextEvent || nextEvent.startTime >= event.startTime + event.duration) {
      return event;
    }

    return {
      ...event,
      duration: Math.max(0.03, nextEvent.startTime - event.startTime)
    };
  });

const getTrackAutomationValueAtBar = (
  track: Pick<TrackModel, "volume" | "automationPoints">,
  barPosition: number
): number => {
  if (track.automationPoints.length === 0) {
    return clampVolume(track.volume);
  }

  const points = sortAutomationPoints(track.automationPoints);
  if (barPosition <= points[0].bar) {
    return clampVolume(points[0].value);
  }

  const lastPoint = points[points.length - 1];
  if (barPosition >= lastPoint.bar) {
    return clampVolume(lastPoint.value);
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const leftPoint = points[index];
    const rightPoint = points[index + 1];
    if (barPosition < leftPoint.bar || barPosition > rightPoint.bar) {
      continue;
    }

    const range = Math.max(MIN_AUTOMATION_STEP, rightPoint.bar - leftPoint.bar);
    const progress = (barPosition - leftPoint.bar) / range;
    return clampVolume(leftPoint.value + (rightPoint.value - leftPoint.value) * progress);
  }

  return clampVolume(track.volume);
};

const isTrackAudible = (track: Pick<TrackModel, "muted" | "solo">, hasSolo: boolean): boolean =>
  hasSolo ? track.solo : !track.muted;

// Offline renderer/export.
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
      gainNode.connect(masterGain);
      Renderer.scheduleTrackAutomation(gainNode, track, hasSolo, durationSeconds, options.bpm);
      trackOutputs.set(track.id, gainNode);
    }

    const safeSongBars = Math.max(1, options.songBars);
    const audioBufferCache = new Map<string, AudioBuffer>();

    for (let step = 0; step < totalSteps; step += 1) {
      const barIndex = Math.floor(step / stepsPerBar) % safeSongBars;
      const time = step * stepSeconds;

      for (const track of options.tracks) {
        if (track.type !== "drum" || !isTrackAudible(track, hasSolo)) {
          continue;
        }

        const output = trackOutputs.get(track.id);
        if (!output) {
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

        const tempoRatio = getTrackTempoRatio(track, options.bpm);
        const localStartStep = step * tempoRatio;
        const localEndStep = (step + 1) * tempoRatio;
        const firstScheduledStep = Number.isInteger(localStartStep)
          ? Math.floor(localStartStep)
          : Math.ceil(localStartStep);

        for (let localStep = firstScheduledStep; localStep < localEndStep; localStep += 1) {
          const localStepIndex = ((localStep % stepsPerBar) + stepsPerBar) % stepsPerBar;
          const offsetSeconds = ((localStep - localStartStep) / tempoRatio) * stepSeconds;
          const scheduledTime = time + offsetSeconds;

          if (pattern[0]?.[localStepIndex]) {
            Renderer.scheduleKick(offline, output, scheduledTime);
          }
          if (pattern[1]?.[localStepIndex]) {
            Renderer.scheduleSnare(offline, output, scheduledTime, noiseBuffer);
          }
          if (pattern[2]?.[localStepIndex]) {
            Renderer.scheduleHat(offline, output, scheduledTime, noiseBuffer);
          }
        }
      }
    }

    for (const track of options.tracks) {
      if (track.type !== "audio" || !isTrackAudible(track, hasSolo)) {
        continue;
      }

      const output = trackOutputs.get(track.id);
      if (!output) {
        continue;
      }

      const tempoRatio = getTrackTempoRatio(track, options.bpm);
      const secondsPerBar = (60 / options.bpm) * 4;

      for (const clip of track.clips) {
        if (!isAudioClip(clip) || !clip.audioDataUrl) {
          continue;
        }

        const clipStartSeconds = clip.startBar * secondsPerBar;
        if (clipStartSeconds >= durationSeconds) {
          continue;
        }

        let buffer = audioBufferCache.get(clip.audioDataUrl);
        if (!buffer) {
          buffer = await Renderer.decodeAudioDataUrl(offline, clip.audioDataUrl);
          audioBufferCache.set(clip.audioDataUrl, buffer);
        }

        const source = offline.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.setValueAtTime(Math.max(0.01, tempoRatio), 0);
        source.connect(output);

        const clipWindowSeconds = Math.max(0, Math.min(clip.lengthBars * secondsPerBar, durationSeconds - clipStartSeconds));
        if (clipWindowSeconds <= 0) {
          continue;
        }

        const sourceDuration = Math.min(buffer.duration, clipWindowSeconds * tempoRatio);
        if (sourceDuration <= 0) {
          continue;
        }

        source.start(clipStartSeconds, 0, sourceDuration);
      }
    }

    for (const track of options.tracks) {
      if (track.type !== "synth" || !isTrackAudible(track, hasSolo)) {
        continue;
      }

      const output = trackOutputs.get(track.id);
      if (!output) {
        continue;
      }

      const secondsPerBar = (60 / options.bpm) * 4;
      const noteEvents: SynthNoteEvent[] = [];

      for (const clip of track.clips) {
        if (!isSynthClip(clip)) {
          continue;
        }

        const clipEndBar = clip.startBar + clip.lengthBars;
        for (const note of clip.notes) {
          const noteStartBar = clip.startBar + note.startBar;
          if (noteStartBar >= clipEndBar || noteStartBar * secondsPerBar >= durationSeconds) {
            continue;
          }

          const noteEndBar = Math.min(clipEndBar, clip.startBar + note.startBar + note.lengthBars);
          const duration = Math.max(
            0.05,
            Math.min(durationSeconds, noteEndBar * secondsPerBar) - noteStartBar * secondsPerBar
          );

          noteEvents.push({
            startTime: noteStartBar * secondsPerBar,
            duration,
            pitch: note.pitch,
            velocity: note.velocity
          });
        }
      }

      const sortedNoteEvents = noteEvents.sort((left, right) => left.startTime - right.startTime);
      const scheduledEvents =
        track.synthSettings.mode === "mono"
          ? buildMonophonicNoteEvents(sortedNoteEvents)
          : sortedNoteEvents;

      for (let index = 0; index < scheduledEvents.length; index += 1) {
        const event = scheduledEvents[index];
        const previousEvent = index > 0 ? scheduledEvents[index - 1] : null;
        const shouldGlide =
          Boolean(track.synthSettings.glideEnabled) &&
          track.synthSettings.mode === "mono" &&
          previousEvent !== null &&
          previousEvent.startTime + previousEvent.duration > event.startTime;

        Renderer.scheduleSynthNote(
          offline,
          output,
          event.startTime,
          event.duration,
          event.pitch,
          event.velocity,
          track.synthSettings,
          shouldGlide ? midiToFrequency(previousEvent.pitch) : null
        );
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

  private static scheduleTrackAutomation(
    output: GainNode,
    track: TrackModel,
    hasSolo: boolean,
    durationSeconds: number,
    bpm: number
  ): void {
    const gain = output.gain;
    gain.cancelScheduledValues(0);

    if (!isTrackAudible(track, hasSolo)) {
      gain.setValueAtTime(0, 0);
      return;
    }

    if (track.automationPoints.length === 0) {
      gain.setValueAtTime(getTrackAudibleVolume(track, hasSolo), 0);
      return;
    }

    const secondsPerBar = (60 / bpm) * 4;
    const sortedPoints = sortAutomationPoints(track.automationPoints);
    const firstValue = getTrackAutomationValueAtBar(track, 0);
    const firstTime = Math.max(0, Math.min(durationSeconds, sortedPoints[0].bar * secondsPerBar));

    gain.setValueAtTime(firstValue, 0);
    if (firstTime > 0) {
      gain.setValueAtTime(firstValue, firstTime);
    }

    for (let index = 0; index < sortedPoints.length - 1; index += 1) {
      const currentPoint = sortedPoints[index];
      const nextPoint = sortedPoints[index + 1];
      const currentTime = Math.max(0, Math.min(durationSeconds, currentPoint.bar * secondsPerBar));
      const nextTime = Math.max(0, Math.min(durationSeconds, nextPoint.bar * secondsPerBar));
      const currentValue = clampVolume(currentPoint.value);
      const nextValue = clampVolume(nextPoint.value);

      gain.setValueAtTime(currentValue, currentTime);
      if (nextTime > currentTime) {
        gain.linearRampToValueAtTime(nextValue, nextTime);
      } else {
        gain.setValueAtTime(nextValue, currentTime);
      }
    }

    const lastPoint = sortedPoints[sortedPoints.length - 1];
    const lastTime = Math.max(0, Math.min(durationSeconds, lastPoint.bar * secondsPerBar));
    const lastValue = clampVolume(lastPoint.value);
    gain.setValueAtTime(lastValue, lastTime);
    if (lastTime < durationSeconds) {
      gain.setValueAtTime(lastValue, durationSeconds);
    }
  }

  private static async decodeAudioDataUrl(
    context: OfflineAudioContext,
    audioDataUrl: string
  ): Promise<AudioBuffer> {
    const arrayBuffer = Renderer.dataUrlToArrayBuffer(audioDataUrl);
    return context.decodeAudioData(arrayBuffer);
  }

  private static dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
    const separatorIndex = dataUrl.indexOf(",");
    const encodedData = separatorIndex >= 0 ? dataUrl.slice(separatorIndex + 1) : dataUrl;
    const binary = atob(encodedData);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }

  private static scheduleSynthNote(
    ctx: BaseAudioContext,
    destination: AudioNode,
    startTime: number,
    durationSeconds: number,
    pitch: number,
    velocity: number,
    settings: TrackModel["synthSettings"],
    glideStartFrequency: number | null = null
  ): void {
    const targetFrequency = midiToFrequency(pitch);
    const shouldGlide = Boolean(settings.glideEnabled) && glideStartFrequency !== null;
    const glideTime = Math.max(0, settings.glideTimeMs) / 1000;
    const startFrequency = shouldGlide && glideStartFrequency !== null ? glideStartFrequency : targetFrequency;
    const detuneSpread = Math.max(0, settings.detuneCents);

    const inputGain = ctx.createGain();
    inputGain.gain.value = 1 + settings.drive * 1.4;

    const shaper = ctx.createWaveShaper();
    shaper.curve = createDriveCurve(settings.drive) as unknown as Float32Array<ArrayBuffer>;
    shaper.oversample = "2x";

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    const baseCutoff = clampFilterFrequency(settings.filterCutoff);
    const filterPeak = clampFilterFrequency(settings.filterCutoff + settings.filterEnvelopeAmount);
    const filterEnvAttackTime = startTime + Math.max(0.001, settings.filterEnvelopeAttack);
    const filterEnvDecayTime = filterEnvAttackTime + Math.max(0.01, settings.filterEnvelopeDecay);
    filter.frequency.setValueAtTime(baseCutoff, startTime);
    filter.frequency.linearRampToValueAtTime(filterPeak, filterEnvAttackTime);
    filter.frequency.linearRampToValueAtTime(baseCutoff, filterEnvDecayTime);
    filter.Q.value = Math.max(0.1, settings.resonance);

    const gain = ctx.createGain();
    const peakGain = clampVolume(velocity);
    const sustainGain = peakGain * clampVolume(settings.sustain);
    const attackTime = startTime + Math.max(0.001, settings.attack);
    const decayTime = attackTime + Math.max(0.01, settings.decay);
    const releaseStart = Math.max(startTime + Math.max(0.05, durationSeconds), decayTime);
    const releaseEnd = releaseStart + Math.max(0.01, settings.release);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, peakGain), attackTime);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, sustainGain), decayTime);
    gain.gain.setValueAtTime(Math.max(0.0001, sustainGain), releaseStart);
    gain.gain.linearRampToValueAtTime(0.0001, releaseEnd);

    const oscillatorDetunes = detuneSpread > 0.01 ? [-detuneSpread, detuneSpread] : [0];
    const oscillators = oscillatorDetunes.map((detune) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = toOscillatorType(settings.oscillator);
      oscillator.detune.setValueAtTime(detune, startTime);
      oscillator.frequency.setValueAtTime(startFrequency, startTime);
      if (shouldGlide && glideTime > 0) {
        oscillator.frequency.linearRampToValueAtTime(targetFrequency, startTime + glideTime);
      } else {
        oscillator.frequency.setValueAtTime(targetFrequency, startTime);
      }
      oscillator.connect(inputGain);
      oscillator.start(startTime);
      oscillator.stop(releaseEnd + 0.02);
      return oscillator;
    });

    inputGain.connect(shaper);
    shaper.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    oscillators[0].onended = () => {
      for (const oscillator of oscillators) {
        oscillator.disconnect();
      }
      inputGain.disconnect();
      shaper.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }
}
