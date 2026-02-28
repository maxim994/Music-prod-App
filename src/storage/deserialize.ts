import type {
  DrumClipModel,
  DrumPatternModel,
  ProjectSnapshot,
  TrackClipModel,
  TrackModel,
  TrackType
} from "../model/types";

const DEFAULT_TRACK_ID = "track-1";

const clampVolume = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }
  return Math.min(1, Math.max(0, value));
};

const normalizeBars = (value: number): number => Math.max(0, Math.floor(value));

const normalizeLength = (value: number): number => Math.max(1, Math.floor(value));

const isPatternValid = (pattern: unknown): pattern is boolean[][] => {
  if (!Array.isArray(pattern) || pattern.length !== 3) {
    return false;
  }

  return pattern.every(
    (row) =>
      Array.isArray(row) && row.length === 16 && row.every((cell) => typeof cell === "boolean")
  );
};

const isTrackType = (value: unknown): value is TrackType => value === "drum" || value === "audio";

const isDrumClip = (clip: TrackClipModel): clip is DrumClipModel => clip.kind === "drum";

const isClipCompatible = (trackType: TrackType, clip: TrackClipModel): boolean =>
  (trackType === "drum" && clip.kind === "drum") || (trackType === "audio" && clip.kind === "audio");

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

  return null;
};

const parseTracks = (raw: unknown): TrackModel[] => {
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

    tracks.push({
      id: candidate.id,
      name: candidate.name,
      type: candidate.type,
      volume: clampVolume(candidate.volume),
      muted: Boolean(candidate.muted),
      solo: Boolean(candidate.solo),
      clips
    });
  }

  return tracks;
};

const parseLegacyTracks = (raw: unknown): TrackModel[] => {
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
      volume: 1,
      muted: false,
      solo: false,
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

    const tracks = parseTracks(data.tracks);
    const fallbackTracks = tracks.length > 0 ? tracks : parseLegacyTracks(data.clips);

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
