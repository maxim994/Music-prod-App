// Serializable data models.
export type TrackType = "drum" | "audio";

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

export type TrackClipModel = DrumClipModel | AudioClipModel;

export interface TrackModel {
  id: string;
  name: string;
  type: TrackType;
  volume: number;
  muted: boolean;
  solo: boolean;
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
