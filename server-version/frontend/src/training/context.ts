import type { Role } from '../components/app-shell/access'
import type { NavigationItem } from '../components/app-shell/navigation'

export const TRAINING_HOST = 'training.eduk12.top'

/**
 * The edition is a presentation context, never an authorization decision.
 * Exact host matching prevents a lookalike subdomain from silently acquiring
 * training navigation. The localhost alias is only available in Vite dev.
 */
export function isTrainingHost(
  hostname = typeof window === 'undefined' ? '' : window.location.hostname,
): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  return normalized === TRAINING_HOST || (import.meta.env.DEV && normalized === 'training.localhost')
}

/** Keep the training menu independent of the generic scientific/admin menu. */
export function trainingNavigation(role?: Role): NavigationItem[] {
  if (role === 'STUDENT') return [
    { path: '/student', label: '我的课程' },
    { path: '/student/profile', label: '我的账户', section: 'account' },
  ]
  if (role === 'TEACHER') return [
    { path: '/dashboard', label: '我的课程', aliases: ['/courses'], section: 'teaching' },
    { path: '/profile', label: '我的账户', section: 'account' },
  ]
  return []
}
