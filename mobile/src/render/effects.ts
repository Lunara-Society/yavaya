import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';
import { SHADERS } from './shaders.ts';

/** Compiled once at start-up; null means this device could not compile it and the component falls back. */
function compile(src: string): SkRuntimeEffect | null {
  try {
    return Skia.RuntimeEffect.Make(src);
  } catch {
    return null;
  }
}

export const FX = {
  atmosphere: compile(SHADERS.ATMOSPHERE_SKSL),
  edge: compile(SHADERS.EDGE_SKSL),
  object: compile(SHADERS.OBJECT_SKSL),
  recon: compile(SHADERS.RECON_SKSL),
  awaken: compile(SHADERS.AWAKEN_SKSL),
  roxi: compile(SHADERS.ROXI_HOLO_SKSL),
  aetherGlass: compile(SHADERS.AETHER_GLASS_SKSL),
};
