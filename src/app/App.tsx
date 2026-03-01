import { useEffect, useRef, useState } from "react";
import { Renderer } from "../audio/Renderer";
import { DrumSynth } from "../audio/DrumSynth";
import { SynthEngine } from "../audio/SynthEngine";
import type {
  AutomationPointModel,
  AudioClipModel,
  DrumClipModel,
  DrumPatternModel,
  ProjectSnapshot,
  SynthClipModel,
  SynthNoteModel,
  SynthSettingsModel,
  TrackClipModel,
  TrackModel,
  TrackType
} from "../model/types";
import { createDefaultSynthSettings as makeDefaultSynthSettings } from "../model/types";
import { LocalProjectStore } from "../storage/LocalProjectStore";
import { DrumMachine } from "../ui/components/DrumMachine/DrumMachine";
import { SynthEditor } from "../ui/components/SynthEditor/SynthEditor";
import { Timeline } from "../ui/components/Timeline/Timeline";
import { TrackList } from "../ui/components/TrackList/TrackList";
import { TransportBar } from "../ui/components/TransportBar/TransportBar";

type DrumPatternId = string;

type HistorySnapshot = {
  bpm: number;
  masterVolume: number;
  patterns: DrumPatternModel[];
  selectedClipId: string | null;
  selectedPatternId: DrumPatternId;
  songBars: number;
  tracks: TrackModel[];
};

type AppView = "arrangement" | "synth";

const MIN_GRID_RESOLUTION = 1 / 16;

const createEmptyPattern = (): boolean[][] =>
  Array.from({ length: 3 }, () => Array.from({ length: 16 }, () => false));

const createDrumClip = (
  id: string,
  trackId: string,
  startBar: number,
  lengthBars: number,
  patternId: string
): DrumClipModel => ({
  id,
  kind: "drum",
  trackId,
  startBar,
  lengthBars,
  patternId
});

const createDefaultSynthNote = (id: string): SynthNoteModel => ({
  id,
  pitch: 60,
  startBar: 0,
  lengthBars: 1,
  velocity: 0.85
});

const createSynthClip = (
  id: string,
  trackId: string,
  startBar: number,
  lengthBars: number,
  notes: SynthNoteModel[] = []
): SynthClipModel => ({
  id,
  kind: "synth",
  trackId,
  startBar,
  lengthBars,
  notes: [...notes].sort((left, right) => left.startBar - right.startBar || left.pitch - right.pitch)
});

const createTrack = (
  id: string,
  name: string,
  type: TrackType,
  clips: TrackClipModel[] = [],
  automationPoints: AutomationPointModel[] = [],
  synthSettings: SynthSettingsModel = makeDefaultSynthSettings(),
  trackBpm = 120
): TrackModel => ({
  id,
  name,
  type,
  bpm: trackBpm,
  volume: 1,
  muted: false,
  solo: false,
  synthSettings: { ...synthSettings },
  automationPoints: [...automationPoints].sort((a, b) => a.bar - b.bar),
  clips: clips.map((clip) => ({ ...clip, trackId: id }))
});

const createDefaultPatterns = (): DrumPatternModel[] => [
  {
    id: "A",
    name: "Pattern A",
    steps: createEmptyPattern()
  },
  {
    id: "B",
    name: "Pattern B",
    steps: createEmptyPattern()
  }
];

const createDefaultTracks = (): TrackModel[] => [
  createTrack("track-1", "Drums 1", "drum", [
    createDrumClip("clip-1", "track-1", 0, 4, "A"),
    createDrumClip("clip-3", "track-1", 8, 4, "A")
  ], [], makeDefaultSynthSettings(), 120),
  createTrack(
    "track-2",
    "Drums 2",
    "drum",
    [createDrumClip("clip-2", "track-2", 4, 4, "B")],
    [],
    makeDefaultSynthSettings(),
    120
  )
];

const getPatternDisplayName = (index: number) => String.fromCharCode(65 + index);

const isDrumClip = (clip: TrackClipModel): clip is DrumClipModel => clip.kind === "drum";

const isAudioClip = (clip: TrackClipModel): clip is AudioClipModel => clip.kind === "audio";

const isSynthClip = (clip: TrackClipModel): clip is SynthClipModel => clip.kind === "synth";

const clampVolume = (value: number): number => Math.min(1, Math.max(0, value));

const clampAutomationValue = (value: number): number => Math.min(1, Math.max(0, value));

const clampNoteVelocity = (value: number): number => Math.min(1, Math.max(0.05, value));

const clampNotePitch = (value: number): number => Math.max(36, Math.min(84, Math.round(value)));

const clampSynthSettingValue = (
  key: keyof SynthSettingsModel,
  value: number
): number => {
  if (!Number.isFinite(value)) {
    return makeDefaultSynthSettings()[key] as number;
  }

  switch (key) {
    case "attack":
      return Math.max(0, Math.min(2, value));
    case "decay":
      return Math.max(0.01, Math.min(2, value));
    case "sustain":
      return Math.max(0, Math.min(1, value));
    case "release":
      return Math.max(0.01, Math.min(3, value));
    case "filterCutoff":
      return Math.max(200, Math.min(16_000, value));
    case "resonance":
      return Math.max(0.1, Math.min(20, value));
    case "glideTimeMs":
      return Math.max(0, Math.min(500, value));
    case "detuneCents":
      return Math.max(0, Math.min(20, value));
    case "filterEnvelopeAmount":
      return Math.max(0, Math.min(12_000, value));
    case "filterEnvelopeAttack":
      return Math.max(0, Math.min(1, value));
    case "filterEnvelopeDecay":
      return Math.max(0.01, Math.min(2, value));
    case "drive":
      return Math.max(0, Math.min(1, value));
    default:
      return value;
  }
};

const clampTrackBpm = (value: number, fallbackBpm: number): number => {
  if (!Number.isFinite(value)) {
    return Math.max(30, Math.min(300, Math.round(fallbackBpm)));
  }
  return Math.max(30, Math.min(300, Math.round(value)));
};

const normalizeBarValue = (value: number): number => Math.round(value / MIN_GRID_RESOLUTION) * MIN_GRID_RESOLUTION;

const roundBarPrecision = (value: number): number => Math.round(value * 1000) / 1000;

const normalizeAutomationBar = (value: number): number =>
  Math.round(Math.max(0, value) / MIN_GRID_RESOLUTION) * MIN_GRID_RESOLUTION;

const sortSynthNotes = (notes: SynthNoteModel[]): SynthNoteModel[] =>
  [...notes].sort((left, right) => left.startBar - right.startBar || left.pitch - right.pitch);

const clampSynthNoteToClip = (
  note: SynthNoteModel,
  clipLengthBars: number,
  snapStep: number | null = MIN_GRID_RESOLUTION
): SynthNoteModel => {
  const normalize = (value: number): number =>
    snapStep ? Math.round(value / snapStep) * snapStep : roundBarPrecision(value);
  const startBar = Math.max(0, normalize(note.startBar));
  const maxLength = Math.max(snapStep ?? MIN_GRID_RESOLUTION, clipLengthBars - startBar);
  return {
    ...note,
    pitch: clampNotePitch(note.pitch),
    startBar: Math.min(startBar, Math.max(0, clipLengthBars - (snapStep ?? MIN_GRID_RESOLUTION))),
    lengthBars: Math.max(
      snapStep ?? MIN_GRID_RESOLUTION,
      Math.min(normalize(note.lengthBars), maxLength)
    ),
    velocity: clampNoteVelocity(note.velocity)
  };
};

const sortAutomationPoints = (points: AutomationPointModel[]): AutomationPointModel[] =>
  [...points].sort((a, b) => a.bar - b.bar);

const clampAutomationBar = (
  bar: number,
  songBars: number,
  snapStep: number | null = MIN_GRID_RESOLUTION
): number => {
  const normalizedBar = snapStep ? Math.round(bar / snapStep) * snapStep : roundBarPrecision(bar);
  return Math.max(0, Math.min(songBars, normalizedBar));
};

const normalizeAutomationPoint = (
  point: AutomationPointModel,
  songBars: number,
  snapStep: number | null = MIN_GRID_RESOLUTION
): AutomationPointModel => ({
  ...point,
  bar: clampAutomationBar(point.bar, songBars, snapStep),
  value: clampAutomationValue(point.value)
});

const getTrackVolumeAtBar = (track: TrackModel, barPosition: number): number => {
  if (track.automationPoints.length === 0) {
    return clampVolume(track.volume);
  }

  const points = sortAutomationPoints(track.automationPoints);
  if (barPosition <= points[0].bar) {
    return clampAutomationValue(points[0].value);
  }

  const lastPoint = points[points.length - 1];
  if (barPosition >= lastPoint.bar) {
    return clampAutomationValue(lastPoint.value);
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const leftPoint = points[index];
    const rightPoint = points[index + 1];
    if (barPosition < leftPoint.bar || barPosition > rightPoint.bar) {
      continue;
    }

    const range = Math.max(MIN_GRID_RESOLUTION, rightPoint.bar - leftPoint.bar);
    const progress = (barPosition - leftPoint.bar) / range;
    const interpolatedValue = leftPoint.value + (rightPoint.value - leftPoint.value) * progress;
    return clampAutomationValue(interpolatedValue);
  }

  return clampVolume(track.volume);
};

const getTrackTempoRatio = (track: Pick<TrackModel, "bpm">, projectBpm: number): number =>
  clampTrackBpm(track.bpm, projectBpm) / Math.max(1, projectBpm);

const getClipEndBar = (clip: TrackClipModel): number => clip.startBar + clip.lengthBars;

const getTrackEndBar = (track: TrackModel): number =>
  track.clips.reduce((maxBar, clip) => Math.max(maxBar, getClipEndBar(clip)), 0);

const getFileStem = (fileName: string): string => fileName.replace(/\.[^.]+$/, "") || fileName;

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error(`Could not read ${file.name}.`));
    };
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });

const readAudioDuration = (file: File): Promise<number> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    const cleanup = () => {
      audio.removeAttribute("src");
      URL.revokeObjectURL(objectUrl);
    };

    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      cleanup();
      resolve(duration);
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error(`Could not read audio metadata for ${file.name}.`));
    };
    audio.src = objectUrl;
  });

const clampClipToSong = <T extends TrackClipModel>(
  clip: T,
  bars: number,
  snapStep: number | null = MIN_GRID_RESOLUTION
): T => {
  const normalize = (value: number): number =>
    snapStep ? Math.round(value / snapStep) * snapStep : roundBarPrecision(value);
  const startBar = normalize(Math.max(0, clip.startBar));
  const maxLength = Math.max(snapStep ?? MIN_GRID_RESOLUTION, bars - startBar);
  const lengthBars = normalize(
    Math.max(snapStep ?? MIN_GRID_RESOLUTION, Math.min(clip.lengthBars, maxLength))
  );
  const nextClip = {
    ...clip,
    startBar,
    lengthBars
  };

  if (clip.kind !== "synth") {
    return nextClip as T;
  }

  return {
    ...nextClip,
    notes: sortSynthNotes(
      clip.notes.map((note) => clampSynthNoteToClip(note, lengthBars, snapStep))
    )
  } as T;
};

const getActiveDrumClip = (track: TrackModel, barPosition: number): DrumClipModel | null => {
  const activeBar = Math.max(0, barPosition);
  const sortedClips = track.clips.filter(isDrumClip).sort((a, b) => a.startBar - b.startBar);
  return (
    sortedClips.find(
      (clip) => activeBar >= clip.startBar && activeBar < clip.startBar + clip.lengthBars
    ) ?? null
  );
};

const getActiveSynthClip = (track: TrackModel, barPosition: number): SynthClipModel | null => {
  const activeBar = Math.max(0, barPosition);
  const sortedClips = track.clips.filter(isSynthClip).sort((a, b) => a.startBar - b.startBar);
  return (
    sortedClips.find(
      (clip) => activeBar >= clip.startBar && activeBar < clip.startBar + clip.lengthBars
    ) ?? null
  );
};

const getNextIdSeed = (patterns: DrumPatternModel[], tracks: TrackModel[]): number => {
  let maxValue = 1;
  const register = (value: string) => {
    const match = value.match(/(\d+)$/);
    if (!match) {
      return;
    }
    maxValue = Math.max(maxValue, Number(match[1]) + 1);
  };

  for (const pattern of patterns) {
    register(pattern.id);
  }

  for (const track of tracks) {
    register(track.id);
    for (const point of track.automationPoints) {
      register(point.id);
    }
    for (const clip of track.clips) {
      register(clip.id);
      if (isSynthClip(clip)) {
        for (const note of clip.notes) {
          register(note.id);
        }
      }
    }
  }

  return maxValue;
};

const ensureTracks = (tracks: TrackModel[], fallbackBpm: number): TrackModel[] => {
  if (tracks.length > 0) {
    return tracks.map((track) => ({
      ...track,
      bpm: clampTrackBpm(track.bpm, fallbackBpm),
      volume: clampVolume(track.volume),
      synthSettings: {
        ...makeDefaultSynthSettings(),
        ...track.synthSettings,
        attack: clampSynthSettingValue("attack", track.synthSettings?.attack ?? makeDefaultSynthSettings().attack),
        decay: clampSynthSettingValue("decay", track.synthSettings?.decay ?? makeDefaultSynthSettings().decay),
        sustain: clampSynthSettingValue("sustain", track.synthSettings?.sustain ?? makeDefaultSynthSettings().sustain),
        release: clampSynthSettingValue("release", track.synthSettings?.release ?? makeDefaultSynthSettings().release),
        filterCutoff: clampSynthSettingValue(
          "filterCutoff",
          track.synthSettings?.filterCutoff ?? makeDefaultSynthSettings().filterCutoff
        ),
        resonance: clampSynthSettingValue(
          "resonance",
          track.synthSettings?.resonance ?? makeDefaultSynthSettings().resonance
        ),
        glideEnabled: Boolean(track.synthSettings?.glideEnabled),
        glideTimeMs: clampSynthSettingValue(
          "glideTimeMs",
          track.synthSettings?.glideTimeMs ?? makeDefaultSynthSettings().glideTimeMs
        ),
        detuneCents: clampSynthSettingValue(
          "detuneCents",
          track.synthSettings?.detuneCents ?? makeDefaultSynthSettings().detuneCents
        ),
        filterEnvelopeAmount: clampSynthSettingValue(
          "filterEnvelopeAmount",
          track.synthSettings?.filterEnvelopeAmount ?? makeDefaultSynthSettings().filterEnvelopeAmount
        ),
        filterEnvelopeAttack: clampSynthSettingValue(
          "filterEnvelopeAttack",
          track.synthSettings?.filterEnvelopeAttack ?? makeDefaultSynthSettings().filterEnvelopeAttack
        ),
        filterEnvelopeDecay: clampSynthSettingValue(
          "filterEnvelopeDecay",
          track.synthSettings?.filterEnvelopeDecay ?? makeDefaultSynthSettings().filterEnvelopeDecay
        ),
        drive: clampSynthSettingValue(
          "drive",
          track.synthSettings?.drive ?? makeDefaultSynthSettings().drive
        )
      },
      automationPoints: sortAutomationPoints(
        (track.automationPoints ?? []).map((point) => ({
          ...point,
          bar: normalizeAutomationBar(point.bar),
          value: clampAutomationValue(point.value)
        }))
      ),
      clips: track.clips.map((clip) =>
        clip.kind === "synth"
          ? {
              ...clip,
              trackId: track.id,
              notes: sortSynthNotes(
                clip.notes.map((note) => clampSynthNoteToClip(note, clip.lengthBars))
              )
            }
          : { ...clip, trackId: track.id }
      )
    }));
  }

  return [createTrack("track-1", "Drums 1", "drum", [], [], makeDefaultSynthSettings(), fallbackBpm)];
};

const getDefaultTrackName = (type: TrackType, index: number): string =>
  `${type === "drum" ? "Drums" : type === "audio" ? "Audio" : "Synth"} ${index}`;

const findClipById = (tracks: TrackModel[], clipId: string): TrackClipModel | null => {
  for (const track of tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (clip) {
      return clip;
    }
  }
  return null;
};

const getLoopedSeconds = (playhead: number, songLength: number): number => {
  if (!Number.isFinite(playhead) || songLength <= 0) {
    return 0;
  }

  return ((playhead % songLength) + songLength) % songLength;
};

export function App() {
  const [bpm, setBpm] = useState(120);
  const [gridResolution, setGridResolution] = useState(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [songBars, setSongBars] = useState(16);
  const [patterns, setPatterns] = useState<DrumPatternModel[]>(() => createDefaultPatterns());
  const [selectedPatternId, setSelectedPatternId] = useState<DrumPatternId>("A");
  const [tracks, setTracks] = useState<TrackModel[]>(() => createDefaultTracks());
  const [masterVolume, setMasterVolume] = useState(1);
  const [status, setStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>("clip-1");
  const [selectedSynthClipId, setSelectedSynthClipId] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [appView, setAppView] = useState<AppView>("arrangement");

  const bpmRef = useRef(bpm);
  const selectedPatternIdRef = useRef(selectedPatternId);
  const selectedClipIdRef = useRef(selectedClipId);
  const patternsRef = useRef(patterns);
  const tracksRef = useRef(tracks);
  const songBarsRef = useRef(songBars);
  const masterVolumeRef = useRef(masterVolume);
  const rafIdRef = useRef<number | null>(null);
  const schedulerTimerRef = useRef<number | null>(null);
  const storeRef = useRef<LocalProjectStore | null>(null);
  const synthRef = useRef<DrumSynth | null>(null);
  const synthEngineRef = useRef<SynthEngine | null>(null);
  const audioElementsRef = useRef(new Map<string, HTMLAudioElement>());
  const resumeAfterScrubRef = useRef(false);
  const previewTrackIdRef = useRef<string | null>(null);
  const undoStackRef = useRef<HistorySnapshot[]>([]);
  const redoStackRef = useRef<HistorySnapshot[]>([]);
  const songStepRef = useRef(0);
  const idCounterRef = useRef(4);
  const transportStartAudioTimeRef = useRef<number | null>(null);
  const transportStartBarRef = useRef(0);
  const schedulerStepCursorRef = useRef(0);
  const playbackSessionIdRef = useRef(0);
  const lastUiStepRef = useRef(-1);

  useEffect(() => {
    storeRef.current = new LocalProjectStore();
  }, []);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    patternsRef.current = patterns;
    if (!patterns.find((pattern) => pattern.id === selectedPatternId) && patterns.length > 0) {
      setSelectedPatternId(patterns[0].id);
    }
  }, [patterns, selectedPatternId]);

  useEffect(() => {
    selectedPatternIdRef.current = selectedPatternId;
  }, [selectedPatternId]);

  useEffect(() => {
    tracksRef.current = tracks;
    if (
      previewTrackIdRef.current &&
      !tracks.some((track) => track.id === previewTrackIdRef.current)
    ) {
      synthEngineRef.current?.stopPreviewNote(previewTrackIdRef.current);
      previewTrackIdRef.current = null;
    }
    if (isRunning) {
      syncAutomationMixer(playheadSeconds);
      return;
    }

    synthRef.current?.syncMixer(tracks, masterVolumeRef.current);
    synthEngineRef.current?.syncMixer(tracks, masterVolumeRef.current);
  }, [tracks]);

  useEffect(() => {
    songBarsRef.current = songBars;
  }, [songBars]);

  useEffect(() => {
    masterVolumeRef.current = masterVolume;
    if (isRunning) {
      syncAutomationMixer(playheadSeconds);
      return;
    }

    synthRef.current?.syncMixer(tracksRef.current, masterVolume);
    synthEngineRef.current?.syncMixer(tracksRef.current, masterVolume);
  }, [masterVolume]);

  const getSharedAudioContext = (): AudioContext | null => {
    const drumContext = synthRef.current?.ensureContext() ?? null;
    if (drumContext) {
      synthEngineRef.current?.attachContext(drumContext);
      return drumContext;
    }

    const synthContext = synthEngineRef.current?.ensureContext() ?? null;
    if (synthContext) {
      return synthContext;
    }

    return null;
  };

  const clearTransportScheduler = () => {
    if (schedulerTimerRef.current !== null) {
      window.clearInterval(schedulerTimerRef.current);
      schedulerTimerRef.current = null;
    }
  };

  const stopTransportScheduler = () => {
    clearTransportScheduler();
    playbackSessionIdRef.current += 1;
    transportStartAudioTimeRef.current = null;
    schedulerStepCursorRef.current = 0;
    lastUiStepRef.current = -1;
  };

  const getCurrentTransportBarPosition = (audioNow?: number): number => {
    if (!isRunning || transportStartAudioTimeRef.current === null) {
      const currentSecondsPerBar = (60 / Math.max(1, bpmRef.current)) * 4;
      return playheadSeconds / Math.max(MIN_GRID_RESOLUTION, currentSecondsPerBar);
    }

    const sharedContext = getSharedAudioContext();
    const now = audioNow ?? sharedContext?.currentTime ?? transportStartAudioTimeRef.current;
    const projectSecondsPerBar = (60 / Math.max(1, bpmRef.current)) * 4;
    return transportStartBarRef.current + (now - transportStartAudioTimeRef.current) / projectSecondsPerBar;
  };

  const scheduleTransportStep = (stepCursor: number, stepAudioTime: number) => {
    const safeSongBars = Math.max(1, songBarsRef.current);
    const totalSongSteps = Math.max(16, safeSongBars * 16);
    const songStepIndex = ((stepCursor % totalSongSteps) + totalSongSteps) % totalSongSteps;
    const stepIndex = songStepIndex % 16;
    const barPosition = songStepIndex / 16;
    const projectBpm = Math.max(1, bpmRef.current);
    const projectStepSeconds = (60 / projectBpm) / 4;
    const projectSecondsPerBar = projectStepSeconds * 16;
    const patternMap = new Map(patternsRef.current.map((pattern) => [pattern.id, pattern.steps]));

    for (const track of tracksRef.current) {
      if (track.type === "synth") {
        const activeClip = getActiveSynthClip(track, barPosition);
        if (!activeClip || !synthEngineRef.current) {
          continue;
        }

        const localStepStartBar = barPosition - activeClip.startBar;
        const localStepEndBar = localStepStartBar + MIN_GRID_RESOLUTION;

        for (const note of activeClip.notes) {
          if (note.startBar < localStepStartBar || note.startBar >= localStepEndBar) {
            continue;
          }

          const noteAudioTime =
            stepAudioTime + (note.startBar - localStepStartBar) * projectSecondsPerBar;
          const durationSeconds = Math.max(0.05, note.lengthBars * projectSecondsPerBar);

          synthEngineRef.current.playNoteAtTime(
            track.id,
            note.pitch,
            noteAudioTime,
            durationSeconds,
            note.velocity,
            track.synthSettings
          );
        }
        continue;
      }

      if (track.type !== "drum") {
        continue;
      }

      const activeClip = getActiveDrumClip(track, barPosition);
      if (!activeClip) {
        continue;
      }

      const pattern = patternMap.get(activeClip.patternId);
      if (!pattern || !synthRef.current) {
        continue;
      }

      const tempoRatio = getTrackTempoRatio(track, projectBpm);
      const localStartStep = songStepIndex * tempoRatio;
      const localEndStep = (songStepIndex + 1) * tempoRatio;
      const firstScheduledStep = Number.isInteger(localStartStep)
        ? Math.floor(localStartStep)
        : Math.ceil(localStartStep);

      for (let localStep = firstScheduledStep; localStep < localEndStep; localStep += 1) {
        const clipStepOffset = Math.round(activeClip.startBar * 16);
        const localStepIndex = (((localStep - clipStepOffset) % 16) + 16) % 16;
        const scheduledTime =
          stepAudioTime + ((localStep - localStartStep) / tempoRatio) * projectStepSeconds;

        if (pattern[0]?.[localStepIndex]) {
          synthRef.current.playKickAtTime(track.id, scheduledTime);
        }
        if (pattern[1]?.[localStepIndex]) {
          synthRef.current.playSnareAtTime(track.id, scheduledTime);
        }
        if (pattern[2]?.[localStepIndex]) {
          synthRef.current.playHatAtTime(track.id, scheduledTime);
        }
      }
    }

    songStepRef.current = ((songStepIndex + 1) % totalSongSteps + totalSongSteps) % totalSongSteps;
    if (lastUiStepRef.current !== stepIndex) {
      lastUiStepRef.current = stepIndex;
      setActiveStep(stepIndex);
    }
  };

  const startTransportScheduler = (startBar: number) => {
    const sharedContext = getSharedAudioContext();
    if (!sharedContext) {
      return;
    }

    clearTransportScheduler();
    const safeSongBars = Math.max(1, songBarsRef.current);
    const clampedStartBar = Math.max(0, Math.min(safeSongBars, startBar));
    const normalizedStartBar =
      clampedStartBar >= safeSongBars ? Math.max(0, safeSongBars - MIN_GRID_RESOLUTION) : clampedStartBar;
    const sessionId = playbackSessionIdRef.current + 1;
    const lookaheadSeconds = 0.14;
    const schedulerIntervalMs = 25;
    const projectSecondsPerBar = (60 / Math.max(1, bpmRef.current)) * 4;
    const nextStepCursor = Math.ceil(normalizedStartBar * 16 - 1e-9);

    playbackSessionIdRef.current = sessionId;
    transportStartAudioTimeRef.current = sharedContext.currentTime;
    transportStartBarRef.current = normalizedStartBar;
    schedulerStepCursorRef.current = nextStepCursor;
    songStepRef.current = ((Math.floor(normalizedStartBar * 16) % Math.max(16, safeSongBars * 16)) + Math.max(16, safeSongBars * 16)) % Math.max(16, safeSongBars * 16);
    lastUiStepRef.current = Math.floor(normalizedStartBar * 16) % 16;
    setActiveStep(lastUiStepRef.current);

    const tick = () => {
      if (playbackSessionIdRef.current !== sessionId || transportStartAudioTimeRef.current === null) {
        return;
      }

      const now = sharedContext.currentTime;
      const scheduleUntil = now + lookaheadSeconds;

      while (true) {
        const nextStepBar = schedulerStepCursorRef.current / 16;
        const nextStepAudioTime =
          transportStartAudioTimeRef.current +
          (nextStepBar - transportStartBarRef.current) * projectSecondsPerBar;

        if (nextStepAudioTime > scheduleUntil) {
          break;
        }

        scheduleTransportStep(schedulerStepCursorRef.current, nextStepAudioTime);
        schedulerStepCursorRef.current += 1;
      }
    };

    tick();
    schedulerTimerRef.current = window.setInterval(tick, schedulerIntervalMs);
  };

  const syncAudioPlayback = (running: boolean, nextPlayheadSeconds: number) => {
    const audioElements = audioElementsRef.current;
    const currentTracks = tracksRef.current;
    const safeSongBars = Math.max(1, songBarsRef.current);
    const songDurationSeconds = safeSongBars * secondsPerBar;
    const loopedSeconds = getLoopedSeconds(nextPlayheadSeconds, songDurationSeconds);
    const loopedBars = loopedSeconds / secondsPerBar;
    const hasSolo = currentTracks.some((track) => track.solo);
    const activeAudioClipIds = new Set<string>();

    for (const track of currentTracks) {
      if (track.type !== "audio") {
        continue;
      }

      const isAudible = hasSolo ? track.solo : !track.muted;
      const trackVolume = isAudible
        ? getTrackVolumeAtBar(track, loopedBars) * masterVolumeRef.current
        : 0;
      const tempoRatio = getTrackTempoRatio(track, bpmRef.current);

      for (const clip of track.clips) {
        if (!isAudioClip(clip) || !clip.audioDataUrl) {
          continue;
        }

        let element = audioElements.get(clip.id);
        if (!element) {
          element = new Audio(clip.audioDataUrl);
          element.preload = "auto";
          element.loop = false;
          audioElements.set(clip.id, element);
        } else if (element.src !== clip.audioDataUrl) {
          element.pause();
          element.src = clip.audioDataUrl;
          element.load();
        }

        const clipStartSeconds = clip.startBar * secondsPerBar;
        const clipDurationSeconds = clip.lengthBars * secondsPerBar;
        const clipOffsetSeconds = loopedSeconds - clipStartSeconds;
        const isActive =
          running &&
          trackVolume > 0 &&
          clipOffsetSeconds >= 0 &&
          clipOffsetSeconds < clipDurationSeconds;

        if (isActive) {
          activeAudioClipIds.add(clip.id);
          element.volume = clampVolume(trackVolume);
          element.playbackRate = tempoRatio;

          const targetTime = Math.max(0, clipOffsetSeconds * tempoRatio);
          const maxSeekTime =
            Number.isFinite(element.duration) && element.duration > 0
              ? Math.max(0, element.duration - 0.05)
              : targetTime;
          const clampedTime = Math.min(targetTime, maxSeekTime);
          const drift = Math.abs(element.currentTime - clampedTime);

          if (drift > 0.18) {
            try {
              element.currentTime = clampedTime;
            } catch {
              // Ignore seek failures before metadata is ready.
            }
          }

          if (element.paused) {
            void element.play().catch(() => {
              setStatus("Audio playback blocked");
            });
          }
          continue;
        }

        if (!element.paused) {
          element.pause();
        }

        const shouldReset = !running || loopedSeconds < clipStartSeconds || clipOffsetSeconds >= clipDurationSeconds;
        if (shouldReset && element.currentTime !== 0) {
          try {
            element.currentTime = 0;
          } catch {
            // Ignore seek failures before metadata is ready.
          }
        }
      }
    }

    for (const track of currentTracks) {
      for (const clip of track.clips) {
        if (isAudioClip(clip) && clip.audioDataUrl) {
          activeAudioClipIds.add(clip.id);
        }
      }
    }

    for (const [clipId, element] of audioElements.entries()) {
      if (activeAudioClipIds.has(clipId)) {
        continue;
      }

      element.pause();
      element.removeAttribute("src");
      element.load();
      audioElements.delete(clipId);
    }
  };

  const syncAutomationMixer = (nextPlayheadSeconds: number) => {
    const currentTracks = tracksRef.current;
    const safeSongBars = Math.max(1, songBarsRef.current);
    const songDurationSeconds = safeSongBars * secondsPerBar;
    const loopedBars = getLoopedSeconds(nextPlayheadSeconds, songDurationSeconds) / secondsPerBar;
    const adjustedTracks = currentTracks.map((track) => ({
      ...track,
      volume: getTrackVolumeAtBar(track, loopedBars)
    }));

    synthRef.current?.syncMixer(adjustedTracks, masterVolumeRef.current);
    synthEngineRef.current?.syncMixer(adjustedTracks, masterVolumeRef.current);
  };

  const cloneHistorySnapshot = (snapshot: HistorySnapshot): HistorySnapshot => structuredClone(snapshot);

  const createHistorySnapshot = (): HistorySnapshot =>
    cloneHistorySnapshot({
      bpm: bpmRef.current,
      masterVolume: masterVolumeRef.current,
      patterns: patternsRef.current,
      selectedClipId: selectedClipIdRef.current,
      selectedPatternId: selectedPatternIdRef.current,
      songBars: songBarsRef.current,
      tracks: tracksRef.current
    });

  const applyHistorySnapshot = (snapshot: HistorySnapshot) => {
    const nextSnapshot = cloneHistorySnapshot(snapshot);

    bpmRef.current = nextSnapshot.bpm;
    masterVolumeRef.current = nextSnapshot.masterVolume;
    patternsRef.current = nextSnapshot.patterns;
    selectedClipIdRef.current = nextSnapshot.selectedClipId;
    selectedPatternIdRef.current = nextSnapshot.selectedPatternId;
    songBarsRef.current = nextSnapshot.songBars;
    tracksRef.current = nextSnapshot.tracks;

    setBpm(nextSnapshot.bpm);
    setMasterVolume(nextSnapshot.masterVolume);
    setPatterns(nextSnapshot.patterns);
    setSelectedClipId(nextSnapshot.selectedClipId);
    setSelectedPatternId(nextSnapshot.selectedPatternId);
    setSongBars(nextSnapshot.songBars);
    setTracks(nextSnapshot.tracks);
  };

  const pushHistoryState = () => {
    undoStackRef.current.push(createHistorySnapshot());
    redoStackRef.current = [];
  };

  const undo = () => {
    const previousSnapshot = undoStackRef.current.pop();
    if (!previousSnapshot) {
      return;
    }

    redoStackRef.current.push(createHistorySnapshot());
    applyHistorySnapshot(previousSnapshot);
  };

  const redo = () => {
    const nextSnapshot = redoStackRef.current.pop();
    if (!nextSnapshot) {
      return;
    }

    undoStackRef.current.push(createHistorySnapshot());
    applyHistorySnapshot(nextSnapshot);
  };

  useEffect(() => {
    idCounterRef.current = Math.max(idCounterRef.current, getNextIdSeed(patterns, tracks));
  }, [patterns, tracks]);

  useEffect(() => {
    if (!selectedClipId) {
      selectedClipIdRef.current = selectedClipId;
      return;
    }

    if (!findClipById(tracks, selectedClipId)) {
      setSelectedClipId(null);
      selectedClipIdRef.current = null;
      return;
    }

    selectedClipIdRef.current = selectedClipId;
  }, [tracks, selectedClipId]);

  useEffect(() => {
    if (!selectedSynthClipId) {
      if (appView === "synth") {
        if (previewTrackIdRef.current) {
          synthEngineRef.current?.stopPreviewNote(previewTrackIdRef.current);
          previewTrackIdRef.current = null;
        }
        setAppView("arrangement");
      }
      return;
    }

    const clip = findClipById(tracks, selectedSynthClipId);
    if (!clip || !isSynthClip(clip)) {
      setSelectedSynthClipId(null);
      if (appView === "synth") {
        if (previewTrackIdRef.current) {
          synthEngineRef.current?.stopPreviewNote(previewTrackIdRef.current);
          previewTrackIdRef.current = null;
        }
        setAppView("arrangement");
      }
    }
  }, [appView, selectedSynthClipId, tracks]);

  useEffect(() => {
    if (appView === "synth") {
      return;
    }

    if (!previewTrackIdRef.current) {
      return;
    }

    synthEngineRef.current?.stopPreviewNote(previewTrackIdRef.current);
    previewTrackIdRef.current = null;
  }, [appView]);

  useEffect(() => {
    if (!synthRef.current) {
      synthRef.current = new DrumSynth();
    }

    if (!synthEngineRef.current) {
      synthEngineRef.current = new SynthEngine();
      const sharedContext = synthRef.current.getAudioContext();
      if (sharedContext) {
        synthEngineRef.current.attachContext(sharedContext);
      }
    }

    return () => {
      stopTransportScheduler();
      synthEngineRef.current?.stopAllVoices();
    };
  }, []);

  useEffect(() => {
    if (!isRunning) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }

    const tick = () => {
      const currentBar = getCurrentTransportBarPosition();
      const currentSecondsPerBar = (60 / Math.max(1, bpmRef.current)) * 4;
      setPlayheadSeconds(currentBar * currentSecondsPerBar);
      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isRunning]);

  const secondsPerBar = (60 / bpm) * 4;
  const playheadBars = playheadSeconds / secondsPerBar;

  const seekTransport = (nextBarPosition: number) => {
    const safeSongBars = Math.max(1, songBarsRef.current);
    const clampedBars = Math.max(0, Math.min(safeSongBars, nextBarPosition));
    const nextSeconds = clampedBars * secondsPerBar;
    const totalSongSteps = Math.max(16, safeSongBars * 16);
    const nextStep = ((Math.floor(clampedBars * 16) % totalSongSteps) + totalSongSteps) % totalSongSteps;

    setPlayheadSeconds(nextSeconds);
    setActiveStep(nextStep % 16);
    songStepRef.current = nextStep;
    transportStartBarRef.current = clampedBars;
  };

  useEffect(() => {
    if (!synthRef.current || !synthEngineRef.current) {
      return;
    }

    if (isRunning) {
      const currentBar = getCurrentTransportBarPosition();
      const totalSongSteps = Math.max(16, songBars * 16);
      const nextStep = ((Math.floor(currentBar * 16) % totalSongSteps) + totalSongSteps) % totalSongSteps;
      const currentTransportSeconds = currentBar * secondsPerBar;
      setActiveStep(nextStep % 16);
      setPlayheadSeconds(currentTransportSeconds);

      const sharedContext = getSharedAudioContext();
      if (!sharedContext) {
        return;
      }
      syncAutomationMixer(currentTransportSeconds);
      startTransportScheduler(currentBar);
    } else {
      stopTransportScheduler();
      synthEngineRef.current?.stopAllVoices();
    }
  }, [isRunning, songBars, bpm]);

  useEffect(() => {
    syncAudioPlayback(isRunning, playheadSeconds);
    syncAutomationMixer(playheadSeconds);
  }, [isRunning, playheadSeconds, tracks, masterVolume, songBars, bpm]);

  useEffect(() => {
    return () => {
      for (const element of audioElementsRef.current.values()) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      }
      audioElementsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      const tagName = target.tagName;
      return (
        target.isContentEditable ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT"
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
          return;
        }

        undo();
        return;
      }

      if (key === "y") {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [redo, undo]);

  const handlePlay = () => {
    if (previewTrackIdRef.current) {
      synthEngineRef.current?.stopPreviewNote(previewTrackIdRef.current);
      previewTrackIdRef.current = null;
    }
    syncAudioPlayback(true, playheadSeconds);
    setIsRunning(true);
  };

  const handleProjectBpmChange = (nextBpm: number) => {
    if (!Number.isFinite(nextBpm)) {
      return;
    }

    const clampedBpm = Math.max(30, Math.min(300, Math.round(nextBpm)));
    if (clampedBpm === bpmRef.current) {
      return;
    }

    const currentSecondsPerBar = (60 / Math.max(1, bpmRef.current)) * 4;
    const nextSecondsPerBar = (60 / clampedBpm) * 4;
    const sharedContext = synthRef.current?.getAudioContext();
    const currentBar =
      isRunning && transportStartAudioTimeRef.current !== null
        ? transportStartBarRef.current +
          ((sharedContext?.currentTime ?? transportStartAudioTimeRef.current) -
            transportStartAudioTimeRef.current) /
            currentSecondsPerBar
        : playheadSeconds / Math.max(MIN_GRID_RESOLUTION, currentSecondsPerBar);

    if (isRunning) {
      stopTransportScheduler();
      transportStartBarRef.current = currentBar;
      setPlayheadSeconds(currentBar * nextSecondsPerBar);
    }

    setBpm(clampedBpm);
  };

  const handlePause = () => {
    if (previewTrackIdRef.current) {
      synthEngineRef.current?.stopPreviewNote(previewTrackIdRef.current);
      previewTrackIdRef.current = null;
    }
    stopTransportScheduler();
    syncAudioPlayback(false, playheadSeconds);
    synthEngineRef.current?.stopAllVoices();
    setIsRunning(false);
  };

  const handleStop = () => {
    resumeAfterScrubRef.current = false;
    if (previewTrackIdRef.current) {
      synthEngineRef.current?.stopPreviewNote(previewTrackIdRef.current);
      previewTrackIdRef.current = null;
    }
    syncAudioPlayback(false, 0);
    synthEngineRef.current?.stopAllVoices();
    setIsRunning(false);
    setPlayheadSeconds(0);
    setActiveStep(0);
    songStepRef.current = 0;
    stopTransportScheduler();
    transportStartBarRef.current = 0;
  };

  const handleBeginScrub = () => {
    resumeAfterScrubRef.current = isRunning;
    if (previewTrackIdRef.current) {
      synthEngineRef.current?.stopPreviewNote(previewTrackIdRef.current);
      previewTrackIdRef.current = null;
    }
    if (isRunning) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      stopTransportScheduler();
      syncAudioPlayback(false, playheadSeconds);
      synthEngineRef.current?.stopAllVoices();
      setIsRunning(false);
    }
  };

  const handleScrubPlayhead = (barPosition: number) => {
    seekTransport(barPosition);
  };

  const handleEndScrub = (barPosition: number) => {
    seekTransport(barPosition);

    if (!resumeAfterScrubRef.current) {
      return;
    }

    resumeAfterScrubRef.current = false;
    syncAudioPlayback(true, barPosition * secondsPerBar);
    setIsRunning(true);
  };

  const handleStartSynthPreview = (trackId: string, pitch: number) => {
    const track = tracksRef.current.find((candidate) => candidate.id === trackId);
    if (!track || track.type !== "synth") {
      return;
    }

    getSharedAudioContext();
    synthEngineRef.current?.startPreviewNote(trackId, pitch, 0.85, track.synthSettings);
    previewTrackIdRef.current = trackId;
  };

  const handleStopSynthPreview = (trackId?: string) => {
    const activeTrackId = trackId ?? previewTrackIdRef.current;
    if (!activeTrackId) {
      return;
    }

    synthEngineRef.current?.stopPreviewNote(activeTrackId);
    if (previewTrackIdRef.current === activeTrackId) {
      previewTrackIdRef.current = null;
    }
  };

  const handleCloseSynthEditor = () => {
    handleStopSynthPreview();
    setAppView("arrangement");
  };

  const handleBeginClipChange = () => {
    pushHistoryState();
  };

  const handleBeginAutomationChange = () => {
    pushHistoryState();
  };

  const handleAddAutomationPoint = (trackId: string, bar: number, value: number) => {
    pushHistoryState();
    const activeSnapStep = snapEnabled ? gridResolution : null;
    const nextPoint = normalizeAutomationPoint(
      {
        id: `automation-${idCounterRef.current++}`,
        bar,
        value
      },
      songBars,
      activeSnapStep
    );

    setTracks((prev) =>
      prev.map((track) =>
        track.id === trackId
          ? {
              ...track,
              automationPoints: sortAutomationPoints([...track.automationPoints, nextPoint])
            }
          : track
      )
    );
  };

  const handleMoveAutomationPoint = (
    trackId: string,
    pointId: string,
    bar: number,
    value: number
  ) => {
    const activeSnapStep = snapEnabled ? gridResolution : null;
    setTracks((prev) =>
      prev.map((track) =>
        track.id === trackId
          ? {
              ...track,
              automationPoints: sortAutomationPoints(
                track.automationPoints.map((point) =>
                  point.id === pointId
                    ? normalizeAutomationPoint({ ...point, bar, value }, songBars, activeSnapStep)
                    : point
                )
              )
            }
          : track
      )
    );
  };

  const handleDeleteAutomationPoint = (trackId: string, pointId: string) => {
    pushHistoryState();
    setTracks((prev) =>
      prev.map((track) =>
        track.id === trackId
          ? {
              ...track,
              automationPoints: track.automationPoints.filter((point) => point.id !== pointId)
            }
          : track
      )
    );
  };

  const handleBeginSynthNoteChange = () => {
    pushHistoryState();
  };

  const handleBeginSynthSettingsChange = () => {
    pushHistoryState();
  };

  const handleOpenSynthEditor = (trackId: string) => {
    const track = tracks.find((candidate) => candidate.id === trackId && candidate.type === "synth");
    if (!track) {
      return;
    }

    const existingClip =
      track.clips.find(
        (clip) => clip.id === selectedSynthClipId && isSynthClip(clip)
      ) ??
      track.clips.find(isSynthClip) ??
      null;

    if (existingClip) {
      selectedClipIdRef.current = existingClip.id;
      setSelectedClipId(existingClip.id);
      setSelectedSynthClipId(existingClip.id);
      setAppView("synth");
      return;
    }

    pushHistoryState();
    const nextClipId = `clip-${idCounterRef.current++}`;
    const nextNoteId = `note-${idCounterRef.current++}`;
    const defaultLength = Math.max(MIN_GRID_RESOLUTION, Math.min(4, songBarsRef.current));
    const nextClip = createSynthClip(nextClipId, trackId, 0, defaultLength, [
      createDefaultSynthNote(nextNoteId)
    ]);

    setTracks((prev) =>
      prev.map((candidate) =>
        candidate.id === trackId
          ? {
              ...candidate,
              clips: [...candidate.clips, nextClip]
            }
          : candidate
      )
    );
    selectedClipIdRef.current = nextClipId;
    setSelectedClipId(nextClipId);
    setSelectedSynthClipId(nextClipId);
    setAppView("synth");
  };

  const handleAddSynthNote = (
    clipId: string,
    pitch: number,
    startBar: number,
    lengthBars: number
  ): string => {
    pushHistoryState();
    const synthSnap = snapEnabled ? MIN_GRID_RESOLUTION : null;
    const nextNoteId = `note-${idCounterRef.current++}`;

    setTracks((prev) =>
      prev.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => {
          if (clip.id !== clipId || !isSynthClip(clip)) {
            return clip;
          }

          const nextNote = clampSynthNoteToClip(
            {
              id: nextNoteId,
              pitch,
              startBar,
              lengthBars,
              velocity: 0.85
            },
            clip.lengthBars,
            synthSnap
          );

          return {
            ...clip,
            notes: sortSynthNotes([...clip.notes, nextNote])
          };
        })
      }))
    );

    return nextNoteId;
  };

  const handleMoveSynthNote = (
    clipId: string,
    noteId: string,
    startBar: number,
    pitch: number
  ) => {
    const synthSnap = snapEnabled ? MIN_GRID_RESOLUTION : null;

    setTracks((prev) =>
      prev.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => {
          if (clip.id !== clipId || !isSynthClip(clip)) {
            return clip;
          }

          return {
            ...clip,
            notes: sortSynthNotes(
              clip.notes.map((note) =>
                note.id === noteId
                  ? clampSynthNoteToClip({ ...note, startBar, pitch }, clip.lengthBars, synthSnap)
                  : note
              )
            )
          };
        })
      }))
    );
  };

  const handleResizeSynthNote = (
    clipId: string,
    noteId: string,
    startBar: number,
    lengthBars: number
  ) => {
    const synthSnap = snapEnabled ? MIN_GRID_RESOLUTION : null;

    setTracks((prev) =>
      prev.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => {
          if (clip.id !== clipId || !isSynthClip(clip)) {
            return clip;
          }

          return {
            ...clip,
            notes: sortSynthNotes(
              clip.notes.map((note) =>
                note.id === noteId
                  ? clampSynthNoteToClip(
                      { ...note, startBar, lengthBars },
                      clip.lengthBars,
                      synthSnap
                    )
                  : note
              )
            )
          };
        })
      }))
    );
  };

  const handleDeleteSynthNote = (clipId: string, noteId: string) => {
    pushHistoryState();
    setTracks((prev) =>
      prev.map((track) => ({
        ...track,
        clips: track.clips.map((clip) =>
          clip.id === clipId && isSynthClip(clip)
            ? {
                ...clip,
                notes: clip.notes.filter((note) => note.id !== noteId)
              }
            : clip
        )
      }))
    );
  };

  const handleUpdateSynthOscillator = (
    trackId: string,
    oscillator: SynthSettingsModel["oscillator"]
  ) => {
    setTracks((prev) =>
      prev.map((track) =>
        track.id === trackId
          ? {
              ...track,
              synthSettings: {
                ...track.synthSettings,
                oscillator
              }
            }
          : track
      )
    );
  };

  const handleUpdateSynthSettingValue = (
    trackId: string,
    key:
      | "attack"
      | "decay"
      | "sustain"
      | "release"
      | "filterCutoff"
      | "resonance"
      | "glideTimeMs"
      | "detuneCents"
      | "filterEnvelopeAmount"
      | "filterEnvelopeAttack"
      | "filterEnvelopeDecay"
      | "drive",
    value: number
  ) => {
    setTracks((prev) =>
      prev.map((track) =>
        track.id === trackId
          ? {
              ...track,
              synthSettings: {
                ...track.synthSettings,
                [key]: clampSynthSettingValue(key, value)
              }
            }
          : track
      )
    );
  };

  const handleToggleSynthSetting = (trackId: string, key: "glideEnabled") => {
    setTracks((prev) =>
      prev.map((track) =>
        track.id === trackId
          ? {
              ...track,
              synthSettings: {
                ...track.synthSettings,
                [key]: !track.synthSettings[key]
              }
            }
          : track
      )
    );
  };

  const handleToggleStep = (rowIndex: number, stepIndex: number) => {
    pushHistoryState();
    setPatterns((prev) =>
      prev.map((pattern) => {
        if (pattern.id !== selectedPatternId) return pattern;
        const nextSteps = pattern.steps.map((row, rIdx) =>
          row.map((value, sIdx) => (rIdx === rowIndex && sIdx === stepIndex ? !value : value))
        );
        return { ...pattern, steps: nextSteps };
      })
    );
  };

  const handleClonePattern = () => {
    const source = patterns.find((pattern) => pattern.id === selectedPatternId);
    if (!source) return;

    pushHistoryState();
    const nextId = `pattern-${idCounterRef.current++}`;
    const displayName = getPatternDisplayName(patterns.length);
    const clone: DrumPatternModel = {
      id: nextId,
      name: displayName,
      steps: source.steps.map((row) => [...row])
    };

    setPatterns((prev) => [...prev, clone]);
    setSelectedPatternId(clone.id);

    if (selectedClipId) {
      setTracks((prev) =>
        prev.map((track) => ({
          ...track,
          clips: track.clips.map((clip) =>
            clip.id === selectedClipId && isDrumClip(clip)
              ? { ...clip, patternId: clone.id }
              : clip
          )
        }))
      );
    }
  };

  const handleSave = () => {
    const store = storeRef.current;
    if (!store) return;

    const snapshot: ProjectSnapshot = {
      bpm,
      songBars,
      patterns,
      tracks,
      selectedPatternId,
      masterVolume
    };
    store.save(snapshot);
    setStatus("Saved");
  };

  const handleLoad = () => {
    const store = storeRef.current;
    if (!store) return;

    const snapshot = store.load();
    if (!snapshot) {
      setStatus("Nothing saved");
      return;
    }

    const nextSongBars = snapshot.songBars ?? 16;
    const nextPatterns =
      snapshot.patterns && snapshot.patterns.length > 0 ? snapshot.patterns : createDefaultPatterns();
    const nextTracks = ensureTracks(snapshot.tracks ?? [], snapshot.bpm).map((track) => ({
      ...track,
      clips: track.clips.map((clip) => clampClipToSong(clip, nextSongBars))
    }));
    const nextSelectedPatternId = snapshot.selectedPatternId ?? nextPatterns[0]?.id ?? "A";

    setIsRunning(false);
    syncAudioPlayback(false, 0);
    synthEngineRef.current?.stopAllVoices();
    setPlayheadSeconds(0);
    setActiveStep(0);
    songStepRef.current = 0;
    stopTransportScheduler();
    transportStartBarRef.current = 0;
    undoStackRef.current = [];
    redoStackRef.current = [];
    bpmRef.current = snapshot.bpm;
    songBarsRef.current = nextSongBars;
    patternsRef.current = nextPatterns;
    tracksRef.current = nextTracks;
    masterVolumeRef.current = clampVolume(snapshot.masterVolume ?? 1);
    selectedPatternIdRef.current = nextSelectedPatternId;
    selectedClipIdRef.current = null;

    setBpm(snapshot.bpm);
    setSongBars(nextSongBars);
    setPatterns(nextPatterns);
    setTracks(nextTracks);
    setMasterVolume(clampVolume(snapshot.masterVolume ?? 1));
    setSelectedPatternId(nextSelectedPatternId);
    setSelectedClipId(null);
    setSelectedSynthClipId(null);
    previewTrackIdRef.current = null;
    setAppView("arrangement");
    setStatus("Loaded");
  };

  const handleExportWav = async () => {
    if (exporting) return;

    setExporting(true);
    try {
      const patternMap: Record<string, boolean[][]> = {};
      for (const pattern of patterns) {
        patternMap[pattern.id] = pattern.steps;
      }

      const blob = await Renderer.renderDrumArrangementToWav({
        bpm,
        songBars,
        tracks,
        patterns: patternMap,
        durationSeconds: songBars * secondsPerBar,
        masterVolume
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `song-${bpm}bpm.wav`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("Exported WAV");
    } catch {
      setStatus("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleSongBarsChange = (bars: number) => {
    if (!Number.isFinite(bars)) return;
    const nextBars = Math.max(1, Math.floor(bars));
    const activeSnapStep = snapEnabled ? gridResolution : null;
    setSongBars(nextBars);
    setTracks((prev) =>
      prev.map((track) => ({
        ...track,
        automationPoints: sortAutomationPoints(
          track.automationPoints.map((point) =>
            normalizeAutomationPoint(point, nextBars, activeSnapStep)
          )
        ),
        clips: track.clips.map((clip) => {
          const minLength = activeSnapStep ?? MIN_GRID_RESOLUTION;
          const maxStart = Math.max(0, nextBars - minLength);
          const startBar = Math.min(clip.startBar, maxStart);
          return clampClipToSong({ ...clip, startBar }, nextBars, activeSnapStep);
        })
      }))
    );
  };

  const handleMoveClip = (clipId: string, startBar: number) => {
    const activeSnapStep = snapEnabled ? gridResolution : null;
    setTracks((prev) =>
      prev.map((track) => ({
        ...track,
        clips: track.clips.map((clip) =>
          clip.id === clipId ? clampClipToSong({ ...clip, startBar }, songBars, activeSnapStep) : clip
        )
      }))
    );
  };

  const handleResizeClip = (clipId: string, startBar: number, lengthBars: number) => {
    const activeSnapStep = snapEnabled ? gridResolution : null;
    setTracks((prev) =>
      prev.map((track) => ({
        ...track,
        clips: track.clips.map((clip) =>
          clip.id === clipId
            ? clampClipToSong({ ...clip, startBar, lengthBars }, songBars, activeSnapStep)
            : clip
        )
      }))
    );
  };

  const handleDuplicateClip = (clipId: string) => {
    pushHistoryState();
    const newId = `clip-${idCounterRef.current++}`;
    const activeSnapStep = snapEnabled ? gridResolution : null;
    const minLength = activeSnapStep ?? MIN_GRID_RESOLUTION;
    const sourceClip = findClipById(tracks, clipId);

    setTracks((prev) =>
      prev.map((track) => {
        const source = track.clips.find((clip) => clip.id === clipId);
        if (!source) {
          return track;
        }

        const nextStart = source.startBar + source.lengthBars;
        const maxStart = Math.max(0, songBars - minLength);
        const startBar = Math.min(nextStart, maxStart);
        const lengthBars = Math.min(source.lengthBars, Math.max(minLength, songBars - startBar));
        const duplicate = clampClipToSong(
          {
            ...source,
            id: newId,
            ...(isSynthClip(source)
              ? {
                  notes: source.notes.map((note) => ({
                    ...note,
                    id: `note-${idCounterRef.current++}`
                  }))
                }
              : {}),
            startBar,
            lengthBars
          },
          songBars,
          activeSnapStep
        );

        return {
          ...track,
          clips: [...track.clips, duplicate]
        };
      })
    );

    setSelectedClipId(newId);
    if (sourceClip && isSynthClip(sourceClip)) {
      setSelectedSynthClipId(newId);
    }
  };

  const handleDeleteClip = (clipId: string) => {
    pushHistoryState();
    setTracks((prev) =>
      prev.map((track) => ({
        ...track,
        clips: track.clips.filter((clip) => clip.id !== clipId)
      }))
    );
    setSelectedClipId((prev) => (prev === clipId ? null : prev));
    setSelectedSynthClipId((prev) => (prev === clipId ? null : prev));
  };

  const handleSetClipPattern = (clipId: string, patternId: string) => {
    const clip = findClipById(tracks, clipId);
    if (!clip || !isDrumClip(clip) || clip.patternId === patternId) {
      return;
    }

    pushHistoryState();
    setTracks((prev) =>
      prev.map((track) => ({
        ...track,
        clips: track.clips.map((clip) =>
          clip.id === clipId && isDrumClip(clip) ? { ...clip, patternId } : clip
        )
      }))
    );
  };

  const handleSetClipTrack = (clipId: string, targetTrackId: string) => {
    let sourceTrackId: string | null = null;
    let clipToMove: TrackClipModel | null = null;

    for (const track of tracks) {
      const clip = track.clips.find((candidate) => candidate.id === clipId);
      if (clip) {
        sourceTrackId = track.id;
        clipToMove = clip;
        break;
      }
    }

    if (!sourceTrackId || !clipToMove || sourceTrackId === targetTrackId) {
      return;
    }

    const targetTrack = tracks.find((track) => track.id === targetTrackId);
    if (!targetTrack || targetTrack.type !== clipToMove.kind) {
      return;
    }

    pushHistoryState();
    setTracks((prev) => {
      return prev.map((track) => {
        if (track.id === sourceTrackId) {
          return {
            ...track,
            clips: track.clips.filter((clip) => clip.id !== clipId)
          };
        }

        if (track.id === targetTrackId) {
          return {
            ...track,
            clips: [...track.clips, { ...clipToMove, trackId: targetTrackId }]
          };
        }

        return track;
      });
    });
  };

  const handleTrackVolumeChange = (trackId: string, volume: number) => {
    setTracks((prev) =>
      prev.map((track) =>
        track.id === trackId ? { ...track, volume: clampVolume(volume) } : track
      )
    );
  };

  const handleTrackBpmChange = (trackId: string, nextTrackBpm: number) => {
    setTracks((prev) =>
      prev.map((track) =>
        track.id === trackId ? { ...track, bpm: clampTrackBpm(nextTrackBpm, bpm) } : track
      )
    );
  };

  const handleToggleTrackMute = (trackId: string) => {
    setTracks((prev) =>
      prev.map((track) =>
        track.id === trackId ? { ...track, muted: !track.muted } : track
      )
    );
  };

  const handleToggleTrackSolo = (trackId: string) => {
    setTracks((prev) =>
      prev.map((track) =>
        track.id === trackId ? { ...track, solo: !track.solo } : track
      )
    );
  };

  const handleAddTrack = (type: TrackType) => {
    const nextId = `track-${idCounterRef.current++}`;
    let nextSynthClipId: string | null = null;

    setTracks((prev) => {
      const trackNumber = prev.filter((track) => track.type === type).length + 1;
      if (type === "synth") {
        nextSynthClipId = `clip-${idCounterRef.current++}`;
        const nextNoteId = `note-${idCounterRef.current++}`;
        const defaultLength = Math.max(MIN_GRID_RESOLUTION, Math.min(4, songBarsRef.current));
        return [
          ...prev,
          createTrack(
            nextId,
            getDefaultTrackName(type, trackNumber),
            type,
            [
              createSynthClip(nextSynthClipId, nextId, 0, defaultLength, [
                createDefaultSynthNote(nextNoteId)
              ])
            ],
            [],
            makeDefaultSynthSettings(),
            bpm
          )
        ];
      }

      return [
        ...prev,
        createTrack(nextId, getDefaultTrackName(type, trackNumber), type, [], [], makeDefaultSynthSettings(), bpm)
      ];
    });

    if (type === "synth" && nextSynthClipId) {
      selectedClipIdRef.current = nextSynthClipId;
      setSelectedClipId(nextSynthClipId);
      setSelectedSynthClipId(nextSynthClipId);
      setAppView("synth");
    }
  };

  const handleAddAudioFiles = async (files: FileList) => {
    const selectedFiles = Array.from(files);
    if (selectedFiles.length === 0) {
      return;
    }

    setStatus("Importing audio...");

    const preparedImports = await Promise.allSettled(
      selectedFiles.map(async (file) => {
        const [audioDataUrl, durationSeconds] = await Promise.all([
          readFileAsDataUrl(file),
          readAudioDuration(file)
        ]);

        return {
          audioDataUrl,
          lengthBars: Math.max(1, Math.ceil(durationSeconds / secondsPerBar)),
          name: getFileStem(file.name)
        };
      })
    );

    const successfulImports = preparedImports
      .filter(
        (
          result
        ): result is PromiseFulfilledResult<{
          audioDataUrl: string;
          lengthBars: number;
          name: string;
        }> => result.status === "fulfilled"
      )
      .map((result) => result.value);

    if (successfulImports.length === 0) {
      setStatus("Audio import failed");
      return;
    }

    const nextTracks = tracksRef.current.map((track) => ({
      ...track,
      clips: [...track.clips]
    }));

    let audioTrack = nextTracks.find((track) => track.type === "audio") ?? null;
    if (!audioTrack) {
      const nextTrackId = `track-${idCounterRef.current++}`;
      const trackNumber = nextTracks.filter((track) => track.type === "audio").length + 1;
      audioTrack = createTrack(
        nextTrackId,
        getDefaultTrackName("audio", trackNumber),
        "audio",
        [],
        [],
        makeDefaultSynthSettings(),
        bpmRef.current
      );
      nextTracks.push(audioTrack);
    }

    let nextSongBars = Math.max(1, songBarsRef.current);
    let lastImportedClipId: string | null = null;

    for (const importedClip of successfulImports) {
      const clipId = `clip-${idCounterRef.current++}`;
      const startBar = getTrackEndBar(audioTrack);
      const nextClip: AudioClipModel = {
        id: clipId,
        kind: "audio",
        trackId: audioTrack.id,
        startBar,
        lengthBars: importedClip.lengthBars,
        name: importedClip.name,
        audioDataUrl: importedClip.audioDataUrl
      };

      audioTrack.clips = [...audioTrack.clips, nextClip];
      nextSongBars = Math.max(nextSongBars, getClipEndBar(nextClip));
      lastImportedClipId = clipId;
    }

    tracksRef.current = nextTracks;
    songBarsRef.current = nextSongBars;
    setTracks(nextTracks);
    setSongBars(nextSongBars);
    setSelectedClipId(lastImportedClipId);

    const failedImports = preparedImports.length - successfulImports.length;
    const fileLabel = successfulImports.length === 1 ? "file" : "files";
    setStatus(
      failedImports > 0
        ? `Imported ${successfulImports.length} audio ${fileLabel}, ${failedImports} failed`
        : `Imported ${successfulImports.length} audio ${fileLabel}`
    );
  };

  const handleDeleteTrack = (trackId: string) => {
    const trackToDelete = tracks.find((track) => track.id === trackId);
    if (!trackToDelete) {
      return;
    }

    const confirmed = window.confirm(`Delete "${trackToDelete.name}" and all clips on this track?`);
    if (!confirmed) {
      return;
    }

    pushHistoryState();
    const shouldResetSelection = trackToDelete.clips.some((clip) => clip.id === selectedClipId);
    synthRef.current?.removeTrack(trackId);
    synthEngineRef.current?.removeTrack(trackId);
    for (const clip of trackToDelete.clips) {
      if (!isAudioClip(clip)) {
        continue;
      }

      const element = audioElementsRef.current.get(clip.id);
      if (!element) {
        continue;
      }

      element.pause();
      element.removeAttribute("src");
      element.load();
      audioElementsRef.current.delete(clip.id);
    }
    const remainingTracks = tracks.filter((track) => track.id !== trackId);
    const nextTracks =
      remainingTracks.length > 0
        ? remainingTracks
        : [
            createTrack(
              `track-${idCounterRef.current++}`,
              getDefaultTrackName(trackToDelete.type, 1),
              trackToDelete.type,
              [],
              [],
              trackToDelete.synthSettings,
              trackToDelete.bpm
            )
          ];

    tracksRef.current = nextTracks;
    setTracks(nextTracks);

    if (shouldResetSelection) {
      setSelectedClipId(null);
      setSelectedSynthClipId(null);
    }

    setStatus(`Deleted ${trackToDelete.name}`);
  };

  const loopedBars = playheadBars % songBars;
  const loopedSeconds = getLoopedSeconds(playheadSeconds, Math.max(1, songBars) * secondsPerBar);
  const hasSolo = tracks.some((track) => track.solo);
  const activeClipIds = isRunning
    ? tracks.flatMap((track) => {
        const clipIds: string[] = [];

        if (track.type === "drum") {
          const activeDrumClip = getActiveDrumClip(track, loopedBars);
          if (activeDrumClip) {
            clipIds.push(activeDrumClip.id);
          }
          return clipIds;
        }

        if (track.type === "synth") {
          const activeSynthClip = getActiveSynthClip(track, loopedBars);
          if (activeSynthClip) {
            clipIds.push(activeSynthClip.id);
          }
          return clipIds;
        }

        const isAudible = hasSolo ? track.solo : !track.muted;
        if (!isAudible) {
          return clipIds;
        }

        for (const clip of track.clips) {
          if (!isAudioClip(clip) || !clip.audioDataUrl) {
            continue;
          }

          const clipStartSeconds = clip.startBar * secondsPerBar;
          const clipDurationSeconds = clip.lengthBars * secondsPerBar;
          if (
            loopedSeconds >= clipStartSeconds &&
            loopedSeconds < clipStartSeconds + clipDurationSeconds
          ) {
            clipIds.push(clip.id);
          }
        }

        return clipIds;
      })
    : [];
  const selectedEditorClip = selectedSynthClipId ? findClipById(tracks, selectedSynthClipId) : null;
  const selectedSynthClip =
    selectedEditorClip && isSynthClip(selectedEditorClip) ? selectedEditorClip : null;
  const selectedSynthTrack = selectedSynthClip
    ? tracks.find((track) => track.id === selectedSynthClip.trackId) ?? null
    : null;

  return (
    <div className="app-root">
      <TransportBar
        bpm={bpm}
        isRunning={isRunning}
        playheadSeconds={playheadSeconds}
        onPlay={handlePlay}
        onPause={handlePause}
        onStop={handleStop}
        onBpmChange={handleProjectBpmChange}
        gridResolution={gridResolution}
        onGridResolutionChange={setGridResolution}
        snapEnabled={snapEnabled}
        onSnapEnabledChange={setSnapEnabled}
        songBars={songBars}
        onSongBarsChange={handleSongBarsChange}
        onUndo={undo}
        onSave={handleSave}
        onLoad={handleLoad}
        status={status}
        onExportWav={handleExportWav}
        isExporting={exporting}
      />
      {appView === "arrangement" ? (
        <TrackList
          tracks={tracks}
          masterVolume={masterVolume}
          onTrackVolumeChange={handleTrackVolumeChange}
          onTrackBpmChange={handleTrackBpmChange}
          onToggleTrackMute={handleToggleTrackMute}
          onToggleTrackSolo={handleToggleTrackSolo}
          onDeleteTrack={handleDeleteTrack}
          onMasterVolumeChange={(volume) => setMasterVolume(clampVolume(volume))}
          onAddDrumTrack={() => handleAddTrack("drum")}
          onAddSynthTrack={() => handleAddTrack("synth")}
          onAddAudioFiles={handleAddAudioFiles}
          onOpenSynthEditor={handleOpenSynthEditor}
        />
      ) : null}
      {appView === "arrangement" ? (
        <>
          <Timeline
            bpm={bpm}
            gridResolution={gridResolution}
            snapEnabled={snapEnabled}
            isRunning={isRunning}
            playheadBars={playheadBars}
            songBars={songBars}
            tracks={tracks.map((track) => ({
              id: track.id,
              name: track.name,
              type: track.type,
              automationPoints: [...track.automationPoints],
              clips: [...track.clips]
                .sort((a, b) => a.startBar - b.startBar)
                .map((clip) => ({
                  id: clip.id,
                  trackId: clip.trackId,
                  kind: clip.kind,
                  startBar: clip.startBar,
                  lengthBars: clip.lengthBars,
                  label:
                    clip.kind === "drum"
                      ? getPatternDisplayName(
                          Math.max(
                            0,
                            patterns.findIndex((pattern) => pattern.id === clip.patternId)
                          )
                        )
                      : clip.kind === "audio"
                        ? clip.name
                        : "Synth",
                  patternId: clip.kind === "drum" ? clip.patternId : undefined
                }))
            }))}
            activeClipIds={activeClipIds}
            selectedClipId={selectedClipId}
            onAddAutomationPoint={handleAddAutomationPoint}
            onBeginAutomationChange={handleBeginAutomationChange}
            onDeleteAutomationPoint={handleDeleteAutomationPoint}
            onMoveAutomationPoint={handleMoveAutomationPoint}
            onSelectClip={(clipId) => {
              selectedClipIdRef.current = clipId;
              setSelectedClipId(clipId);
              const clip = findClipById(tracks, clipId);
              if (clip && isDrumClip(clip)) {
                selectedPatternIdRef.current = clip.patternId;
                setSelectedPatternId(clip.patternId);
              }
              if (clip && isSynthClip(clip)) {
                setSelectedSynthClipId(clip.id);
              }
            }}
            onBeginClipChange={handleBeginClipChange}
            onMoveClip={handleMoveClip}
            onResizeClip={handleResizeClip}
            onDuplicateClip={handleDuplicateClip}
            onDeleteClip={handleDeleteClip}
            onChangeClipPattern={handleSetClipPattern}
            onChangeClipTrack={handleSetClipTrack}
            onBeginScrub={handleBeginScrub}
            onScrubPlayhead={handleScrubPlayhead}
            onEndScrub={handleEndScrub}
            patternOptions={patterns.map((pattern, index) => ({
              id: pattern.id,
              name: getPatternDisplayName(index)
            }))}
            trackOptions={tracks.map((track) => ({
              id: track.id,
              name: track.name,
              type: track.type
            }))}
          />
          <DrumMachine
            editPattern={
              patterns.find((pattern) => pattern.id === selectedPatternId)?.steps ??
              patterns[0]?.steps ??
              createEmptyPattern()
            }
            patterns={patterns.map((pattern, index) => ({
              id: pattern.id,
              name: getPatternDisplayName(index)
            }))}
            onToggleStep={handleToggleStep}
            activeStep={isRunning ? activeStep : -1}
            selectedPatternId={selectedPatternId}
            onSelectPattern={(patternId) => {
              selectedPatternIdRef.current = patternId as DrumPatternId;
              setSelectedPatternId(patternId as DrumPatternId);
            }}
            onClonePattern={handleClonePattern}
          />
        </>
      ) : (
        <SynthEditor
          track={selectedSynthTrack}
          clip={selectedSynthClip}
          gridResolution={Math.min(gridResolution, MIN_GRID_RESOLUTION)}
          snapEnabled={snapEnabled}
          playheadBars={loopedBars}
          isRunning={isRunning}
          onBack={handleCloseSynthEditor}
          onBeginNoteChange={handleBeginSynthNoteChange}
          onAddNote={handleAddSynthNote}
          onMoveNote={handleMoveSynthNote}
          onResizeNote={handleResizeSynthNote}
          onDeleteNote={handleDeleteSynthNote}
          onStartPreviewNote={handleStartSynthPreview}
          onStopPreviewNote={handleStopSynthPreview}
          onBeginSettingsChange={handleBeginSynthSettingsChange}
          onToggleSetting={handleToggleSynthSetting}
          onChangeOscillator={handleUpdateSynthOscillator}
          onChangeSetting={handleUpdateSynthSettingValue}
        />
      )}
    </div>
  );
}
