// Minimal step sequencer (16 steps, looped).
type StepCallback = (stepIndex: number) => void;

export type StepSequencerOptions = {
  bpm: number;
  steps?: number;
  onStep: StepCallback;
};

export class StepSequencer {
  private bpm: number;
  private steps: number;
  private onStep: StepCallback;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stepIndex = 0;

  constructor(options: StepSequencerOptions) {
    this.bpm = options.bpm;
    this.steps = options.steps ?? 16;
    this.onStep = options.onStep;
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
    if (this.timer) {
      this.stop();
      this.start();
    }
  }

  start(): void {
    if (this.timer) return;

    const stepMs = () => 60_000 / this.bpm / 4;

    const tick = () => {
      this.onStep(this.stepIndex);
      this.stepIndex = (this.stepIndex + 1) % this.steps;
    };

    tick();
    this.timer = setInterval(tick, stepMs());
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  reset(): void {
    this.stepIndex = 0;
  }

  setStepIndex(index: number): void {
    const normalized = ((Math.floor(index) % this.steps) + this.steps) % this.steps;
    this.stepIndex = normalized;
  }
}
