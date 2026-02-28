import { StepGrid } from "./StepGrid";
import "./drumMachine.css";

type DrumMachineProps = {
  editPattern: boolean[][];
  patterns: { id: string; name: string }[];
  onToggleStep: (rowIndex: number, stepIndex: number) => void;
  activeStep: number;
  selectedPatternId: string;
  onSelectPattern: (patternId: string) => void;
  onClonePattern: () => void;
};

const TRACKS = ["Kick", "Snare", "HiHat"] as const;

export function DrumMachine({
  editPattern,
  patterns,
  onToggleStep,
  activeStep,
  selectedPatternId,
  onSelectPattern,
  onClonePattern
}: DrumMachineProps) {
  return (
    <section className="drum-machine">
      <header className="drum-machine__header">
        <h2>Drum Machine</h2>
        <div className="drum-machine__patterns">
          {patterns.map((pattern) => (
            <button
              key={pattern.id}
              type="button"
              className={`pattern-btn ${
                selectedPatternId === pattern.id ? "pattern-btn--active" : ""
              }`}
              onClick={() => onSelectPattern(pattern.id)}
            >
              {pattern.name}
            </button>
          ))}
          <button type="button" className="pattern-btn" onClick={onClonePattern}>
            Clone
          </button>
        </div>
      </header>

      <div className="drum-machine__grid">
        {TRACKS.map((label, rowIndex) => (
          <StepGrid
            key={label}
            label={label}
            steps={editPattern[rowIndex]}
            activeStep={activeStep}
            onToggle={(stepIndex) => onToggleStep(rowIndex, stepIndex)}
          />
        ))}
      </div>
    </section>
  );
}
