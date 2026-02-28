import "./transportBar.css";

type TransportBarProps = {
  bpm: number;
  isRunning: boolean;
  playheadSeconds: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onBpmChange: (bpm: number) => void;
  songBars: number;
  onSongBarsChange: (bars: number) => void;
  onSave: () => void;
  onLoad: () => void;
  onExportWav: () => void;
  isExporting: boolean;
  status?: string | null;
};

// Minimal transport UI (logic lives in App).
export function TransportBar({
  bpm,
  isRunning,
  playheadSeconds,
  onPlay,
  onPause,
  onStop,
  onBpmChange,
  songBars,
  onSongBarsChange,
  onSave,
  onLoad,
  onExportWav,
  isExporting,
  status
}: TransportBarProps) {
  return (
    <div className="transport-bar">
      <div className="transport-group transport-group--controls">
        <button
          type="button"
          className={`transport-btn transport-btn--play ${isRunning ? "is-active" : ""}`}
          onClick={onPlay}
        >
          Play
        </button>
        <button type="button" className="transport-btn" onClick={onPause}>
          Pause
        </button>
        <button type="button" className="transport-btn" onClick={onStop}>
          Stop
        </button>
      </div>

      <div className="transport-group transport-group--bpm">
        <label className="transport-bpm">
          <span className="transport-label">BPM</span>
          <input
            type="number"
            min={30}
            max={300}
            step={1}
            value={bpm}
            onChange={(event) => onBpmChange(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="transport-group transport-group--bars">
        <label className="transport-bpm">
          <span className="transport-label">Bars</span>
          <input
            type="number"
            min={1}
            step={1}
            value={songBars}
            onChange={(event) => onSongBarsChange(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="transport-group transport-group--time">
        <div className="transport-time">
          {playheadSeconds.toFixed(2)}s
        </div>
      </div>

      <div className="transport-group transport-group--save">
        <button type="button" className="transport-btn" onClick={onSave}>
          Save
        </button>
        <button type="button" className="transport-btn" onClick={onLoad}>
          Load
        </button>
        <button
          type="button"
          className="transport-btn transport-btn--export"
          onClick={onExportWav}
          disabled={isExporting}
        >
          {isExporting ? "Exporting..." : "Export WAV"}
        </button>
        {status ? <span className="transport-status">{status}</span> : null}
      </div>
    </div>
  );
}
