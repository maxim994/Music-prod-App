import { useRef } from "react";
import type { TrackModel } from "../../../model/types";
import "./trackList.css";
import { TrackRow } from "./TrackRow";

type TrackListProps = {
  tracks: TrackModel[];
  masterVolume: number;
  onTrackVolumeChange: (trackId: string, volume: number) => void;
  onTrackBpmChange: (trackId: string, bpm: number) => void;
  onToggleTrackMute: (trackId: string) => void;
  onToggleTrackSolo: (trackId: string) => void;
  onDeleteTrack: (trackId: string) => void;
  onMasterVolumeChange: (volume: number) => void;
  onAddDrumTrack: () => void;
  onAddSynthTrack: () => void;
  onAddAudioFiles: (files: FileList) => void;
  onOpenSynthEditor: (trackId: string) => void;
};

export function TrackList({
  tracks,
  masterVolume,
  onTrackVolumeChange,
  onTrackBpmChange,
  onToggleTrackMute,
  onToggleTrackSolo,
  onDeleteTrack,
  onMasterVolumeChange,
  onAddDrumTrack,
  onAddSynthTrack,
  onAddAudioFiles,
  onOpenSynthEditor
}: TrackListProps) {
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <section className="track-list">
      <header className="track-list__header">
        <div>
          <p className="track-list__eyebrow">Mixer</p>
          <h2>Tracks</h2>
        </div>
        <div className="track-list__actions">
          <button type="button" onClick={onAddDrumTrack}>
            Add Drum
          </button>
          <button type="button" onClick={onAddSynthTrack}>
            Add Synth
          </button>
          <button
            type="button"
            onClick={() => {
              audioInputRef.current?.click();
            }}
          >
            Add Audio
          </button>
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*,.wav,.mp3,.ogg,.m4a,.aac,.flac"
            multiple
            hidden
            onChange={(event) => {
              const { files } = event.target;
              if (files && files.length > 0) {
                onAddAudioFiles(files);
              }
              event.target.value = "";
            }}
          />
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
            onBpmChange={onTrackBpmChange}
            onToggleMute={onToggleTrackMute}
            onToggleSolo={onToggleTrackSolo}
            onDelete={onDeleteTrack}
            onOpenSynthEditor={onOpenSynthEditor}
          />
        ))}
      </div>
    </section>
  );
}
