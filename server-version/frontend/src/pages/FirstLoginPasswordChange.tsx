import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Form, Input, message } from 'antd'
import { authApi } from '../api/auth'
import { useAuth } from '../contexts/AuthContext'
import { isValidPassword, passwordPolicyMessage } from '../utils/password'

const FirstLoginPasswordChange: React.FC = () => {
  const { user, setUser, logout } = useAuth()
  const navigate = useNavigate()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!oldPassword || !isValidPassword(newPassword) || newPassword !== confirmPassword) {
      message.error(newPassword !== confirmPassword ? '两次输入的新密码不一致' : passwordPolicyMessage)
      return
    }
    setSubmitting(true)
    try {
      await authApi.csrf()
      const response = await authApi.changePassword(oldPassword, newPassword)
      if (response.code !== 0) throw new Error(response.message || '密码修改失败')
      setUser(null)
      message.success('密码已修改，请使用新密码重新登录')
      const loginPath = user?.role === 'ADMIN'
        ? '/admin/login'
        : user?.role === 'TEACHER'
          ? '/teacher/account-login'
          : '/student/login'
      navigate(loginPath, { replace: true })
    } catch (error) {
      message.error(error instanceof Error ? error.message : '密码修改失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Card title="首次登录需要修改密码" style={{ width: 420, maxWidth: '100%' }}>
        <Alert type="warning" showIcon message="这是一次性临时密码，请先设置新密码后继续使用系统。" style={{ marginBottom: 20 }} />
        <Form layout="vertical" onFinish={submit}>
          <Form.Item label="临时密码" required>
            <Input.Password value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} autoComplete="current-password" />
          </Form.Item>
          <Form.Item label="新密码" required extra={passwordPolicyMessage}>
            <Input.Password value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
          </Form.Item>
          <Form.Item label="确认新密码" required>
            <Input.Password value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting} block>修改密码并重新登录</Button>
          <Button type="link" block onClick={() => { void logout(); navigate('/', { replace: true }) }}>退出</Button>
        </Form>
      </Card>
    </div>
  )
}

export default FirstLoginPasswordChange
