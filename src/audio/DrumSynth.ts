import type { TrackModel } from "../model/types";

type MixerTrackState = Pick<TrackModel, "id" | "volume" | "muted" | "solo">;

// Minimal synthesized drum sounds (no samples).
export class DrumSynth {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private trackGains = new Map<string, GainNode>();

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

  syncMixer(tracks: MixerTrackState[], masterVolume: number): void {
    this.ensureContext();
    if (!this.context || !this.masterGain) {
      return;
    }

    const ctx = this.context;
    const now = ctx.currentTime;
    const clampedMaster = Math.min(1, Math.max(0, masterVolume));
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(clampedMaster, now);

    const activeTrackIds = new Set(tracks.map((track) => track.id));
    for (const [trackId, gainNode] of this.trackGains.entries()) {
      if (!activeTrackIds.has(trackId)) {
        gainNode.disconnect();
        this.trackGains.delete(trackId);
      }
    }

    const hasSolo = tracks.some((track) => track.solo);
    for (const track of tracks) {
      const gainNode = this.getTrackOutput(track.id);
      if (!gainNode) {
        continue;
      }

      const audible = hasSolo ? track.solo : !track.muted;
      const volume = audible ? Math.min(1, Math.max(0, track.volume)) : 0;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(volume, now);
    }
  }

  removeTrack(trackId: string): void {
    const gainNode = this.trackGains.get(trackId);
    if (!gainNode) {
      return;
    }

    gainNode.disconnect();
    this.trackGains.delete(trackId);
  }

  getAudioContext(): AudioContext | null {
    return this.context;
  }

  playKick(trackId: string, timeOffsetSeconds = 0): void {
    if (!this.context) return;
    this.playKickAtTime(trackId, this.context.currentTime + Math.max(0, timeOffsetSeconds));
  }

  playKickAtTime(trackId: string, time: number): void {
    const output = this.getTrackOutput(trackId);
    if (!output || !this.context) return;
    const ctx = this.context;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(50, time + 0.12);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.8, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);

    osc.connect(gain);
    gain.connect(output);

    osc.start(time);
    osc.stop(time + 0.22);
  }

  playSnare(trackId: string, timeOffsetSeconds = 0): void {
    if (!this.context) return;
    this.playSnareAtTime(trackId, this.context.currentTime + Math.max(0, timeOffsetSeconds));
  }

  playSnareAtTime(trackId: string, time: number): void {
    const output = this.getTrackOutput(trackId);
    if (!output || !this.context) return;
    const ctx = this.context;

    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(0.2);
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1800;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(output);

    const tone = ctx.createOscillator();
    tone.type = "triangle";
    tone.frequency.value = 180;
    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(0.18, time);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);

    tone.connect(toneGain);
    toneGain.connect(output);

    noise.start(time);
    noise.stop(time + 0.2);
    tone.start(time);
    tone.stop(time + 0.2);
  }

  playHat(trackId: string, timeOffsetSeconds = 0): void {
    if (!this.context) return;
    this.playHatAtTime(trackId, this.context.currentTime + Math.max(0, timeOffsetSeconds));
  }

  playHatAtTime(trackId: string, time: number): void {
    const output = this.getTrackOutput(trackId);
    if (!output || !this.context) return;
    const ctx = this.context;

    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(0.08);

    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 6000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(output);

    noise.start(time);
    noise.stop(time + 0.08);
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

  private createNoiseBuffer(durationSeconds: number): AudioBuffer {
    if (!this.context) {
      throw new Error("AudioContext not initialized.");
    }
    const ctx = this.context;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * durationSeconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}
