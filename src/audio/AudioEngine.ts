// Central audio engine entry point (skeleton only).
export interface AudioEngineOptions {
  sampleRate?: number;
}

export class AudioEngine {
  private options: AudioEngineOptions;

  constructor(options: AudioEngineOptions = {}) {
    this.options = options;
  }

  start(): void {
    // TODO: initialize AudioContext and graph.
  }

  stop(): void {
    // TODO: stop playback and dispose resources.
  }
}
