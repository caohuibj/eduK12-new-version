import React, { useEffect, useRef, useState } from 'react'
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

// A new resource must never inherit another resource's loaded selection.
const MaterialGrantModal: React.FC<MaterialGrantModalProps> = (props) => (
  <MaterialGrantEditor key={`${props.resourceType}:${props.resourceId}`} {...props} />
)

const MaterialGrantEditor: React.FC<MaterialGrantModalProps> = ({
  resourceType,
  resourceId,
  resourceName,
  onClose,
}) => {
  const [teachers, setTeachers] = useState<User[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const savePending = useRef(false)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        setLoading(true)
        setLoaded(false)
        setLoadError(null)
        const [teachersRes, grantsRes] = await Promise.all([
          materialGrantApi.listTeachers(),
          materialGrantApi.list({ resourceType, resourceId }),
        ])
        if (!active) return
        if (teachersRes.code !== 0) throw new Error(teachersRes.message || '加载教师名单失败')
        if (grantsRes.code !== 0) throw new Error(grantsRes.message || '加载已有授权失败')
        const users = teachersRes.data?.list
        const grantList = grantsRes.data?.list
        if (!Array.isArray(users) || !Array.isArray(grantList)
          || users.some(user => !user || typeof user.id !== 'string' || !user.id)
          || grantList.some(grant => !grant || typeof grant.teacherId !== 'string' || !grant.teacherId)
          || (teachersRes.data?.total != null && teachersRes.data.total !== users.length)) {
          throw new Error('授权名单不完整，请重新加载')
        }
        const teacherList = eligibleGrantTeachers(users)
        setTeachers(teacherList)
        const next: Record<string, boolean> = {}
        for (const grant of grantList) next[grant.teacherId] = true
        setSelected(next)
        setLoaded(true)
      } catch (err) {
        if (active) setLoadError((err as { message?: string })?.message || '加载授权名单失败')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [resourceType, resourceId, attempt])

  const close = () => {
    if (!savePending.current) onClose()
  }

  const save = async () => {
    if (!loaded || loading || savePending.current) return
    savePending.current = true
    const selectedIds = Object.entries(selected).filter(([, checked]) => checked).map(([id]) => id)
    try {
      setSaving(true)
      setError(null)
      const saved = await materialGrantApi.set({ resourceType, resourceId, teacherIds: selectedIds })
      if (!mounted.current) return
      if (saved.code !== 0) throw new Error(saved.message || '保存授权失败')
      onClose()
    } catch (err) {
      if (mounted.current) setError((err as { message?: string })?.message || '保存授权失败')
    } finally {
      savePending.current = false
      if (mounted.current) setSaving(false)
    }
  }

  return (
    <ManagementDialog
      open
      title="授权给教师"
      description={resourceName}
      onClose={close}
      closeDisabled={saving}
      width="compact"
      actions={(
        <>
          <ProductButton onClick={close} disabled={saving}>取消</ProductButton>
          <ProductButton variant="primary" onClick={() => void save()} disabled={!loaded || loading || saving}>
            {saving ? '保存中...' : '保存'}
          </ProductButton>
        </>
      )}
    >
      {error ? <p role="alert" className="mb-3 text-sm text-red-600">{error}</p> : null}
      {loadError ? (
        <div>
          <p role="alert" className="mb-3 text-sm text-red-600">{loadError}。读取成功前无法修改或保存授权。</p>
          <ProductButton onClick={() => setAttempt(value => value + 1)}>重新加载</ProductButton>
        </div>
      ) : loading ? (
        <p role="status" className="text-gray-500">加载中...</p>
      ) : teachers.length === 0 ? (
        <p className="text-gray-500">没有可授权的已审教师</p>
      ) : (
        <div className="staff-form">
          <fieldset className="grid gap-2" disabled={saving}>
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
