// Clock for bpm -> time mapping and playhead (skeleton only).
export interface ClockOptions {
  bpm: number;
}

export class Clock {
  constructor(_options: ClockOptions) {
    // TODO: store BPM and state.
  }

  start(): void {
    // TODO: start timeline.
  }

  stop(): void {
    // TODO: stop timeline.
  }
}
