export interface ScaleDimensionScore {
  dimensionId: string
  dimensionCode: string | null
  dimensionName: string
  rawScore: number | null
  normalizedScore: number | null
  level: string | null
  levelName?: string
  itemCount: number | null
  minScore: number | null
  maxScore: number | null
}

export interface ScaleDimensionFeedback {
  dimensionId: string
  dimensionCode: string | null
  dimensionName: string
  score: number | null
  minScore: number | null
  maxScore: number | null
  level: string | null
  levelName?: string
  interpretation: string
  suggestions: string[]
}

export interface ScaleUnitReport {
  itemId?: string
  type: 'SCALE'
  kind: 'scale'
  scaleId: string
  scaleCode?: string | null
  label?: string | null
  scaleName: string
  dimensionScores: ScaleDimensionScore[]
  feedback: {
    overall: string
    dimensions: ScaleDimensionFeedback[]
    feedbackLevel?: string
  }
  caveats: string[]
  disclaimer: string
  completedAt: string | null
  totalTime: number | null
  method: {
    scaleId: string
    scaleCode: string | null
    reportDefinitionVersion: string
  }
  decryptError?: boolean
}

export interface FormBackgroundReport {
  itemId: string
  type: 'FORM'
  kind: 'background'
  label: string | null
  value: string | null
}

export interface CollectionQuestionnaireResponse {
  questionnaireId?: string
  questionnaireName: string
  completedAt: string | null
  totalTime: number | null
  totalDimensions: number
  backgroundValues: FormBackgroundReport[]
  unitReports: ScaleUnitReport[]
}
