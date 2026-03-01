import type { SynthOscillatorType, SynthSettingsModel, TrackModel } from "../model/types";

type MixerTrackState = Pick<TrackModel, "id" | "volume" | "muted" | "solo">;

type VoiceSlot = {
  busyUntil: number;
  voice: SynthVoice;
};

type PreviewVoiceState = {
  pitch: number | null;
  velocity: number;
  voice: SynthVoice;
};

const clampVolume = (value: number): number => Math.min(1, Math.max(0, value));

const toOscillatorType = (oscillator: SynthOscillatorType): OscillatorType =>
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

class SynthVoice {
  private activeGain: GainNode | null = null;
  private activeOscillators: OscillatorNode[] = [];
  private lastFrequency: number | null = null;
  private lastReleaseBoundary = 0;

  constructor(private context: AudioContext) {}

  trigger(
    destination: AudioNode,
    time: number,
    frequency: number,
    durationSeconds: number,
    velocity: number,
    settings: SynthSettingsModel
  ): void {
    this.stop(time);

    const inputGain = this.context.createGain();
    inputGain.gain.value = 1 + settings.drive * 1.4;

    const shaper = this.context.createWaveShaper();
    shaper.curve = createDriveCurve(settings.drive) as unknown as Float32Array<ArrayBuffer>;
    shaper.oversample = "2x";

    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    const baseCutoff = clampFilterFrequency(settings.filterCutoff);
    const filterPeak = clampFilterFrequency(settings.filterCutoff + settings.filterEnvelopeAmount);
    const filterEnvAttackTime = time + Math.max(0.001, settings.filterEnvelopeAttack);
    const filterEnvDecayTime = filterEnvAttackTime + Math.max(0.01, settings.filterEnvelopeDecay);
    filter.frequency.setValueAtTime(baseCutoff, time);
    filter.frequency.linearRampToValueAtTime(filterPeak, filterEnvAttackTime);
    filter.frequency.linearRampToValueAtTime(baseCutoff, filterEnvDecayTime);
    filter.Q.value = Math.max(0.1, settings.resonance);

    const gain = this.context.createGain();
    const peakGain = clampVolume(velocity);
    const sustainGain = peakGain * clampVolume(settings.sustain);
    const attackTime = time + Math.max(0.001, settings.attack);
    const decayTime = attackTime + Math.max(0.01, settings.decay);
    const releaseStart = Math.max(time + Math.max(0.05, durationSeconds), decayTime);
    const releaseEnd = releaseStart + Math.max(0.01, settings.release);
    const glideTime = Math.max(0, settings.glideTimeMs) / 1000;
    const shouldGlide =
      settings.glideEnabled && this.lastFrequency !== null && time <= this.lastReleaseBoundary + 0.001;
    const startFrequency = shouldGlide && this.lastFrequency !== null ? this.lastFrequency : frequency;

    const detuneSpread = Math.max(0, settings.detuneCents);
    const oscillatorDetunes = detuneSpread > 0.01 ? [-detuneSpread, detuneSpread] : [0];
    const oscillators = oscillatorDetunes.map((detune) => {
      const oscillator = this.context.createOscillator();
      oscillator.type = toOscillatorType(settings.oscillator);
      oscillator.detune.setValueAtTime(detune, time);
      oscillator.frequency.setValueAtTime(startFrequency, time);
      if (shouldGlide && glideTime > 0) {
        oscillator.frequency.linearRampToValueAtTime(frequency, time + glideTime);
      } else {
        oscillator.frequency.setValueAtTime(frequency, time);
      }
      oscillator.connect(inputGain);
      oscillator.start(time);
      oscillator.stop(releaseEnd + 0.02);
      return oscillator;
    });

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, peakGain), attackTime);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, sustainGain), decayTime);
    gain.gain.setValueAtTime(Math.max(0.0001, sustainGain), releaseStart);
    gain.gain.linearRampToValueAtTime(0.0001, releaseEnd);

    inputGain.connect(shaper);
    shaper.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    this.activeOscillators = oscillators;
    this.activeGain = gain;
    this.lastFrequency = frequency;
    this.lastReleaseBoundary = releaseEnd;

    oscillators[0].onended = () => {
      if (this.activeOscillators[0] === oscillators[0]) {
        this.activeOscillators = [];
        this.activeGain = null;
      }
      for (const oscillator of oscillators) {
        oscillator.disconnect();
      }
      inputGain.disconnect();
      shaper.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  stop(time: number): void {
    if (this.activeOscillators.length === 0 || !this.activeGain) {
      return;
    }

    const safeTime = Math.max(this.context.currentTime, time);
    try {
      this.activeGain.gain.cancelScheduledValues(safeTime);
      const currentValue = this.activeGain.gain.value;
      this.activeGain.gain.setValueAtTime(Math.max(0.0001, currentValue), safeTime);
      this.activeGain.gain.linearRampToValueAtTime(0.0001, safeTime + 0.03);
      for (const oscillator of this.activeOscillators) {
        oscillator.stop(safeTime + 0.04);
      }
    } catch {
      // Ignore already-stopped nodes.
    }
  }
}

export class SynthEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private trackGains = new Map<string, GainNode>();
  private trackVoices = new Map<string, VoiceSlot[]>();
  private previewVoices = new Map<string, PreviewVoiceState>();

  ensureContext(): AudioContext | null {
    if (!this.context) {
      this.context = new AudioContext();
      this.masterGain = this.context.createGain();
      this.masterGain.connect(this.context.destination);
    }

    if (this.context.state === "suspended") {
      void this.context.resume();
    }

    return this.context;
  }

  attachContext(context: AudioContext): void {
    if (this.context === context && this.masterGain) {
      if (context.state === "suspended") {
        void context.resume();
      }
      return;
    }

    if (this.masterGain) {
      this.masterGain.disconnect();
    }

    this.context = context;
    this.masterGain = context.createGain();
    this.masterGain.connect(context.destination);
    this.trackGains.clear();
    this.trackVoices.clear();
    this.previewVoices.clear();

    if (context.state === "suspended") {
      void context.resume();
    }
  }

  syncMixer(tracks: MixerTrackState[], masterVolume: number): void {
    this.ensureContext();
    if (!this.context || !this.masterGain) {
      return;
    }

    const now = this.context.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(clampVolume(masterVolume), now);

    const activeTrackIds = new Set(tracks.map((track) => track.id));
    for (const [trackId, gainNode] of this.trackGains.entries()) {
      if (!activeTrackIds.has(trackId)) {
        gainNode.disconnect();
        this.trackGains.delete(trackId);
        this.trackVoices.delete(trackId);
      }
    }

    const hasSolo = tracks.some((track) => track.solo);
    for (const track of tracks) {
      const gainNode = this.getTrackOutput(track.id);
      if (!gainNode) {
        continue;
      }

      const audible = hasSolo ? track.solo : !track.muted;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(audible ? clampVolume(track.volume) : 0, now);
    }
  }

  playNote(
    trackId: string,
    pitch: number,
    durationSeconds: number,
    velocity: number,
    settings: SynthSettingsModel,
    timeOffsetSeconds = 0
  ): void {
    this.ensureContext();
    if (!this.context) {
      return;
    }

    this.playNoteAtTime(
      trackId,
      pitch,
      this.context.currentTime + Math.max(0, timeOffsetSeconds),
      durationSeconds,
      velocity,
      settings
    );
  }

  playNoteAtTime(
    trackId: string,
    pitch: number,
    startTime: number,
    durationSeconds: number,
    velocity: number,
    settings: SynthSettingsModel
  ): void {
    this.ensureContext();
    if (!this.context) {
      return;
    }

    const output = this.getTrackOutput(trackId);
    if (!output) {
      return;
    }

    const voices = this.getVoices(trackId);
    const availableVoice =
      voices.find((slot) => slot.busyUntil <= startTime) ?? voices[0];

    availableVoice.voice.trigger(
      output,
      startTime,
      midiToFrequency(pitch),
      durationSeconds,
      velocity,
      settings
    );
    availableVoice.busyUntil = startTime + Math.max(0.05, durationSeconds) + settings.release;
  }

  startPreviewNote(
    trackId: string,
    pitch: number,
    velocity: number,
    settings: SynthSettingsModel
  ): void {
    this.ensureContext();
    if (!this.context) {
      return;
    }

    const output = this.getTrackOutput(trackId);
    if (!output) {
      return;
    }

    const previewVoice = this.getPreviewVoice(trackId);
    const now = this.context.currentTime;
    previewVoice.pitch = pitch;
    previewVoice.velocity = clampVolume(velocity);
    previewVoice.voice.trigger(
      output,
      now,
      midiToFrequency(pitch),
      8,
      previewVoice.velocity,
      settings
    );
  }

  stopPreviewNote(trackId: string): void {
    if (!this.context) {
      return;
    }

    const previewVoice = this.previewVoices.get(trackId);
    if (!previewVoice) {
      return;
    }

    previewVoice.voice.stop(this.context.currentTime);
    previewVoice.pitch = null;
  }

  stopAllVoices(): void {
    if (!this.context) {
      return;
    }

    const now = this.context.currentTime;
    for (const voices of this.trackVoices.values()) {
      for (const slot of voices) {
        slot.voice.stop(now);
        slot.busyUntil = now;
      }
    }

    for (const previewVoice of this.previewVoices.values()) {
      previewVoice.voice.stop(now);
      previewVoice.pitch = null;
    }
  }

  removeTrack(trackId: string): void {
    const gainNode = this.trackGains.get(trackId);
    if (gainNode) {
      gainNode.disconnect();
      this.trackGains.delete(trackId);
    }

    if (this.context) {
      const now = this.context.currentTime;
      const voices = this.trackVoices.get(trackId) ?? [];
      for (const slot of voices) {
        slot.voice.stop(now);
      }

      const previewVoice = this.previewVoices.get(trackId);
      previewVoice?.voice.stop(now);
    }
    this.trackVoices.delete(trackId);
    this.previewVoices.delete(trackId);
  }

  private getTrackOutput(trackId: string): GainNode | null {
    this.ensureContext();
    if (!this.context || !this.masterGain) {
      return null;
    }

    const existing = this.trackGains.get(trackId);
    if (existing) {
      return existing;
    }

    const gainNode = this.context.createGain();
    gainNode.gain.value = 1;
    gainNode.connect(this.masterGain);
    this.trackGains.set(trackId, gainNode);
    return gainNode;
  }

  private getVoices(trackId: string): VoiceSlot[] {
    const existing = this.trackVoices.get(trackId);
    if (existing) {
      return existing;
    }

    if (!this.context) {
      return [];
    }

    const voices: VoiceSlot[] = [
      {
        busyUntil: 0,
        voice: new SynthVoice(this.context)
      }
    ];
    this.trackVoices.set(trackId, voices);
    return voices;
  }

  private getPreviewVoice(trackId: string): PreviewVoiceState {
    const existing = this.previewVoices.get(trackId);
    if (existing) {
      return existing;
    }

    if (!this.context) {
      throw new Error("AudioContext not initialized.");
    }

    const previewVoice: PreviewVoiceState = {
      pitch: null,
      velocity: 0.85,
      voice: new SynthVoice(this.context)
    };
    this.previewVoices.set(trackId, previewVoice);
    return previewVoice;
  }
}
