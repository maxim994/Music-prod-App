import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { AutomationPointModel } from "../../../model/types";
import { Grid } from "./Grid";

type AutomationLaneProps = {
  gridResolution: number;
  laneWidth: number;
  points: AutomationPointModel[];
  songBars: number;
  snapEnabled: boolean;
  onAddPoint: (bar: number, value: number) => void;
  onBeginChange: () => void;
  onDeletePoint: (pointId: string) => void;
  onMovePoint: (pointId: string, bar: number, value: number) => void;
};

const POINT_RADIUS = 6;

export function AutomationLane({
  gridResolution,
  laneWidth,
  points,
  songBars,
  snapEnabled,
  onAddPoint,
  onBeginChange,
  onDeletePoint,
  onMovePoint
}: AutomationLaneProps) {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    laneHeight: number;
    laneLeft: number;
    laneTop: number;
    laneWidth: number;
    pointId: string;
    pointerId: number;
  } | null>(null);
  const safeSongBars = Math.max(1, songBars);
  const sortedPoints = [...points].sort((left, right) => left.bar - right.bar);
  const linePoints = sortedPoints
    .map((point) => {
      const x = (point.bar / safeSongBars) * laneWidth;
      const y = (1 - point.value) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  const getPointFromPointer = (
    clientX: number,
    clientY: number,
    laneLeft: number,
    laneTop: number,
    width: number,
    height: number
  ) => {
    const relativeX = Math.max(0, Math.min(width, clientX - laneLeft));
    const relativeY = Math.max(0, Math.min(height, clientY - laneTop));
    const rawBar = (relativeX / Math.max(1, width)) * safeSongBars;
    const nextBar = snapEnabled
      ? Math.round(rawBar / gridResolution) * gridResolution
      : Math.round(rawBar * 1000) / 1000;
    const bar = Math.max(0, Math.min(safeSongBars, nextBar));
    const value = Math.max(0, Math.min(1, 1 - relativeY / Math.max(1, height)));

    return {
      bar,
      value
    };
  };

  const handleLanePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) {
      return;
    }

    const lane = laneRef.current;
    if (!lane) {
      return;
    }

    const rect = lane.getBoundingClientRect();
    const nextPoint = getPointFromPointer(
      event.clientX,
      event.clientY,
      rect.left,
      rect.top,
      rect.width,
      rect.height
    );
    onAddPoint(nextPoint.bar, nextPoint.value);
  };

  const handlePointPointerDown =
    (pointId: string) => (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }

      const lane = laneRef.current;
      if (!lane) {
        return;
      }

      const rect = lane.getBoundingClientRect();
      dragRef.current = {
        laneHeight: rect.height,
        laneLeft: rect.left,
        laneTop: rect.top,
        laneWidth: rect.width,
        pointId,
        pointerId: event.pointerId
      };

      onBeginChange();
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
    };

  const handlePointPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const nextPoint = getPointFromPointer(
      event.clientX,
      event.clientY,
      dragState.laneLeft,
      dragState.laneTop,
      dragState.laneWidth,
      dragState.laneHeight
    );
    onMovePoint(dragState.pointId, nextPoint.bar, nextPoint.value);
  };

  const handlePointPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore capture release errors.
    }

    dragRef.current = null;
  };

  return (
    <div
      ref={laneRef}
      className="timeline__automation"
      style={{ width: laneWidth, ["--bar-width" as string]: `${laneWidth / safeSongBars}px` }}
      onPointerDown={handleLanePointerDown}
    >
      <Grid bars={safeSongBars} resolution={gridResolution} showLabels={false} />
      <div className="timeline__automation-label">Volume</div>
      <svg className="timeline__automation-curve" viewBox={`0 0 ${laneWidth} 100`} preserveAspectRatio="none">
        {sortedPoints.length > 1 ? (
          <polyline className="timeline__automation-line" points={linePoints} />
        ) : null}
      </svg>
      {sortedPoints.map((point) => (
        <button
          key={point.id}
          type="button"
          className="timeline__automation-point"
          style={{
            left: `${(point.bar / safeSongBars) * 100}%`,
            top: `${(1 - point.value) * 100}%`,
            marginLeft: -POINT_RADIUS,
            marginTop: -POINT_RADIUS
          }}
          onPointerDown={handlePointPointerDown(point.id)}
          onPointerMove={handlePointPointerMove}
          onPointerUp={handlePointPointerUp}
          onPointerCancel={handlePointPointerUp}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDeletePoint(point.id);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDeletePoint(point.id);
          }}
          aria-label="Automation point"
        />
      ))}
    </div>
  );
}
