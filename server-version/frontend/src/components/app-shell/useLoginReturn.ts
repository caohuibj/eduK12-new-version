import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { returnAfterLogin } from './access'

// Wait for AuthContext's committed identity instead of guessing the role from the login page.
export function useLoginReturn(adminFallback?: string) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [submitted, setSubmitted] = useState(false)
  useEffect(() => {
    if (submitted && user) navigate(returnAfterLogin(params.get('returnTo'), user.role, adminFallback), { replace: true })
  }, [submitted, user, params, navigate, adminFallback])
  return () => setSubmitted(true)
}
