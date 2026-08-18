export interface Scale {
  id: string
  code: string
  name: string
  status: string
  _count?: {
    items: number
    dimensions: number
  }
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
