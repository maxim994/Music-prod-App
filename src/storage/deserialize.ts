import type {
  AutomationPointModel,
  DrumClipModel,
  DrumPatternModel,
  ProjectSnapshot,
  SynthNoteModel,
  SynthOscillatorType,
  SynthSettingsModel,
  TrackClipModel,
  TrackModel,
  TrackType
} from "../model/types";
import { createDefaultSynthSettings as makeDefaultSynthSettings } from "../model/types";

const DEFAULT_TRACK_ID = "track-1";

const clampVolume = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }
  return Math.min(1, Math.max(0, value));
};

const clampTrackBpm = (value: unknown, fallbackBpm: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return Math.max(30, Math.min(300, Math.round(fallbackBpm)));
  }
  return Math.max(30, Math.min(300, Math.round(value)));
};

const MIN_GRID_RESOLUTION = 1 / 16;

const normalizeBars = (value: number): number =>
  Math.max(0, Math.round(value / MIN_GRID_RESOLUTION) * MIN_GRID_RESOLUTION);

const normalizeLength = (value: number): number =>
  Math.max(MIN_GRID_RESOLUTION, Math.round(value / MIN_GRID_RESOLUTION) * MIN_GRID_RESOLUTION);

const normalizeAutomationBar = (value: number): number => Math.max(0, Math.round(value * 16) / 16);

const clampAutomationValue = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }
  return Math.min(1, Math.max(0, value));
};

const isPatternValid = (pattern: unknown): pattern is boolean[][] => {
  if (!Array.isArray(pattern) || pattern.length !== 3) {
    return false;
  }

  return pattern.every(
    (row) =>
      Array.isArray(row) && row.length === 16 && row.every((cell) => typeof cell === "boolean")
  );
};

const isTrackType = (value: unknown): value is TrackType =>
  value === "drum" || value === "audio" || value === "synth";

const isSynthOscillator = (value: unknown): value is SynthOscillatorType =>
  value === "sine" || value === "saw" || value === "square" || value === "triangle";

const isDrumClip = (clip: TrackClipModel): clip is DrumClipModel => clip.kind === "drum";

const isClipCompatible = (trackType: TrackType, clip: TrackClipModel): boolean =>
  (trackType === "drum" && clip.kind === "drum") ||
  (trackType === "audio" && clip.kind === "audio") ||
  (trackType === "synth" && clip.kind === "synth");

const parseAutomationPoint = (raw: unknown): AutomationPointModel | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.id !== "string" || typeof candidate.bar !== "number" || !Number.isFinite(candidate.bar)) {
    return null;
  }

  return {
    id: candidate.id,
    bar: normalizeAutomationBar(candidate.bar),
    value: clampAutomationValue(candidate.value)
  };
};

const parseSynthSettings = (raw: unknown): SynthSettingsModel => {
  const defaults = makeDefaultSynthSettings();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  const candidate = raw as Record<string, unknown>;
  return {
    oscillator: isSynthOscillator(candidate.oscillator) ? candidate.oscillator : defaults.oscillator,
    attack:
      typeof candidate.attack === "number" && Number.isFinite(candidate.attack)
        ? Math.max(0, Math.min(2, candidate.attack))
        : defaults.attack,
    decay:
      typeof candidate.decay === "number" && Number.isFinite(candidate.decay)
        ? Math.max(0.01, Math.min(2, candidate.decay))
        : defaults.decay,
    sustain:
      typeof candidate.sustain === "number" && Number.isFinite(candidate.sustain)
        ? Math.max(0, Math.min(1, candidate.sustain))
        : defaults.sustain,
    release:
      typeof candidate.release === "number" && Number.isFinite(candidate.release)
        ? Math.max(0.01, Math.min(3, candidate.release))
        : defaults.release,
    filterCutoff:
      typeof candidate.filterCutoff === "number" && Number.isFinite(candidate.filterCutoff)
        ? Math.max(200, Math.min(16_000, candidate.filterCutoff))
        : defaults.filterCutoff,
    resonance:
      typeof candidate.resonance === "number" && Number.isFinite(candidate.resonance)
        ? Math.max(0.1, Math.min(20, candidate.resonance))
        : defaults.resonance,
    glideEnabled: Boolean(candidate.glideEnabled),
    glideTimeMs:
      typeof candidate.glideTimeMs === "number" && Number.isFinite(candidate.glideTimeMs)
        ? Math.max(0, Math.min(500, candidate.glideTimeMs))
        : defaults.glideTimeMs,
    detuneCents:
      typeof candidate.detuneCents === "number" && Number.isFinite(candidate.detuneCents)
        ? Math.max(0, Math.min(20, candidate.detuneCents))
        : defaults.detuneCents,
    filterEnvelopeAmount:
      typeof candidate.filterEnvelopeAmount === "number" &&
      Number.isFinite(candidate.filterEnvelopeAmount)
        ? Math.max(0, Math.min(12_000, candidate.filterEnvelopeAmount))
        : defaults.filterEnvelopeAmount,
    filterEnvelopeAttack:
      typeof candidate.filterEnvelopeAttack === "number" &&
      Number.isFinite(candidate.filterEnvelopeAttack)
        ? Math.max(0, Math.min(1, candidate.filterEnvelopeAttack))
        : defaults.filterEnvelopeAttack,
    filterEnvelopeDecay:
      typeof candidate.filterEnvelopeDecay === "number" &&
      Number.isFinite(candidate.filterEnvelopeDecay)
        ? Math.max(0.01, Math.min(2, candidate.filterEnvelopeDecay))
        : defaults.filterEnvelopeDecay,
    drive:
      typeof candidate.drive === "number" && Number.isFinite(candidate.drive)
        ? Math.max(0, Math.min(1, candidate.drive))
        : defaults.drive
  };
};

const parseSynthNote = (raw: unknown): SynthNoteModel | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.pitch !== "number" ||
    typeof candidate.startBar !== "number" ||
    typeof candidate.lengthBars !== "number" ||
    !Number.isFinite(candidate.pitch) ||
    !Number.isFinite(candidate.startBar) ||
    !Number.isFinite(candidate.lengthBars)
  ) {
    return null;
  }

  return {
    id: candidate.id,
    pitch: Math.max(24, Math.min(96, Math.round(candidate.pitch))),
    startBar: normalizeBars(candidate.startBar),
    lengthBars: normalizeLength(candidate.lengthBars),
    velocity:
      typeof candidate.velocity === "number" && Number.isFinite(candidate.velocity)
        ? Math.max(0, Math.min(1, candidate.velocity))
        : 0.85
  };
};

const parseClip = (raw: unknown, fallbackTrackId: string): TrackClipModel | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.startBar !== "number" ||
    typeof candidate.lengthBars !== "number" ||
    !Number.isFinite(candidate.startBar) ||
    !Number.isFinite(candidate.lengthBars)
  ) {
    return null;
  }

  const trackId = typeof candidate.trackId === "string" ? candidate.trackId : fallbackTrackId;
  const startBar = normalizeBars(candidate.startBar);
  const lengthBars = normalizeLength(candidate.lengthBars);

  if (typeof candidate.patternId === "string") {
    return {
      id: candidate.id,
      kind: "drum",
      trackId,
      startBar,
      lengthBars,
      patternId: candidate.patternId
    };
  }

  if (candidate.kind === "audio" && typeof candidate.name === "string") {
    return {
      id: candidate.id,
      kind: "audio",
      trackId,
      startBar,
      lengthBars,
      name: candidate.name,
      audioDataUrl: typeof candidate.audioDataUrl === "string" ? candidate.audioDataUrl : undefined
    };
  }

  if (candidate.kind === "synth") {
    const notes: SynthNoteModel[] = [];
    if (Array.isArray(candidate.notes)) {
      for (const note of candidate.notes) {
        const parsedNote = parseSynthNote(note);
        if (parsedNote) {
          notes.push(parsedNote);
        }
      }
      notes.sort((a, b) => a.startBar - b.startBar || a.pitch - b.pitch);
    }

    return {
      id: candidate.id,
      kind: "synth",
      trackId,
      startBar,
      lengthBars,
      notes
    };
  }

  return null;
};

const parseTracks = (raw: unknown, fallbackBpm: number): TrackModel[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const tracks: TrackModel[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.name !== "string" ||
      !isTrackType(candidate.type)
    ) {
      continue;
    }

    const clips: TrackClipModel[] = [];
    if (Array.isArray(candidate.clips)) {
      for (const clip of candidate.clips) {
        const parsedClip = parseClip(clip, candidate.id);
        if (parsedClip && isClipCompatible(candidate.type, parsedClip)) {
          clips.push({
            ...parsedClip,
            trackId: candidate.id
          });
        }
      }
    }

    const automationPoints: AutomationPointModel[] = [];
    if (Array.isArray(candidate.automationPoints)) {
      for (const point of candidate.automationPoints) {
        const parsedPoint = parseAutomationPoint(point);
        if (parsedPoint) {
          automationPoints.push(parsedPoint);
        }
      }
      automationPoints.sort((a, b) => a.bar - b.bar);
    }

    tracks.push({
      id: candidate.id,
      name: candidate.name,
      type: candidate.type,
      bpm: clampTrackBpm(candidate.bpm, fallbackBpm),
      volume: clampVolume(candidate.volume),
      muted: Boolean(candidate.muted),
      solo: Boolean(candidate.solo),
      synthSettings: parseSynthSettings(candidate.synthSettings),
      automationPoints,
      clips
    });
  }

  return tracks;
};

const parseLegacyTracks = (raw: unknown, fallbackBpm: number): TrackModel[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const clips: DrumClipModel[] = [];
  for (const item of raw) {
    const parsedClip = parseClip(item, DEFAULT_TRACK_ID);
    if (parsedClip && isDrumClip(parsedClip)) {
      clips.push({
        ...parsedClip,
        trackId: DEFAULT_TRACK_ID
      });
    }
  }

  if (clips.length === 0) {
    return [];
  }

  return [
    {
      id: DEFAULT_TRACK_ID,
      name: "Drums 1",
      type: "drum",
      bpm: clampTrackBpm(undefined, fallbackBpm),
      volume: 1,
      muted: false,
      solo: false,
      synthSettings: makeDefaultSynthSettings(),
      automationPoints: [],
      clips
    }
  ];
};

// JSON -> model (minimal validation).
export function deserializeProject(raw: string): ProjectSnapshot | null {
  try {
    const data = JSON.parse(raw) as ProjectSnapshot;
    if (typeof data.bpm !== "number" || !Number.isFinite(data.bpm)) {
      return null;
    }

    const patterns: DrumPatternModel[] = [];

    if (Array.isArray(data.patterns)) {
      for (const pattern of data.patterns) {
        if (
          pattern &&
          typeof pattern.id === "string" &&
          typeof pattern.name === "string" &&
          isPatternValid(pattern.steps)
        ) {
          patterns.push({
            id: pattern.id,
            name: pattern.name,
            steps: pattern.steps
          });
        }
      }
    }

    if (patterns.length === 0) {
      const drumPatterns: Record<string, boolean[][]> = {};
      if (data.drumPatterns && typeof data.drumPatterns === "object") {
        for (const [key, value] of Object.entries(data.drumPatterns)) {
          if (isPatternValid(value)) {
            drumPatterns[key] = value;
          }
        }
      }

      if (Object.keys(drumPatterns).length === 0) {
        if (!isPatternValid(data.drumPattern)) {
          return null;
        }
        drumPatterns.A = data.drumPattern;
        drumPatterns.B = Array.from({ length: 3 }, () => Array.from({ length: 16 }, () => false));
      }

      for (const [key, value] of Object.entries(drumPatterns)) {
        patterns.push({
          id: key,
          name: `Pattern ${key}`,
          steps: value
        });
      }
    }

    const tracks = parseTracks(data.tracks, data.bpm);
    const fallbackTracks = tracks.length > 0 ? tracks : parseLegacyTracks(data.clips, data.bpm);

    return {
      bpm: data.bpm,
      songBars: typeof data.songBars === "number" ? Math.max(1, Math.floor(data.songBars)) : 16,
      patterns,
      tracks: fallbackTracks,
      selectedPatternId: data.selectedPatternId ?? patterns[0]?.id ?? "A",
      masterVolume: clampVolume(data.masterVolume)
    };
  } catch {
    return null;
  }
}
