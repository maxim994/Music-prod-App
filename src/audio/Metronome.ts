// Timing click / metronome (minimal implementation).
export interface MetronomeOptions {
  bpm: number;
}

type TimerHandle = ReturnType<typeof setInterval> | null;

export class Metronome {
  private bpm: number;
  private audioContext: AudioContext | null = null;
  private timer: TimerHandle = null;

  constructor(options: MetronomeOptions) {
    this.bpm = options.bpm;
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
    if (this.timer) {
      this.stop();
      this.start();
    }
  }

  start(): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    // Must be called after user interaction.
    if (this.audioContext.state === "suspended") {
      void this.audioContext.resume();
    }

    if (this.timer) {
      return;
    }

    const intervalMs = () => (60_000 / this.bpm);

    this.timer = setInterval(() => {
      if (!this.audioContext) return;
      const ctx = this.audioContext;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "square";
      osc.frequency.value = 1200;

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.06);
    }, intervalMs());
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
