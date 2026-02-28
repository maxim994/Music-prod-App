import React, { createContext, useContext } from "react";
import type { AudioEngine } from "../../audio/AudioEngine";

// Context for the AudioEngine instance.
const AudioContext = createContext<AudioEngine | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  return <AudioContext.Provider value={null}>{children}</AudioContext.Provider>;
}

export function useAudioContext() {
  return useContext(AudioContext);
}
