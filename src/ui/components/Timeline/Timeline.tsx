import { useEffect, useRef, useState } from "react";
import "./timeline.css";
import type { AutomationPointModel } from "../../../model/types";
import { AutomationLane } from "./AutomationLane";
import { Clip } from "./Clip";
import { Grid } from "./Grid";

type TimelineClip = {
  id: string;
  trackId: string;
  kind: "drum" | "audio";
  startBar: number;
  lengthBars: number;
  label: string;
  patternId?: string;
};

type TimelineTrack = {
  id: string;
  name: string;
  type: "drum" | "audio";
  automationPoints: AutomationPointModel[];
  clips: TimelineClip[];
};

type TimelineProps = {
  bpm: number;
  gridResolution: number;
  snapEnabled: boolean;
  isRunning: boolean;
  playheadBars: number;
  songBars: number;
  tracks: TimelineTrack[];
  activeClipIds: string[];
  selectedClipId: string | null;
  onAddAutomationPoint: (trackId: string, bar: number, value: number) => void;
  onBeginAutomationChange: () => void;
  onDeleteAutomationPoint: (trackId: string, pointId: string) => void;
  onMoveAutomationPoint: (trackId: string, pointId: string, bar: number, value: number) => void;
  onSelectClip: (clipId: string) => void;
  onBeginClipChange: () => void;
  onMoveClip: (clipId: string, startBar: number) => void;
  onResizeClip: (clipId: string, startBar: number, lengthBars: number) => void;
  onDuplicateClip: (clipId: string) => void;
  onDeleteClip: (clipId: string) => void;
  onChangeClipPattern: (clipId: string, patternId: string) => void;
  onChangeClipTrack: (clipId: string, trackId: string) => void;
  onBeginScrub: () => void;
  onScrubPlayhead: (barPosition: number) => void;
  onEndScrub: (barPosition: number) => void;
  patternOptions: { id: string; name: string }[];
  trackOptions: { id: string; name: string; type: "drum" | "audio" }[];
};

const VISIBLE_BARS = 16;
const LABEL_WIDTH = 148;

export function Timeline({
  bpm,
  gridResolution,
  snapEnabled,
  isRunning,
  playheadBars,
  songBars,
  tracks,
  activeClipIds,
  selectedClipId,
  onAddAutomationPoint,
  onBeginAutomationChange,
  onDeleteAutomationPoint,
  onMoveAutomationPoint,
  onSelectClip,
  onBeginClipChange,
  onMoveClip,
  onResizeClip,
  onDuplicateClip,
  onDeleteClip,
  onChangeClipPattern,
  onChangeClipTrack,
  onBeginScrub,
  onScrubPlayhead,
  onEndScrub,
  patternOptions,
  trackOptions
}: TimelineProps) {
  const safeBars = Math.max(1, songBars);
  const loopedBars = ((playheadBars % safeBars) + safeBars) % safeBars;
  const playheadPercent = (loopedBars / safeBars) * 100;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const playheadDragRef = useRef<{
    pointerId: number;
    trackLeft: number;
    trackWidth: number;
  } | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    if (!viewportRef.current) return;

    const updateWidth = () => {
      if (!viewportRef.current) return;
      setViewportWidth(viewportRef.current.clientWidth);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewportRef.current);
    window.addEventListener("resize", updateWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  const visibleBars = VISIBLE_BARS;
  const laneViewportWidth = Math.max(320, viewportWidth - LABEL_WIDTH - 16);
  const barWidth = laneViewportWidth > 0 ? laneViewportWidth / visibleBars : 0;
  const laneWidth = Math.max(1, safeBars * barWidth);

  const getSnappedBarFromPointer = (clientX: number, trackLeft: number, trackWidth: number) => {
    if (trackWidth <= 0) {
      return 0;
    }

    const relativeX = Math.max(0, Math.min(trackWidth, clientX - trackLeft));
    const rawBar = (relativeX / trackWidth) * safeBars;
    const nextBar = snapEnabled
      ? Math.round(rawBar / gridResolution) * gridResolution
      : rawBar;
    const clampedBar = Math.max(0, Math.min(safeBars, nextBar));
    return clampedBar >= safeBars ? Math.max(0, safeBars - 0.001) : clampedBar;
  };

  const handlePlayheadPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const track = event.currentTarget.parentElement;
    if (!(track instanceof HTMLDivElement)) {
      return;
    }

    const rect = track.getBoundingClientRect();
    playheadDragRef.current = {
      pointerId: event.pointerId,
      trackLeft: rect.left,
      trackWidth: rect.width
    };

    onBeginScrub();
    onScrubPlayhead(getSnappedBarFromPointer(event.clientX, rect.left, rect.width));
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePlayheadPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = playheadDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    onScrubPlayhead(
      getSnappedBarFromPointer(event.clientX, dragState.trackLeft, dragState.trackWidth)
    );
  };

  const handlePlayheadPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = playheadDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const nextBar = getSnappedBarFromPointer(event.clientX, dragState.trackLeft, dragState.trackWidth);

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore capture release errors.
    }

    playheadDragRef.current = null;
    onEndScrub(nextBar);
  };

  return (
    <section className="timeline">
      <header className="timeline__header">
        <h2>Timeline</h2>
        <div className="timeline__controls">
          <span>{bpm} BPM</span>
          <span>{songBars} Bars</span>
          <span>{tracks.length} Tracks</span>
        </div>
      </header>
      <div className="timeline__scroll" ref={viewportRef}>
        <div className="timeline__rows">
          {tracks.map((track) => (
            <div className="timeline__row" key={track.id}>
              <div className="timeline__lane-meta">
                <strong>{track.name}</strong>
                <span>{track.type}</span>
              </div>
              <div className="timeline__lane-stack" style={{ width: laneWidth }}>
                <div
                  className="timeline__track"
                  style={{ width: "100%", ["--bar-width" as string]: `${barWidth}px` }}
                >
                  <Grid bars={safeBars} resolution={gridResolution} />
                  {track.clips.map((clip) => (
                    <Clip
                      key={clip.id}
                      kind={clip.kind}
                      label={clip.label}
                      startBars={clip.startBar}
                      lengthBars={clip.lengthBars}
                      durationBars={safeBars}
                      gridResolution={gridResolution}
                      snapEnabled={snapEnabled}
                      isActive={activeClipIds.includes(clip.id)}
                      isSelected={clip.id === selectedClipId}
                      trackWidth={laneWidth}
                      trackId={clip.trackId}
                      trackOptions={trackOptions
                        .filter((option) => option.type === clip.kind)
                        .map((option) => ({ id: option.id, name: option.name }))}
                      onSelect={() => onSelectClip(clip.id)}
                      onBeginChange={onBeginClipChange}
                      onMove={(startBar) => onMoveClip(clip.id, startBar)}
                      onResize={(startBar, lengthBars) => onResizeClip(clip.id, startBar, lengthBars)}
                      onDuplicate={() => onDuplicateClip(clip.id)}
                      onDelete={() => onDeleteClip(clip.id)}
                      patternId={clip.patternId}
                      patternOptions={patternOptions}
                      onChangePattern={
                        clip.patternId
                          ? (patternId) => onChangeClipPattern(clip.id, patternId)
                          : undefined
                      }
                      onChangeTrack={(trackId) => onChangeClipTrack(clip.id, trackId)}
                    />
                  ))}
                  {track.clips.length === 0 ? (
                    <div className="timeline__empty">No clips on this track</div>
                  ) : null}
                  <div
                    className={`timeline__playhead-hitbox ${isRunning ? "is-running" : ""}`}
                    style={{ left: `${playheadPercent}%` }}
                    onPointerDown={handlePlayheadPointerDown}
                    onPointerMove={handlePlayheadPointerMove}
                    onPointerUp={handlePlayheadPointerUp}
                    onPointerCancel={handlePlayheadPointerUp}
                  />
                  <div className="timeline__playhead" style={{ left: `${playheadPercent}%` }} />
                </div>
                <AutomationLane
                  gridResolution={gridResolution}
                  laneWidth={laneWidth}
                  points={track.automationPoints}
                  songBars={safeBars}
                  snapEnabled={snapEnabled}
                  onAddPoint={(bar, value) => onAddAutomationPoint(track.id, bar, value)}
                  onBeginChange={onBeginAutomationChange}
                  onDeletePoint={(pointId) => onDeleteAutomationPoint(track.id, pointId)}
                  onMovePoint={(pointId, bar, value) =>
                    onMoveAutomationPoint(track.id, pointId, bar, value)
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
