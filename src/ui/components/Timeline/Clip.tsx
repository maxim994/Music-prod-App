import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type ClipProps = {
  kind: "drum" | "audio";
  label: string;
  startBars: number;
  lengthBars: number;
  durationBars: number;
  isActive: boolean;
  isSelected: boolean;
  trackWidth: number;
  trackId: string;
  trackOptions: { id: string; name: string }[];
  onSelect: () => void;
  onMove: (startBar: number) => void;
  onResize: (startBar: number, lengthBars: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  patternId?: string;
  patternOptions: { id: string; name: string }[];
  onChangePattern?: (patternId: string) => void;
  onChangeTrack: (trackId: string) => void;
};

export function Clip({
  kind,
  label,
  startBars,
  lengthBars,
  durationBars,
  isActive,
  isSelected,
  trackWidth,
  trackId,
  trackOptions,
  onSelect,
  onMove,
  onResize,
  onDuplicate,
  onDelete,
  patternId,
  patternOptions,
  onChangePattern,
  onChangeTrack
}: ClipProps) {
  const safeBars = Math.max(1, durationBars);
  const left = Math.max(0, (startBars / safeBars) * 100);
  const width = Math.max(0, (lengthBars / safeBars) * 100);
  const clipRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    mode: "move" | "resize-left" | "resize-right";
    startX: number;
    startBar: number;
    lengthBars: number;
    barWidth: number;
    pointerId: number;
  } | null>(null);

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  const beginDrag = (
    event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>,
    mode: "move" | "resize-left" | "resize-right"
  ) => {
    if (trackWidth <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    const barWidth = trackWidth / safeBars;
    dragRef.current = {
      mode,
      startX: event.clientX,
      startBar: startBars,
      lengthBars,
      barWidth,
      pointerId: event.pointerId
    };
    clipRef.current?.setPointerCapture(event.pointerId);
  };

  const updateDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const { mode, startX, startBar, lengthBars: initialLength, barWidth } = dragRef.current;
    const deltaBars = Math.round((event.clientX - startX) / barWidth);

    if (mode === "move") {
      const nextStart = clamp(startBar + deltaBars, 0, safeBars - initialLength);
      onMove(nextStart);
      return;
    }

    if (mode === "resize-right") {
      const nextLength = clamp(initialLength + deltaBars, 1, safeBars - startBar);
      onResize(startBar, nextLength);
      return;
    }

    const nextStart = clamp(startBar + deltaBars, 0, startBar + initialLength - 1);
    const nextLength = clamp(initialLength - (nextStart - startBar), 1, safeBars - nextStart);
    onResize(nextStart, nextLength);
  };

  const endDrag = () => {
    if (!dragRef.current) return;
    try {
      clipRef.current?.releasePointerCapture(dragRef.current.pointerId);
    } catch {
      // Ignore release errors.
    }
    dragRef.current = null;
  };

  const isCompact = lengthBars <= 1;
  const canChangePattern = kind === "drum" && Boolean(onChangePattern) && Boolean(patternId);

  return (
    <div
      ref={clipRef}
      className={`clip clip--${kind} ${isActive ? "clip--active" : ""} ${isSelected ? "clip--selected" : ""}`}
      style={{ left: `${left}%`, width: `${width}%` }}
      onPointerDown={(event) => beginDrag(event, "move")}
      onPointerMove={updateDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {isSelected ? (
        <div
          className={`clip__toolbar ${isCompact ? "clip__toolbar--compact" : ""}`}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <select
            value={trackId}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => {
              event.stopPropagation();
              onChangeTrack(event.target.value);
            }}
            aria-label="Move clip to track"
          >
            {trackOptions.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name}
              </option>
            ))}
          </select>
          {canChangePattern ? (
            <select
              value={patternId}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => {
                event.stopPropagation();
                onChangePattern?.(event.target.value);
              }}
              aria-label="Change clip pattern"
            >
              {patternOptions.map((pattern) => (
                <option key={pattern.id} value={pattern.id}>
                  {pattern.name}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onDuplicate();
            }}
          >
            Duplicate
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className="clip__handle clip__handle--left"
        onPointerDown={(event) => beginDrag(event, "resize-left")}
        aria-label="Resize start"
      />
      <span className="clip__label">{label}</span>
      <button
        type="button"
        className="clip__handle clip__handle--right"
        onPointerDown={(event) => beginDrag(event, "resize-right")}
        aria-label="Resize end"
      />
    </div>
  );
}
