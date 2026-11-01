import { describe, expect, it } from 'vitest'
import { generateMaze, isMoveLegal, bfsOptimalPath } from '../generator'

describe('maze generator', () => {
  it('generates a valid perfect maze (all cells reachable)', () => {
    const maze = generateMaze('seed-1', 0, 7, 7)
    const visited = new Set<string>()
    const queue: Array<[number, number]> = [[0, 0]]
    visited.add('0,0')
    while (queue.length > 0) {
      const [r, c] = queue.shift() as [number, number]
      for (let d = 0; d < 4; d += 1) {
        const dr = [-1, 0, 1, 0][d]
        const dc = [0, 1, 0, -1][d]
        const nr = r + dr
        const nc = c + dc
        if (nr >= 0 && nr < 7 && nc >= 0 && nc < 7 && !visited.has(`${nr},${nc}`)) {
          if (isMoveLegal(maze.walls, r, c, d)) {
            visited.add(`${nr},${nc}`)
            queue.push([nr, nc])
          }
        }
      }
    }
    expect(visited.size).toBe(49)
  })

  it('produces a deterministic optimal path', () => {
    const maze = generateMaze('seed-1', 0, 7, 7)
    const path = bfsOptimalPath(maze.walls, 7, 7)
    expect(path).toBeGreaterThan(0)
    expect(bfsOptimalPath(maze.walls, 7, 7)).toBe(path)
  })

  it('differs across seeds', () => {
    const a = generateMaze('seed-a', 0, 7, 7)
    const b = generateMaze('seed-b', 0, 7, 7)
    expect(a.walls).not.toEqual(b.walls)
  })
})
