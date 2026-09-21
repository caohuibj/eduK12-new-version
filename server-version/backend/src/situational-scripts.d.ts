declare module '*generate-situational-instruments.mjs' {
  export function discoverSources(root?: string): Array<{ relative: string; content: unknown; publication: unknown; scientific: unknown }>
  export function renderManifest(sources: Array<{ relative: string }>): string
}
