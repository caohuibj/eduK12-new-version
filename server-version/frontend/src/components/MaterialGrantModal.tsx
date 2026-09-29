import React, { useEffect, useState } from 'react'
import ManagementDialog from './staff-ui/ManagementDialog'
import { ProductButton } from './product-ui'
import {
  eligibleGrantTeachers,
  materialGrantApi,
  type MaterialResourceType,
} from '../api/materialGrants'
import type { User } from '../types'

const teacherLabel = (user: { username: string; nickname?: string | null }) =>
  user.nickname ? `${user.nickname}（${user.username}）` : user.username

interface MaterialGrantModalProps {
  resourceType: MaterialResourceType
  resourceId: string
  resourceName: string
  onClose: () => void
}

const MaterialGrantModal: React.FC<MaterialGrantModalProps> = ({
  resourceType,
  resourceId,
  resourceName,
  onClose,
}) => {
  const [teachers, setTeachers] = useState<User[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const [teachersRes, grantsRes] = await Promise.all([
          materialGrantApi.listTeachers(),
          materialGrantApi.list({ resourceType, resourceId }),
        ])
        const teacherList = teachersRes.code === 0 ? eligibleGrantTeachers(teachersRes.data?.list || []) : []
        const grantList = grantsRes.code === 0 ? (grantsRes.data?.list || []) : []
        setTeachers(teacherList)
        const next: Record<string, boolean> = {}
        for (const grant of grantList) next[grant.teacherId] = true
        setSelected(next)
      } catch (err) {
        setError((err as { message?: string }).message || '加载授权名单失败')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [resourceType, resourceId])

  const save = async () => {
    const selectedIds = Object.entries(selected).filter(([, checked]) => checked).map(([id]) => id)
    try {
      setSaving(true)
      setError(null)
      const saved = await materialGrantApi.set({ resourceType, resourceId, teacherIds: selectedIds })
      if (saved.code !== 0) throw new Error(saved.message || '保存授权失败')
      onClose()
    } catch (err) {
      setError((err as { message?: string }).message || '保存授权失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ManagementDialog
      open
      title="授权给教师"
      description={resourceName}
      onClose={onClose}
      width="compact"
      actions={(
        <>
          <ProductButton onClick={onClose}>取消</ProductButton>
          <ProductButton variant="primary" onClick={() => void save()} disabled={loading || saving}>
            {saving ? '保存中...' : '保存'}
          </ProductButton>
        </>
      )}
    >
      {error ? <p role="alert" className="mb-3 text-sm text-red-600">{error}</p> : null}
      {loading ? (
        <p className="text-gray-500">加载中...</p>
      ) : teachers.length === 0 ? (
        <p className="text-gray-500">没有可授权的已审教师</p>
      ) : (
        <div className="staff-form">
          <fieldset className="grid gap-2">
            <legend className="sr-only">选择授权教师</legend>
            {teachers.map((teacher) => (
              <label key={teacher.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={Boolean(selected[teacher.id])}
                  onChange={(e) => setSelected((current) => ({ ...current, [teacher.id]: e.target.checked }))}
                />
                <span>{teacherLabel(teacher)}</span>
              </label>
            ))}
          </fieldset>
        </div>
      )}
    </ManagementDialog>
  )
}

export default MaterialGrantModal
