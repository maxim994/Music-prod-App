import type { TrackModel } from "../../../model/types";
import "./trackList.css";
import { TrackRow } from "./TrackRow";

type TrackListProps = {
  tracks: TrackModel[];
  masterVolume: number;
  onTrackVolumeChange: (trackId: string, volume: number) => void;
  onToggleTrackMute: (trackId: string) => void;
  onToggleTrackSolo: (trackId: string) => void;
  onDeleteTrack: (trackId: string) => void;
  onMasterVolumeChange: (volume: number) => void;
  onAddTrack: (type: "drum" | "audio") => void;
};

export function TrackList({
  tracks,
  masterVolume,
  onTrackVolumeChange,
  onToggleTrackMute,
  onToggleTrackSolo,
  onDeleteTrack,
  onMasterVolumeChange,
  onAddTrack
}: TrackListProps) {
  return (
    <section className="track-list">
      <header className="track-list__header">
        <div>
          <p className="track-list__eyebrow">Mixer</p>
          <h2>Tracks</h2>
        </div>
        <div className="track-list__actions">
          <button type="button" onClick={() => onAddTrack("drum")}>
            Add Drum
          </button>
          <button type="button" onClick={() => onAddTrack("audio")}>
            Add Audio
          </button>
        </div>
      </header>

      <div className="track-list__master">
        <div className="track-list__master-meta">
          <div>
            <h3>Master</h3>
            <span>Global output</span>
          </div>
          <strong>{Math.round(masterVolume * 100)}%</strong>
        </div>
        <label className="track-list__master-slider">
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            onChange={(event) => onMasterVolumeChange(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="track-list__rows">
        {tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            onVolumeChange={onTrackVolumeChange}
            onToggleMute={onToggleTrackMute}
            onToggleSolo={onToggleTrackSolo}
            onDelete={onDeleteTrack}
          />
        ))}
      </div>
    </section>
  );
}
