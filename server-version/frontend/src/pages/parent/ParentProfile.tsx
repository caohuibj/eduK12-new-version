import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { useAuth } from '../../contexts/AuthContext'
import {
  PageHeader,
  ProductButton,
  ProductPage,
  ProductStatus,
} from '../../components/product-ui'
import { parentError } from './useParentResource'
export default function ParentProfile() {
  const { user, setUser } = useAuth(),
    navigate = useNavigate(),
    [oldPassword, setOldPassword] = useState(''),
    [newPassword, setNewPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    lock = useRef(false),
    alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  return (
    <ProductPage width="reading">
      <PageHeader
        title="家长账户设置"
        description={user?.nickname || user?.username}
        actions={<Link to="/parent">返回家长首页</Link>}
      />
      {error && (
        <ProductStatus kind="error" title="密码未修改">
          {error}
        </ProductStatus>
      )}
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (lock.current) return
          setError('')
          if (newPassword !== confirm) {
            setError('两次新密码不一致')
            return
          }
          lock.current = true
          setBusy(true)
          try {
            const response = await authApi.changePassword(
              oldPassword,
              newPassword,
            )
            if (!alive.current) return
            if (response.code !== 0) throw new Error(response.message)
            setOldPassword('')
            setNewPassword('')
            setConfirm('')
            setUser(null)
            navigate('/parent/login?returnTo=%2Fparent%2Fprofile', {
              replace: true,
            })
          } catch (err) {
            setError(parentError(err))
          } finally {
            setBusy(false)
            lock.current = false
          }
        }}
      >
        <fieldset disabled={busy} className="space-y-4">
          <label className="block">
            当前密码
            <input
              className="input mt-1"
              type="password"
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
            />
          </label>
          <label className="block">
            新密码
            <input
              className="input mt-1"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          <p className="text-sm text-slate-600">至少8位，包含字母和数字。</p>
          <label className="block">
            再次输入新密码
            <input
              className="input mt-1"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </label>
          <ProductButton type="submit" variant="primary" disabled={busy}>
            {busy ? '正在修改…' : '修改密码'}
          </ProductButton>
        </fieldset>
      </form>
    </ProductPage>
  )
}
