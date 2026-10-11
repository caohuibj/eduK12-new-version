import { Navigate } from 'react-router-dom'
import { useAuthLinks } from '../components/app-shell/useAuthLinks'

/** Keep old bookmarks and role-safe return links on the unified entrance. */
export default function TrainingAuthRedirect({ to }: { to: '/login' | '/register' }) {
  const authLink = useAuthLinks()
  return <Navigate to={authLink(to)} replace />
}
