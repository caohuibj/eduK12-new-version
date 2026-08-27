export interface Scale {
  id: string
  code: string
  name: string
  status: string
  definition?: {
    schemaVersion?: number
    items?: unknown[]
    scoring?: { scores?: Array<{ type?: string }> }
  } | null
}

export interface ScaleSelectorProps {
  scales: Scale[]
  selected: string[]
  onChange: (ids: string[]) => void
  loading?: boolean
}

export interface ScaleInfo {
  id: string
  name: string
  code: string
  items: number
  dimensions: number
}
