type StepGridProps = {
  label: string;
  steps: boolean[];
  activeStep: number;
  onToggle: (stepIndex: number) => void;
};

export function StepGrid({ label, steps, activeStep, onToggle }: StepGridProps) {
  return (
    <div className="step-grid">
      <div className="step-grid__label">{label}</div>
      <div className="step-grid__steps">
        {steps.map((isOn, index) => (
          <button
            key={`${label}-${index}`}
            type="button"
            className={[
              "step",
              isOn ? "step--on" : "step--off",
              activeStep === index ? "step--active" : ""
            ].join(" ")}
            onClick={() => onToggle(index)}
            aria-pressed={isOn}
          />
        ))}
      </div>
    </div>
  );
}
