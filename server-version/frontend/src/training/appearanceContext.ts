import { createContext, useContext } from 'react'
import type { TrainingAppearance } from './appearance'
type AppearanceContext = {
  enabled: boolean
  mode: TrainingAppearance
  theme: 'light' | 'dark'
  storageError: boolean
  select: (mode: TrainingAppearance) => void
}
export const Appearance = createContext<AppearanceContext>({ enabled: false, mode: 'light', theme: 'light', storageError: false, select: () => {} })
export function useTrainingAppearance() { return useContext(Appearance) }
