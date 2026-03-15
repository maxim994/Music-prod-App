// Serializable data models.
export type TrackType = "drum" | "audio" | "synth";
export type SynthOscillatorType = "sine" | "saw" | "square" | "triangle";
export type SynthMode = "mono" | "poly";

export interface BaseClipModel {
  id: string;
  trackId: string;
  startBar: number;
  lengthBars: number;
}

export interface DrumClipModel extends BaseClipModel {
  kind: "drum";
  patternId: string;
}

export interface AudioClipModel extends BaseClipModel {
  kind: "audio";
  name: string;
  audioDataUrl?: string;
}

export interface SynthNoteModel {
  id: string;
  pitch: number;
  startBar: number;
  lengthBars: number;
  velocity: number;
}

export interface SynthClipModel extends BaseClipModel {
  kind: "synth";
  notes: SynthNoteModel[];
}

export type TrackClipModel = DrumClipModel | AudioClipModel | SynthClipModel;

export interface AutomationPointModel {
  id: string;
  bar: number;
  value: number;
}

export interface SynthSettingsModel {
  mode: SynthMode;
  oscillator: SynthOscillatorType;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filterCutoff: number;
  resonance: number;
  glideEnabled: boolean;
  glideTimeMs: number;
  detuneCents: number;
  filterEnvelopeAmount: number;
  filterEnvelopeAttack: number;
  filterEnvelopeDecay: number;
  drive: number;
}

export const createDefaultSynthSettings = (): SynthSettingsModel => ({
  mode: "poly",
  oscillator: "saw",
  attack: 0.02,
  decay: 0.15,
  sustain: 0.7,
  release: 0.18,
  filterCutoff: 6_000,
  resonance: 1.2,
  glideEnabled: false,
  glideTimeMs: 90,
  detuneCents: 6,
  filterEnvelopeAmount: 2_600,
  filterEnvelopeAttack: 0.01,
  filterEnvelopeDecay: 0.2,
  drive: 0.12
});

export interface TrackModel {
  id: string;
  name: string;
  type: TrackType;
  bpm: number;
  volume: number;
  muted: boolean;
  solo: boolean;
  synthSettings: SynthSettingsModel;
  automationPoints: AutomationPointModel[];
  clips: TrackClipModel[];
}

export interface ProjectModel {
  id: string;
  name: string;
  bpm: number;
  tracks: TrackModel[];
}

// MVP snapshot for local save/load.
export type DrumPattern = boolean[][];

export type DrumPatternModel = {
  id: string;
  name: string;
  steps: DrumPattern;
};

export type ProjectSnapshot = {
  bpm: number;
  songBars?: number;
  drumPattern?: DrumPattern;
  drumPatterns?: Record<string, DrumPattern>;
  patterns?: DrumPatternModel[];
  clips?: TrackClipModel[];
  tracks?: TrackModel[];
  selectedPatternId?: string;
  masterVolume?: number;
};
