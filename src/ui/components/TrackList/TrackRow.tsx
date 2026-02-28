import type { TrackModel } from "../../../model/types";

type TrackRowProps = {
  track: TrackModel;
  onVolumeChange: (trackId: string, volume: number) => void;
  onBpmChange: (trackId: string, bpm: number) => void;
  onToggleMute: (trackId: string) => void;
  onToggleSolo: (trackId: string) => void;
  onDelete: (trackId: string) => void;
};

export function TrackRow({
  track,
  onVolumeChange,
  onBpmChange,
  onToggleMute,
  onToggleSolo,
  onDelete
}: TrackRowProps) {
  return (
    <article className="track-row">
      <div className="track-row__meta">
        <div>
          <h3>{track.name}</h3>
          <span>{track.type}</span>
        </div>
        <strong>{Math.round(track.volume * 100)}%</strong>
      </div>

      <div className="track-row__controls">
        <label className="track-row__slider">
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={track.volume}
            onChange={(event) => onVolumeChange(track.id, Number(event.target.value))}
          />
        </label>

        <label className="track-row__tempo">
          <span>BPM</span>
          <input
            type="number"
            min={30}
            max={300}
            step={1}
            value={track.bpm}
            onChange={(event) => onBpmChange(track.id, Number(event.target.value))}
          />
        </label>
      </div>

      <div className="track-row__buttons">
        <button
          type="button"
          className={`track-row__button ${track.muted ? "track-row__button--active" : ""}`}
          onClick={() => onToggleMute(track.id)}
        >
          Mute
        </button>
        <button
          type="button"
          className={`track-row__button ${track.solo ? "track-row__button--active" : ""}`}
          onClick={() => onToggleSolo(track.id)}
        >
          Solo
        </button>
        <button
          type="button"
          className="track-row__button track-row__button--danger"
          onClick={() => onDelete(track.id)}
        >
          Delete
        </button>
      </div>
    </article>
  );
}
