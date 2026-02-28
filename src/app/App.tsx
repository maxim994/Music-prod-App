import { useEffect, useRef, useState } from "react";
import { Renderer } from "../audio/Renderer";
import { DrumSynth } from "../audio/DrumSynth";
import type {
  AutomationPointModel,
  AudioClipModel,
  DrumClipModel,
  DrumPatternModel,
  ProjectSnapshot,
  TrackClipModel,
  TrackModel,
  TrackType
} from "../model/types";
import { StepSequencer } from "../sequencer/StepSequencer";
import { LocalProjectStore } from "../storage/LocalProjectStore";
import { DrumMachine } from "../ui/components/DrumMachine/DrumMachine";
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

const createTrack = (
  id: string,
  name: string,
  type: TrackType,
  clips: TrackClipModel[] = [],
  automationPoints: AutomationPointModel[] = [],
  trackBpm = 120
): TrackModel => ({
  id,
  name,
  type,
  bpm: trackBpm,
  volume: 1,
  muted: false,
  solo: false,
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
  ], [], 120),
  createTrack("track-2", "Drums 2", "drum", [createDrumClip("clip-2", "track-2", 4, 4, "B")], [], 120)
];

const getPatternDisplayName = (index: number) => String.fromCharCode(65 + index);

const isDrumClip = (clip: TrackClipModel): clip is DrumClipModel => clip.kind === "drum";

const isAudioClip = (clip: TrackClipModel): clip is AudioClipModel => clip.kind === "audio";

const clampVolume = (value: number): number => Math.min(1, Math.max(0, value));

const clampAutomationValue = (value: number): number => Math.min(1, Math.max(0, value));

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
  return {
    ...clip,
    startBar,
    lengthBars
  };
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
      automationPoints: sortAutomationPoints(
        (track.automationPoints ?? []).map((point) => ({
          ...point,
          bar: normalizeAutomationBar(point.bar),
          value: clampAutomationValue(point.value)
        }))
      ),
      clips: track.clips.map((clip) => ({ ...clip, trackId: track.id }))
    }));
  }

  return [createTrack("track-1", "Drums 1", "drum", [], [], fallbackBpm)];
};

const getDefaultTrackName = (type: TrackType, index: number): string =>
  `${type === "drum" ? "Drums" : "Audio"} ${index}`;

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
  const [activeStep, setActiveStep] = useState(0);

  const bpmRef = useRef(bpm);
  const selectedPatternIdRef = useRef(selectedPatternId);
  const selectedClipIdRef = useRef(selectedClipId);
  const patternsRef = useRef(patterns);
  const tracksRef = useRef(tracks);
  const songBarsRef = useRef(songBars);
  const masterVolumeRef = useRef(masterVolume);
  const rafIdRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const storeRef = useRef<LocalProjectStore | null>(null);
  const sequencerRef = useRef<StepSequencer | null>(null);
  const synthRef = useRef<DrumSynth | null>(null);
  const audioElementsRef = useRef(new Map<string, HTMLAudioElement>());
  const resumeAfterScrubRef = useRef(false);
  const undoStackRef = useRef<HistorySnapshot[]>([]);
  const redoStackRef = useRef<HistorySnapshot[]>([]);
  const songStepRef = useRef(0);
  const idCounterRef = useRef(4);

  useEffect(() => {
    storeRef.current = new LocalProjectStore();
  }, []);

  useEffect(() => {
    bpmRef.current = bpm;
    sequencerRef.current?.setBpm(bpm);
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
    if (isRunning) {
      syncAutomationMixer(playheadSeconds);
      return;
    }

    synthRef.current?.syncMixer(tracks, masterVolumeRef.current);
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
  }, [masterVolume]);

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
    if (!sequencerRef.current) {
      sequencerRef.current = new StepSequencer({
        bpm,
        steps: 16,
        onStep: () => {
          const totalSongSteps = Math.max(16, songBarsRef.current * 16);
          const absoluteStep = songStepRef.current % totalSongSteps;
          const stepIndex = absoluteStep % 16;
          const barPosition = absoluteStep / 16;
          setActiveStep(stepIndex);

          const synth = synthRef.current;
          if (synth) {
            const patternMap = new Map(patternsRef.current.map((pattern) => [pattern.id, pattern.steps]));
            const projectBpm = Math.max(1, bpmRef.current);
            const projectStepSeconds = (60 / projectBpm) / 4;

            for (const track of tracksRef.current) {
              if (track.type !== "drum") {
                continue;
              }

              const activeClip = getActiveDrumClip(track, barPosition);
              if (!activeClip) {
                continue;
              }

              const pattern = patternMap.get(activeClip.patternId);
              if (!pattern) {
                continue;
              }

              const tempoRatio = getTrackTempoRatio(track, projectBpm);
              const localStartStep = absoluteStep * tempoRatio;
              const localEndStep = (absoluteStep + 1) * tempoRatio;
              const firstScheduledStep = Number.isInteger(localStartStep)
                ? Math.floor(localStartStep)
                : Math.ceil(localStartStep);

              for (let localStep = firstScheduledStep; localStep < localEndStep; localStep += 1) {
                const clipStepOffset = Math.round(activeClip.startBar * 16);
                const localStepIndex = (((localStep - clipStepOffset) % 16) + 16) % 16;
                const offsetSeconds =
                  ((localStep - localStartStep) / tempoRatio) * projectStepSeconds;

                if (pattern[0]?.[localStepIndex]) synth.playKick(track.id, offsetSeconds);
                if (pattern[1]?.[localStepIndex]) synth.playSnare(track.id, offsetSeconds);
                if (pattern[2]?.[localStepIndex]) synth.playHat(track.id, offsetSeconds);
              }
            }
          }

          songStepRef.current = (absoluteStep + 1) % totalSongSteps;
        }
      });
    }

    if (!synthRef.current) {
      synthRef.current = new DrumSynth();
    }

    return () => {
      sequencerRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!isRunning) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      lastTsRef.current = null;
      return;
    }

    const tick = (ts: number) => {
      if (lastTsRef.current === null) {
        lastTsRef.current = ts;
      }
      const deltaMs = ts - lastTsRef.current;
      lastTsRef.current = ts;

      setPlayheadSeconds((prev) => prev + deltaMs / 1000);
      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      lastTsRef.current = null;
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
    sequencerRef.current?.setStepIndex(nextStep % 16);
  };

  useEffect(() => {
    if (!sequencerRef.current || !synthRef.current) {
      return;
    }

    if (isRunning) {
      const totalSongSteps = Math.max(16, songBars * 16);
      const nextStep = ((Math.floor(playheadBars * 16) % totalSongSteps) + totalSongSteps) % totalSongSteps;
      songStepRef.current = nextStep;
      setActiveStep(nextStep % 16);

      synthRef.current.ensureContext();
      syncAutomationMixer(playheadSeconds);

      sequencerRef.current.setStepIndex(nextStep % 16);
      sequencerRef.current.setBpm(bpm);
      sequencerRef.current.start();
    } else {
      sequencerRef.current.stop();
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
    syncAudioPlayback(true, playheadSeconds);
    setIsRunning(true);
  };

  const handlePause = () => {
    syncAudioPlayback(false, playheadSeconds);
    setIsRunning(false);
  };

  const handleStop = () => {
    resumeAfterScrubRef.current = false;
    syncAudioPlayback(false, 0);
    setIsRunning(false);
    setPlayheadSeconds(0);
    setActiveStep(0);
    songStepRef.current = 0;
    sequencerRef.current?.stop();
    sequencerRef.current?.reset();
  };

  const handleBeginScrub = () => {
    resumeAfterScrubRef.current = isRunning;
    if (isRunning) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      lastTsRef.current = null;
      sequencerRef.current?.stop();
      syncAudioPlayback(false, playheadSeconds);
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
    setPlayheadSeconds(0);
    setActiveStep(0);
    songStepRef.current = 0;
    sequencerRef.current?.stop();
    sequencerRef.current?.reset();
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

    setTracks((prev) => {
      const trackNumber = prev.filter((track) => track.type === type).length + 1;
      return [...prev, createTrack(nextId, getDefaultTrackName(type, trackNumber), type, [], [], bpm)];
    });
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
              trackToDelete.bpm
            )
          ];

    tracksRef.current = nextTracks;
    setTracks(nextTracks);

    if (shouldResetSelection) {
      setSelectedClipId(null);
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

  return (
    <div className="app-root">
      <TransportBar
        bpm={bpm}
        isRunning={isRunning}
        playheadSeconds={playheadSeconds}
        onPlay={handlePlay}
        onPause={handlePause}
        onStop={handleStop}
        onBpmChange={setBpm}
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
        onAddAudioFiles={handleAddAudioFiles}
      />
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
                  : clip.name,
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
    </div>
  );
}
