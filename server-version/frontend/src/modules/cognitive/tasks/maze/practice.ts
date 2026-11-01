import { generateMaze } from './generator'

/** C1.1 training only: 3×3 cannot equal a formal grid (schema minimum 5×5). */
export const generateMazePracticeV11 = (seed: string) =>
  generateMaze(`${seed}:practice-only-v1.1.0`, 0, 3, 3)
