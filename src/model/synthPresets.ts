import type { SynthMode, SynthSettingsModel } from "./types";
import { createDefaultSynthSettings } from "./types";

export type SynthPresetCategory = "Init" | "Lead" | "Pad" | "Bass" | "Pluck";

export type SynthPresetDefinition = {
  category: SynthPresetCategory;
  id: string;
  name: string;
  settings: SynthSettingsModel;
};

const createPreset = (
  id: string,
  name: string,
  category: SynthPresetCategory,
  settings: Partial<SynthSettingsModel> & Pick<SynthSettingsModel, "oscillator">
): SynthPresetDefinition => ({
  id,
  name,
  category,
  settings: {
    ...createDefaultSynthSettings(),
    ...settings
  }
});

const withMode = (mode: SynthMode): Pick<SynthSettingsModel, "mode"> => ({ mode });

export const SYNTH_PRESETS: SynthPresetDefinition[] = [
  createPreset("init", "Reset to Init", "Init", {
    ...withMode("poly"),
    oscillator: "saw",
    attack: 0.02,
    decay: 0.15,
    sustain: 0.7,
    release: 0.18,
    filterCutoff: 6000,
    resonance: 1.2,
    glideEnabled: false,
    glideTimeMs: 90,
    detuneCents: 6,
    filterEnvelopeAmount: 2600,
    filterEnvelopeAttack: 0.01,
    filterEnvelopeDecay: 0.2,
    drive: 0.12
  }),
  createPreset("soft-lead", "Soft Lead", "Lead", {
    ...withMode("poly"),
    oscillator: "triangle",
    attack: 0.01,
    decay: 0.12,
    sustain: 0.68,
    release: 0.14,
    filterCutoff: 7200,
    resonance: 0.8,
    glideEnabled: false,
    glideTimeMs: 0,
    detuneCents: 3,
    filterEnvelopeAmount: 1800,
    filterEnvelopeAttack: 0.01,
    filterEnvelopeDecay: 0.18,
    drive: 0.08
  }),
  createPreset("warm-pad", "Warm Pad", "Pad", {
    ...withMode("poly"),
    oscillator: "sine",
    attack: 0.18,
    decay: 0.35,
    sustain: 0.82,
    release: 0.45,
    filterCutoff: 4800,
    resonance: 0.5,
    glideEnabled: false,
    glideTimeMs: 0,
    detuneCents: 5,
    filterEnvelopeAmount: 900,
    filterEnvelopeAttack: 0.08,
    filterEnvelopeDecay: 0.28,
    drive: 0.05
  }),
  createPreset("mono-bass", "Mono Bass", "Bass", {
    ...withMode("mono"),
    oscillator: "triangle",
    attack: 0,
    decay: 0.1,
    sustain: 0.72,
    release: 0.1,
    filterCutoff: 2600,
    resonance: 1,
    glideEnabled: true,
    glideTimeMs: 70,
    detuneCents: 1,
    filterEnvelopeAmount: 1200,
    filterEnvelopeAttack: 0,
    filterEnvelopeDecay: 0.12,
    drive: 0.14
  }),
  createPreset("bright-pluck", "Bright Pluck", "Pluck", {
    ...withMode("poly"),
    oscillator: "saw",
    attack: 0,
    decay: 0.08,
    sustain: 0.22,
    release: 0.09,
    filterCutoff: 6500,
    resonance: 1.4,
    glideEnabled: false,
    glideTimeMs: 0,
    detuneCents: 4,
    filterEnvelopeAmount: 3000,
    filterEnvelopeAttack: 0,
    filterEnvelopeDecay: 0.1,
    drive: 0.1
  }),
  createPreset("carlo5-lead", "Carlo5-style Lead", "Lead", {
    ...withMode("poly"),
    oscillator: "triangle",
    attack: 0.01,
    decay: 0.14,
    sustain: 0.64,
    release: 0.18,
    filterCutoff: 5400,
    resonance: 1.1,
    glideEnabled: true,
    glideTimeMs: 90,
    detuneCents: 6,
    filterEnvelopeAmount: 2200,
    filterEnvelopeAttack: 0.01,
    filterEnvelopeDecay: 0.2,
    drive: 0.12
  })
];

export const getSynthPresetById = (presetId: string): SynthPresetDefinition | null =>
  SYNTH_PRESETS.find((preset) => preset.id === presetId) ?? null;
