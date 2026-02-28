import "./transportBar.css";

type TransportBarProps = {
  bpm: number;
  isRunning: boolean;
  playheadSeconds: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onBpmChange: (bpm: number) => void;
  gridResolution: number;
  onGridResolutionChange: (resolution: number) => void;
  snapEnabled: boolean;
  onSnapEnabledChange: (enabled: boolean) => void;
  songBars: number;
  onSongBarsChange: (bars: number) => void;
  onUndo: () => void;
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
  gridResolution,
  onGridResolutionChange,
  snapEnabled,
  onSnapEnabledChange,
  songBars,
  onSongBarsChange,
  onUndo,
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

      <div className="transport-group transport-group--grid">
        <label className="transport-bpm">
          <span className="transport-label">Grid</span>
          <select
            value={String(gridResolution)}
            onChange={(event) => onGridResolutionChange(Number(event.target.value))}
          >
            <option value="1">1 Bar</option>
            <option value="0.5">1/2</option>
            <option value="0.25">1/4</option>
            <option value="0.125">1/8</option>
            <option value="0.0625">1/16</option>
          </select>
        </label>
      </div>

      <div className="transport-group transport-group--snap">
        <button
          type="button"
          className={`transport-btn ${snapEnabled ? "transport-btn--active" : ""}`}
          onClick={() => onSnapEnabledChange(!snapEnabled)}
        >
          {snapEnabled ? "Snap On" : "Snap Off"}
        </button>
      </div>

      <div className="transport-group transport-group--time">
        <div className="transport-time">
          {playheadSeconds.toFixed(2)}s
        </div>
      </div>

      <div className="transport-group transport-group--save">
        <button type="button" className="transport-btn" onClick={onUndo}>
          Undo
        </button>
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
