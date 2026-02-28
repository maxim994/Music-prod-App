import { useEffect, useRef, useState } from "react";
import "./timeline.css";
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
  clips: TimelineClip[];
};

type TimelineProps = {
  bpm: number;
  playheadBars: number;
  songBars: number;
  tracks: TimelineTrack[];
  activeClipIds: string[];
  selectedClipId: string | null;
  onSelectClip: (clipId: string) => void;
  onMoveClip: (clipId: string, startBar: number) => void;
  onResizeClip: (clipId: string, startBar: number, lengthBars: number) => void;
  onDuplicateClip: (clipId: string) => void;
  onDeleteClip: (clipId: string) => void;
  onChangeClipPattern: (clipId: string, patternId: string) => void;
  onChangeClipTrack: (clipId: string, trackId: string) => void;
  patternOptions: { id: string; name: string }[];
  trackOptions: { id: string; name: string; type: "drum" | "audio" }[];
};

const VISIBLE_BARS = 16;
const LABEL_WIDTH = 148;

export function Timeline({
  bpm,
  playheadBars,
  songBars,
  tracks,
  activeClipIds,
  selectedClipId,
  onSelectClip,
  onMoveClip,
  onResizeClip,
  onDuplicateClip,
  onDeleteClip,
  onChangeClipPattern,
  onChangeClipTrack,
  patternOptions,
  trackOptions
}: TimelineProps) {
  const safeBars = Math.max(1, songBars);
  const loopedBars = playheadBars % safeBars;
  const playheadPercent = (loopedBars / safeBars) * 100;
  const viewportRef = useRef<HTMLDivElement | null>(null);
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
              <div
                className="timeline__track"
                style={{ width: laneWidth, ["--bar-width" as string]: `${barWidth}px` }}
              >
                <Grid bars={safeBars} />
                {track.clips.map((clip) => (
                  <Clip
                    key={clip.id}
                    kind={clip.kind}
                    label={clip.label}
                    startBars={clip.startBar}
                    lengthBars={clip.lengthBars}
                    durationBars={safeBars}
                    isActive={activeClipIds.includes(clip.id)}
                    isSelected={clip.id === selectedClipId}
                    trackWidth={laneWidth}
                    trackId={clip.trackId}
                    trackOptions={trackOptions
                      .filter((option) => option.type === clip.kind)
                      .map((option) => ({ id: option.id, name: option.name }))}
                    onSelect={() => onSelectClip(clip.id)}
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
                <div className="timeline__playhead" style={{ left: `${playheadPercent}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
