import { createContext } from 'react'

export type FocusProgress = { completed: number; total?: number }
export const CognitiveFocusProgressContext = createContext<FocusProgress | undefined>(undefined)
