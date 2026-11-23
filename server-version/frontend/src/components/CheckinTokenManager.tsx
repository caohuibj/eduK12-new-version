/**
 * 打卡令牌管理组件
 * 用于管理匿名打卡的访问令牌
 */

import React, { useState, useEffect } from 'react'
import { Link, Copy, Trash2, Clock, Users, CheckCircle, XCircle, Share2 } from 'lucide-react'
import { Modal, Button, Input, DatePicker, InputNumber, message, Switch, Tooltip } from 'antd'
import dayjs from 'dayjs'
import apiClient from '../api/client'

interface CheckinTokenManagerProps {
  checkinId: string
  checkinTitle: string
  allowAnonymous: boolean
  onAllowAnonymousChange?: (value: boolean) => void
  open?: boolean
  onOpenChange?: (value: boolean) => void
  showTrigger?: boolean
}

interface Token {
  id: string
  token: string
  expiresAt: string
  maxUses: number
  usedCount: number
  isActive: boolean
  createdAt: string
  creator: {
    id: string
    username: string
    nickname: string
  }
  _count?: {
    submissions: number
  }
}

const CheckinTokenManager: React.FC<CheckinTokenManagerProps> = ({
  checkinId,
  checkinTitle,
  allowAnonymous,
  onAllowAnonymousChange,
  open,
  onOpenChange,
  showTrigger = true,
}) => {
  const [internalOpen, setInternalOpen] = useState(false)
  const showModal = open ?? internalOpen
  const setShowModal = (value: boolean) => { if (open === undefined) setInternalOpen(value); onOpenChange?.(value) }
  const [tokens, setTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState(false)
  const [creatingToken, setCreatingToken] = useState(false)
  
  // 创建令牌表单
  const [expiresAt, setExpiresAt] = useState<dayjs.Dayjs | null>(dayjs().add(7, 'day'))
  const [maxUses, setMaxUses] = useState<number>(0)

  useEffect(() => {
    if (showModal) {
      fetchTokens()
    }
  }, [showModal])

  const fetchTokens = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get(`/checkins/${checkinId}/tokens`)
      if (response.code === 0) {
        setTokens(response.data)
      }
    } catch (error) {
      console.error('获取令牌列表失败:', error)
      message.error('获取令牌列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateToken = async () => {
    if (!expiresAt) {
      message.error('请选择过期时间')
      return
    }

    try {
      setCreatingToken(true)
      const response = await apiClient.post(`/checkins/${checkinId}/tokens`, {
        expiresAt: expiresAt.toISOString(),
        maxUses,
      })
      if (response.code === 0) {
        message.success('令牌创建成功')
        fetchTokens()
        // 重置表单
        setExpiresAt(dayjs().add(7, 'day'))
        setMaxUses(0)
      }
    } catch (error: any) {
      message.error(error.message || '创建令牌失败')
    } finally {
      setCreatingToken(false)
    }
  }

  const handleDeleteToken = async (tokenId: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除后，使用此令牌的链接将失效。是否继续？',
      okText: '删除',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          const response = await apiClient.delete(`/checkins/tokens/${tokenId}`)
          if (response.code === 0) {
            message.success('令牌已删除')
            fetchTokens()
          }
        } catch (error: any) {
          message.error(error.message || '删除令牌失败')
        }
      },
    })
  }

  const handleAllowAnonymousChange = async (checked: boolean) => {
    try {
      const response = await apiClient.put(`/checkins/${checkinId}/allow-anonymous`, {
        allowAnonymous: checked,
      })
      if (response.code === 0) {
        message.success(checked ? '已开启匿名打卡' : '已关闭匿名打卡')
        onAllowAnonymousChange?.(checked)
      }
    } catch (error: any) {
      message.error(error.message || '修改失败')
    }
  }

  const copyShareLink = (token: string) => {
    const link = `${window.location.origin}/public/checkin/${token}`
    navigator.clipboard.writeText(link)
    message.success('链接已复制到剪贴板')
  }

  const isTokenExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date()
  }

  const isTokenOverLimit = (maxUses: number, usedCount: number) => {
    return maxUses > 0 && usedCount >= maxUses
  }

  return (
    <>
      {showTrigger && <Tooltip title="管理匿名打卡链接">
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-blue-50 hover:text-blue-600"
          aria-label="管理匿名打卡链接"
        >
          <Share2 className="w-4 h-4" aria-hidden="true" />
        </button>
      </Tooltip>}

      <Modal
        title={`匿名打卡管理 - ${checkinTitle}`}
        open={showModal}
        onCancel={() => setShowModal(false)}
        footer={null}
        width={800}
        rootClassName="staff-ant-modal"
      >
        <div className="space-y-6">
          {/* 开启匿名打卡开关 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h4 className="font-medium text-gray-900">开启匿名打卡</h4>
                <p className="text-sm text-gray-500 mt-1">
                  开启后，可生成分享链接，允许学生无需登录即可打卡
                </p>
              </div>
              <Switch
                aria-label="开启匿名打卡"
                className="shrink-0"
                checked={allowAnonymous}
                onChange={handleAllowAnonymousChange}
                checkedChildren="开启"
                unCheckedChildren="关闭"
              />
            </div>
          </div>

          {allowAnonymous && (
            <>
              {/* 创建新令牌 */}
              <div className="border rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-4">创建新的分享链接</h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`checkin-token-expiry-${checkinId}`} className="block text-sm font-medium text-gray-700 mb-2">
                      过期时间
                    </label>
                    <DatePicker
                      id={`checkin-token-expiry-${checkinId}`}
                      value={expiresAt}
                      onChange={(date) => setExpiresAt(date)}
                      showTime
                      format="YYYY-MM-DD HH:mm"
                      className="w-full"
                      placeholder="选择过期时间"
                    />
                  </div>
                  <div>
                    <label htmlFor={`checkin-token-max-uses-${checkinId}`} className="block text-sm font-medium text-gray-700 mb-2">
                      最大匿名提交次数（0表示无限制）
                    </label>
                    <InputNumber
                      id={`checkin-token-max-uses-${checkinId}`}
                      value={maxUses}
                      onChange={(value) => setMaxUses(value || 0)}
                      min={0}
                      className="w-full"
                      placeholder="0"
                    />
                  </div>
                </div>
                <Button
                  type="primary"
                  onClick={handleCreateToken}
                  loading={creatingToken}
                  className="mt-4"
                >
                  创建链接
                </Button>
              </div>

              {/* 令牌列表 */}
              <div>
                <h4 className="font-medium text-gray-900 mb-4">已创建的分享链接</h4>
                {loading ? (
                  <div className="text-center py-8 text-gray-500">加载中...</div>
                ) : tokens.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">暂无分享链接</div>
                ) : (
                  <div className="space-y-3">
                    {tokens.map((token) => {
                      const expired = isTokenExpired(token.expiresAt)
                      const overLimit = isTokenOverLimit(token.maxUses, token.usedCount)
                      const isActive = token.isActive && !expired && !overLimit

                      return (
                        <div
                          key={token.id}
                          className={`border rounded-lg p-4 ${
                            !isActive ? 'bg-gray-50' : 'bg-white'
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <code className="max-w-full break-all rounded bg-gray-100 px-2 py-1 text-sm">
                                  {token.token.substring(0, 20)}...
                                </code>
                                <button
                                  onClick={() => copyShareLink(token.token)}
                                  aria-label="复制匿名打卡链接"
                                  title="复制匿名打卡链接"
                                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-gray-100"
                                >
                                  <Copy className="w-4 h-4 text-gray-600" />
                                </button>
                                {!isActive && (
                                  <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-600">
                                    {expired ? '已过期' : overLimit ? '已超限' : '已禁用'}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
                                <span className="flex items-center">
                                  <Clock className="w-4 h-4 mr-1" />
                                  {new Date(token.expiresAt).toLocaleString('zh-CN')}
                                </span>
                                <span className="flex items-center">
                                  <Users className="w-4 h-4 mr-1" />
                                  {token.usedCount} / {token.maxUses || '∞'} 次提交
                                </span>
                                <span className="flex items-center">
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  {token._count?.submissions || 0} 次提交
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteToken(token.id)}
                              aria-label="删除匿名打卡链接"
                              title="删除匿名打卡链接"
                              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  )
}

export default CheckinTokenManager
