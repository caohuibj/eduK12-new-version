import { createContext } from 'react'

export type FocusProgress = { completed: number; total?: number; label?: string }
export const CognitiveFocusProgressContext = createContext<FocusProgress | undefined>(undefined)
