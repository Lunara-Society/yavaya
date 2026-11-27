import { createContext, useContext, type ReactNode } from 'react';
import { PALETTES, SYNAPSE, type NativeLook, type Palette } from './palettes';

/**
 * The look's colours for everything inside the native shell. Outside a
 * provider (tests, the Classic frame) it is Synapse, today's look.
 */
const PaletteContext = createContext<Palette>(SYNAPSE);

export function PaletteProvider({ look, children }: { look: NativeLook; children: ReactNode }) {
  return <PaletteContext.Provider value={PALETTES[look]}>{children}</PaletteContext.Provider>;
}

export function usePalette(): Palette {
  return useContext(PaletteContext);
}
