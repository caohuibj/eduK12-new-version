import { useSearchParams } from 'react-router-dom'
import { internalReturnTo } from './access'
export function useAuthLinks() {
  const [params] = useSearchParams()
  const target = internalReturnTo(params.get('returnTo'))
  return (path: string) => target ? `${path}${path.includes('?') ? '&' : '?'}returnTo=${encodeURIComponent(target)}` : path
}
