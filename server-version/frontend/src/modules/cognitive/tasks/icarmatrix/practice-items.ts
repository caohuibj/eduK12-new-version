/** Private, author-owned demonstration stimuli. Never score or sample as research items. */
const figure = (shape: string): string => {
  const paths: Record<string, string> = {
    circle: '<circle cx="40" cy="40" r="22" />',
    triangle: '<polygon points="40,14 66,63 14,63" />',
    square: '<rect x="18" y="18" width="44" height="44" />',
    diamond: '<polygon points="40,12 68,40 40,68 12,40" />',
    hexagon: '<polygon points="26,17 54,17 69,40 54,63 26,63 11,40" />',
    bar: '<rect x="12" y="29" width="56" height="22" />',
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" role="img"><g fill="none" stroke="#334155" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${paths[shape]}</g></svg>`
}

const [circle, triangle, square, diamond, hexagon, bar] =
  ['circle', 'triangle', 'square', 'diamond', 'hexagon', 'bar'].map(figure)
const responseShapes = [triangle, circle, square, diamond, hexagon, bar]

export const PRACTICE_MATRIX_ITEMS: Record<'2x2' | '3x3', {
  cells: string[]
  responses: Array<{ svg: string }>
  correctResponseIndex: number
}> = {
  '2x2': {
    // Each row repeats circle -> triangle.
    cells: [circle, triangle, circle],
    responses: responseShapes.map((svg) => ({ svg })),
    correctResponseIndex: 0,
  },
  '3x3': {
    // Each row repeats circle -> square -> triangle.
    cells: [circle, square, triangle, circle, square, triangle, circle, square],
    responses: responseShapes.map((svg) => ({ svg })),
    correctResponseIndex: 0,
  },
}
