import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { SYNTH_PRESETS } from "../../../model/synthPresets";
import type { SynthClipModel, SynthSettingsModel, TrackModel } from "../../../model/types";
import "./synthEditor.css";

type SynthEditorProps = {
  track: TrackModel | null;
  clip: SynthClipModel | null;
  gridResolution: number;
  snapEnabled: boolean;
  playheadBars: number;
  isRunning: boolean;
  onBack: () => void;
  onBeginNoteChange: () => void;
  onAddNote: (clipId: string, pitch: number, startBar: number, lengthBars: number) => string;
  onMoveNote: (clipId: string, noteId: string, startBar: number, pitch: number) => void;
  onResizeNote: (clipId: string, noteId: string, startBar: number, lengthBars: number) => void;
  onDeleteNote: (clipId: string, noteId: string) => void;
  onStartPreviewNote: (trackId: string, pitch: number) => void;
  onStopPreviewNote: (trackId?: string) => void;
  onBeginSettingsChange: () => void;
  onApplyPreset: (trackId: string, presetId: string) => void;
  onChangeMode: (trackId: string, mode: TrackModel["synthSettings"]["mode"]) => void;
  onToggleSetting: (trackId: string, key: "glideEnabled") => void;
  onChangeOscillator: (
    trackId: string,
    oscillator: SynthSettingsModel["oscillator"]
  ) => void;
  onChangeSetting: (
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
  ) => void;
};

type DragState = {
  historyStarted: boolean;
  mode: "move" | "resize-right";
  noteId: string;
  noteLengthBars: number;
  notePitch: number;
  noteStartBar: number;
  pointerId: number;
  startX: number;
  startY: number;
};

const PITCHES = Array.from({ length: 25 }, (_, index) => 72 - index);
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const ROW_HEIGHT = 28;
const STEP_WIDTH = 30;
const NOTE_VISUAL_HEIGHT = ROW_HEIGHT - 10;
const NOTE_HANDLE_WIDTH = 16;
const NOTE_LENGTH_OPTIONS = [
  { label: "1/16", value: 1 / 16 },
  { label: "1/8", value: 1 / 8 },
  { label: "1/4", value: 1 / 4 },
  { label: "1/2", value: 1 / 2 },
  { label: "1 Bar", value: 1 }
] as const;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const getPitchLabel = (pitch: number): string => {
  const noteName = NOTE_NAMES[((pitch % 12) + 12) % 12];
  const octave = Math.floor(pitch / 12) - 1;
  return `${noteName}${octave}`;
};

export function SynthEditor({
  track,
  clip,
  gridResolution,
  snapEnabled,
  playheadBars,
  isRunning,
  onBack,
  onBeginNoteChange,
  onAddNote,
  onMoveNote,
  onResizeNote,
  onDeleteNote,
  onStartPreviewNote,
  onStopPreviewNote,
  onBeginSettingsChange,
  onApplyPreset,
  onChangeMode,
  onToggleSetting,
  onChangeOscillator,
  onChangeSetting
}: SynthEditorProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [noteLengthBars, setNoteLengthBars] = useState<number>(1 / 16);

  const sortedNotes = useMemo(
    () =>
      [...(clip?.notes ?? [])].sort(
        (left, right) => left.startBar - right.startBar || left.pitch - right.pitch
      ),
    [clip]
  );

  const activePresetId = useMemo(() => {
    if (!track) {
      return "custom";
    }

    const matchingPreset = SYNTH_PRESETS.find((preset) =>
      JSON.stringify(preset.settings) === JSON.stringify(track.synthSettings)
    );
    return matchingPreset?.id ?? "custom";
  }, [track]);

  useEffect(() => {
    if (!selectedNoteId) {
      return;
    }

    if (!sortedNotes.some((note) => note.id === selectedNoteId)) {
      setSelectedNoteId(null);
    }
  }, [selectedNoteId, sortedNotes]);

  useEffect(() => {
    if (!track || !clip) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedNoteId) {
        return;
      }

      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }

      event.preventDefault();
      onDeleteNote(clip.id, selectedNoteId);
      setSelectedNoteId(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [clip, onDeleteNote, selectedNoteId, track]);

  if (!track || !clip) {
    return (
      <section className="synth-editor">
        <header className="synth-editor__header">
          <button type="button" className="synth-editor__back" onClick={onBack}>
            Back
          </button>
          <div>
            <p className="synth-editor__eyebrow">Synth Editor</p>
            <h2>No Synth Clip Selected</h2>
          </div>
        </header>
      </section>
    );
  }

  const safeGridResolution = Math.max(1 / 16, gridResolution);
  const totalSteps = Math.max(1, Math.round(clip.lengthBars / safeGridResolution));
  const rollWidth = totalSteps * STEP_WIDTH;
  const activeLocalPlayhead = playheadBars - clip.startBar;
  const showPlayhead = isRunning && activeLocalPlayhead >= 0 && activeLocalPlayhead <= clip.lengthBars;

  const barsToPixels = (barValue: number): number => (barValue / safeGridResolution) * STEP_WIDTH;
  const pixelsToBars = (pixelValue: number): number => (pixelValue / STEP_WIDTH) * safeGridResolution;

  const snapBar = (barValue: number, allowFree = false): number => {
    if (!snapEnabled || allowFree) {
      return Math.round(barValue * 1000) / 1000;
    }
    return Math.round(barValue / safeGridResolution) * safeGridResolution;
  };

  const resolvePointerPosition = (clientX: number, clientY: number) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) {
      return { pitch: 60, startBar: 0 };
    }

    const relativeX = clamp(clientX - rect.left, 0, rect.width);
    const relativeY = clamp(clientY - rect.top, 0, rect.height - 1);
    const rawBars = pixelsToBars(relativeX);
    const nextStartBar = snapBar(rawBars);
    const rowIndex = clamp(Math.floor(relativeY / ROW_HEIGHT), 0, PITCHES.length - 1);

    return {
      pitch: PITCHES[rowIndex],
      startBar: clamp(nextStartBar, 0, Math.max(0, clip.lengthBars - noteLengthBars))
    };
  };

  const handleGridPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    if (
      event.target instanceof HTMLElement &&
      event.target.closest(".synth-editor__note-hitbox")
    ) {
      return;
    }

    const position = resolvePointerPosition(event.clientX, event.clientY);
    const nextNoteId = onAddNote(clip.id, position.pitch, position.startBar, noteLengthBars);
    setSelectedNoteId(nextNoteId);
  };

  const beginNoteDrag =
    (
      noteId: string,
      mode: "move" | "resize-right",
      noteStartBar: number,
      noteLengthBarsValue: number,
      notePitch: number
    ) =>
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }

      if (event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        onDeleteNote(clip.id, noteId);
        if (selectedNoteId === noteId) {
          setSelectedNoteId(null);
        }
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setSelectedNoteId(noteId);
      dragRef.current = {
        historyStarted: false,
        mode,
        noteId,
        noteLengthBars: noteLengthBarsValue,
        notePitch,
        noteStartBar,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    };

  const handleNoteDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaBars = snapBar(pixelsToBars(event.clientX - dragState.startX), event.altKey);
    const deltaPitch = Math.round((dragState.startY - event.clientY) / ROW_HEIGHT);

    if (dragState.mode === "move") {
      const nextStartBar = clamp(
        snapBar(dragState.noteStartBar + deltaBars),
        0,
        Math.max(0, clip.lengthBars - dragState.noteLengthBars)
      );
      const nextPitch = dragState.notePitch + deltaPitch;
      if (nextStartBar === dragState.noteStartBar && nextPitch === dragState.notePitch) {
        return;
      }
      if (!dragState.historyStarted && (nextStartBar !== dragState.noteStartBar || deltaPitch !== 0)) {
        onBeginNoteChange();
        dragState.historyStarted = true;
      }
      onMoveNote(clip.id, dragState.noteId, nextStartBar, nextPitch);
      return;
    }

    const nextLength = clamp(
      snapBar(dragState.noteLengthBars + deltaBars, event.altKey),
      Math.max(1 / 16, snapEnabled ? safeGridResolution : 1 / 16),
      clip.lengthBars - dragState.noteStartBar
    );
    if (nextLength === dragState.noteLengthBars) {
      return;
    }
    if (!dragState.historyStarted && nextLength !== dragState.noteLengthBars) {
      onBeginNoteChange();
      dragState.historyStarted = true;
    }
    onResizeNote(clip.id, dragState.noteId, dragState.noteStartBar, nextLength);
  };

  const endNoteDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore pointer capture release errors.
    }

    dragRef.current = null;
  };

  const handlePreviewPointerDown =
    (pitch: number) => (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onStartPreviewNote(track.id, pitch);
      event.currentTarget.setPointerCapture(event.pointerId);
    };

  const handlePreviewPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore pointer capture release errors.
    }

    onStopPreviewNote(track.id);
  };

  const handleNoteDeleteShortcut = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    noteId: string
  ) => {
    if (event.key !== "Delete" && event.key !== "Backspace") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onDeleteNote(clip.id, noteId);
    if (selectedNoteId === noteId) {
      setSelectedNoteId(null);
    }
  };

  return (
    <section className="synth-editor">
      <header className="synth-editor__header">
        <button type="button" className="synth-editor__back" onClick={onBack}>
          Back
        </button>
        <div>
          <p className="synth-editor__eyebrow">Synth Editor</p>
          <h2>{track.name}</h2>
          <span>{clip.lengthBars.toFixed(2)} bars clip</span>
        </div>
      </header>

      <section className="synth-editor__panel">
        <div className="synth-editor__group synth-editor__group--stack">
          <label>
            <span>Preset</span>
            <select value={activePresetId} onChange={(event) => onApplyPreset(track.id, event.target.value)}>
              <option value="custom" disabled>
                Custom
              </option>
              {SYNTH_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name} ({preset.category})
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Oscillator</span>
            <select
              value={track.synthSettings.oscillator}
              onPointerDown={onBeginSettingsChange}
              onChange={(event) =>
                onChangeOscillator(track.id, event.target.value as SynthSettingsModel["oscillator"])
              }
            >
              <option value="sine">Sine</option>
              <option value="saw">Saw</option>
              <option value="square">Square</option>
              <option value="triangle">Triangle</option>
            </select>
          </label>

          <label>
            <span>Mode</span>
            <select
              value={track.synthSettings.mode}
              onChange={(event) =>
                onChangeMode(track.id, event.target.value as TrackModel["synthSettings"]["mode"])
              }
            >
              <option value="poly">Poly</option>
              <option value="mono">Mono</option>
            </select>
          </label>

          <label className="synth-editor__toggle">
            <input
              type="checkbox"
              checked={track.synthSettings.glideEnabled}
              onPointerDown={onBeginSettingsChange}
              onChange={() => onToggleSetting(track.id, "glideEnabled")}
            />
            <span>Glide</span>
          </label>
        </div>

        <div className="synth-editor__sliders">
          {([
            ["attack", "Attack", track.synthSettings.attack, 0, 2, 0.01, false],
            ["decay", "Decay", track.synthSettings.decay, 0.01, 2, 0.01, false],
            ["sustain", "Sustain", track.synthSettings.sustain, 0, 1, 0.01, false],
            ["release", "Release", track.synthSettings.release, 0.01, 3, 0.01, false],
            ["filterCutoff", "Cutoff", track.synthSettings.filterCutoff, 200, 16000, 10, true],
            ["resonance", "Resonance", track.synthSettings.resonance, 0.1, 20, 0.1, false],
            ["glideTimeMs", "Glide ms", track.synthSettings.glideTimeMs, 0, 500, 1, false],
            ["detuneCents", "Detune", track.synthSettings.detuneCents, 0, 20, 0.1, false],
            [
              "filterEnvelopeAmount",
              "Filter Env",
              track.synthSettings.filterEnvelopeAmount,
              0,
              12000,
              10,
              true
            ],
            [
              "filterEnvelopeAttack",
              "Env Attack",
              track.synthSettings.filterEnvelopeAttack,
              0,
              1,
              0.01,
              false
            ],
            [
              "filterEnvelopeDecay",
              "Env Decay",
              track.synthSettings.filterEnvelopeDecay,
              0.01,
              2,
              0.01,
              false
            ],
            ["drive", "Drive", track.synthSettings.drive, 0, 1, 0.01, false]
          ] as const).map(([key, label, value, min, max, step, round]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onPointerDown={onBeginSettingsChange}
                onChange={(event) => onChangeSetting(track.id, key, Number(event.target.value))}
              />
              <strong>{round ? Math.round(value) : value.toFixed(2)}</strong>
            </label>
          ))}
        </div>
      </section>

      <section className="synth-editor__roll-shell">
        <header className="synth-editor__roll-header">
          <h3>Piano Roll</h3>
          <div className="synth-editor__roll-actions">
            <label className="synth-editor__length-select">
              <span>Note Length</span>
              <select
                value={String(noteLengthBars)}
                onChange={(event) => setNoteLengthBars(Number(event.target.value))}
              >
                {NOTE_LENGTH_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <span>{snapEnabled ? "Snap on" : "Snap off"} | Click pitch labels to preview</span>
          </div>
        </header>
        <div className="synth-editor__roll-frame">
          <div className="synth-editor__pitch-list">
            {PITCHES.map((pitch) => (
              <button
                key={pitch}
                type="button"
                className="synth-editor__pitch-cell"
                onPointerDown={handlePreviewPointerDown(pitch)}
                onPointerUp={handlePreviewPointerUp}
                onPointerCancel={handlePreviewPointerUp}
                onPointerLeave={(event) => {
                  if (event.buttons === 0) {
                    onStopPreviewNote(track.id);
                  }
                }}
                aria-label={`Preview ${getPitchLabel(pitch)}`}
              >
                {getPitchLabel(pitch)}
              </button>
            ))}
          </div>
          <div className="synth-editor__roll-scroll">
            <div
              ref={gridRef}
              className="synth-editor__roll"
              style={{
                width: rollWidth,
                height: PITCHES.length * ROW_HEIGHT,
                ["--step-width" as string]: `${STEP_WIDTH}px`,
                ["--row-height" as string]: `${ROW_HEIGHT}px`
              }}
              onPointerDown={handleGridPointerDown}
            >
              {PITCHES.map((pitch) => (
                <div key={pitch} className="synth-editor__pitch-row" />
              ))}
              {Array.from({ length: totalSteps + 1 }, (_, index) => (
                <div
                  key={index}
                  className={`synth-editor__grid-line ${
                    Math.abs((index * safeGridResolution) % 1) < 0.0001
                      ? "synth-editor__grid-line--bar"
                      : ""
                  }`}
                  style={{ left: index * STEP_WIDTH }}
                />
              ))}
              {showPlayhead ? (
                <div
                  className="synth-editor__playhead"
                  style={{ left: barsToPixels(activeLocalPlayhead) }}
                />
              ) : null}
              {sortedNotes.map((note) => {
                const rowIndex = PITCHES.findIndex((pitch) => pitch === note.pitch);
                if (rowIndex < 0) {
                  return null;
                }

                const noteLeft = barsToPixels(note.startBar);
                const noteWidth = Math.max(8, barsToPixels(note.lengthBars));
                const isSelected = note.id === selectedNoteId;

                return (
                  <div
                    key={note.id}
                    className={`synth-editor__note-hitbox ${
                      isSelected ? "synth-editor__note-hitbox--selected" : ""
                    }`}
                    style={{
                      left: noteLeft,
                      top: rowIndex * ROW_HEIGHT,
                      width: noteWidth,
                      height: ROW_HEIGHT
                    }}
                  >
                    <button
                      type="button"
                      className={`synth-editor__note ${isSelected ? "synth-editor__note--selected" : ""}`}
                      style={{
                        top: (ROW_HEIGHT - NOTE_VISUAL_HEIGHT) / 2,
                        height: NOTE_VISUAL_HEIGHT,
                        opacity: note.velocity
                      }}
                      onPointerDown={beginNoteDrag(
                        note.id,
                        "move",
                        note.startBar,
                        note.lengthBars,
                        note.pitch
                      )}
                      onPointerMove={handleNoteDrag}
                      onPointerUp={endNoteDrag}
                      onPointerCancel={endNoteDrag}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onDeleteNote(clip.id, note.id);
                        if (selectedNoteId === note.id) {
                          setSelectedNoteId(null);
                        }
                      }}
                      onKeyDown={(event) => handleNoteDeleteShortcut(event, note.id)}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedNoteId(note.id);
                      }}
                    >
                      <span className="synth-editor__note-label">{getPitchLabel(note.pitch)}</span>
                    </button>
                    <button
                      type="button"
                      className="synth-editor__note-handle"
                      style={{
                        width: Math.min(NOTE_HANDLE_WIDTH, Math.max(10, noteWidth))
                      }}
                      onPointerDown={beginNoteDrag(
                        note.id,
                        "resize-right",
                        note.startBar,
                        note.lengthBars,
                        note.pitch
                      )}
                      onPointerMove={handleNoteDrag}
                      onPointerUp={endNoteDrag}
                      onPointerCancel={endNoteDrag}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectedNoteId(note.id);
                      }}
                      aria-label="Resize note"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
