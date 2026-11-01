/** Maze shared generator (backend copy; identical mirror on the frontend).
 * Recursive backtracker maze generation + BFS optimal path.
 * Direction encoding: 0=up, 1=right, 2=down, 3=left.
 */

function xmur3(value: string): () => number {
  let hash = 1779033703 ^ value.length
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353)
    hash = (hash << 13) | (hash >>> 19)
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507)
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909)
    hash ^= hash >>> 16
    return hash >>> 0
  }
}

function mulberry32(seed: number): () => number {
  let value = seed | 0
  return () => {
    value = (value + 0x6d2b79f5) | 0
    let t = Math.imul(value ^ (value >>> 15), 1 | value)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const MAZE_DIRS: Array<{ dr: number; dc: number; wall: number; opp: number }> = [
  { dr: -1, dc: 0, wall: 0, opp: 2 },
  { dr: 0, dc: 1, wall: 1, opp: 3 },
  { dr: 1, dc: 0, wall: 2, opp: 0 },
  { dr: 0, dc: -1, wall: 3, opp: 1 },
]

export type MazeGrid = {
  cols: number
  rows: number
  walls: number[][] // per cell: bit 0=up wall, bit 1=right, bit 2=down, bit 3=left
  optimalPathLength: number
}

export const generateMaze = (seed: string, mazeIndex: number, cols: number, rows: number): MazeGrid => {
  const random = mulberry32(xmur3(`${seed}:maze:${mazeIndex}`)())
  const walls = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0b1111))
  const visited = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false))
  const stack: Array<[number, number]> = [[0, 0]]
  visited[0][0] = true

  while (stack.length > 0) {
    const [currentRow, currentCol] = stack[stack.length - 1]
    const unvisited: Array<[number, number, number, number]> = []
    for (const dir of MAZE_DIRS) {
      const nextRow = currentRow + dir.dr
      const nextCol = currentCol + dir.dc
      if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols && !visited[nextRow][nextCol]) {
        unvisited.push([nextRow, nextCol, dir.wall, dir.opp])
      }
    }
    if (unvisited.length > 0) {
      const [nextRow, nextCol, wall, opp] = unvisited[Math.floor(random() * unvisited.length)]
      walls[currentRow][currentCol] &= ~(1 << wall)
      walls[nextRow][nextCol] &= ~(1 << opp)
      visited[nextRow][nextCol] = true
      stack.push([nextRow, nextCol])
    } else {
      stack.pop()
    }
  }

  const optimalPathLength = bfsOptimalPath(walls, cols, rows)
  return { cols, rows, walls, optimalPathLength }
}

/** BFS from (0,0) to (rows-1, cols-1), returns optimal path length (number of moves). */
export const bfsOptimalPath = (walls: number[][], cols: number, rows: number): number => {
  const dist = Array.from({ length: rows }, () => Array.from({ length: cols }, () => -1))
  dist[0][0] = 0
  const queue: Array<[number, number]> = [[0, 0]]
  while (queue.length > 0) {
    const [r, c] = queue.shift() as [number, number]
    for (const dir of MAZE_DIRS) {
      const nr = r + dir.dr
      const nc = c + dir.dc
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && dist[nr][nc] === -1) {
        if ((walls[r][c] & (1 << dir.wall)) === 0) {
          dist[nr][nc] = dist[r][c] + 1
          queue.push([nr, nc])
        }
      }
    }
  }
  return dist[rows - 1][cols - 1]
}

/** Check if a move is legal (no wall blocking). */
export const isMoveLegal = (walls: number[][], row: number, col: number, direction: number): boolean => {
  const dir = MAZE_DIRS[direction]
  const nextRow = row + dir.dr
  const nextCol = col + dir.dc
  if (nextRow < 0 || nextRow >= walls.length || nextCol < 0 || nextCol >= walls[0].length) return false
  return (walls[row][col] & (1 << dir.wall)) === 0
}
