import React from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { VisualwmTask } from './VisualwmTask'

/** Engine 1.1.0 separates practice; formal stimuli, timing and scoring stay frozen. */
export const VisualwmTaskV11: React.FC<CognitiveTaskProps> = (props) => <VisualwmTask {...props} independentPractice />
