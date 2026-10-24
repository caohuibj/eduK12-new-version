import { createElement, type ComponentType } from 'react'
import type { CognitiveTaskProps } from './runner.types'

/** Download code only. Frozen identity, timing and scoring still belong to the
 * session. Preparation must finish before the controller starts any trial. */
export function deferredCognitiveRunner(load: () => Promise<ComponentType<CognitiveTaskProps>>) {
  let component: ComponentType<CognitiveTaskProps> | undefined
  let pending: Promise<ComponentType<CognitiveTaskProps>> | undefined
  const prepare = () => {
    if (component) return Promise.resolve(component)
    return pending ??= load().then(value => (component = value)).catch(error => {
      pending = undefined
      throw error
    })
  }
  const Runner = (props: CognitiveTaskProps) => {
    if (!component) throw new Error('Cognitive runner code has not been prepared')
    return createElement(component, props)
  }
  return Object.assign(Runner, { prepare })
}
