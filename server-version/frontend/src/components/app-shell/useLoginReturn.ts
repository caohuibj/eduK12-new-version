import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { returnAfterLogin } from './access'

// Wait for AuthContext's committed identity instead of guessing the role from the login page.
export function useLoginReturn() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [submitted, setSubmitted] = useState(false)
  useEffect(() => {
    if (submitted && user) navigate(returnAfterLogin(params.get('returnTo'), user.role), { replace: true })
  }, [submitted, user, params, navigate])
  return () => setSubmitted(true)
}
