import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <div>
            <h3 className="text-lg font-medium">授权给教师</h3>
            <p className="text-sm text-gray-500 mt-1">{resourceName}</p>
          </div>
          <button onClick={onClose} aria-label="关闭">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          {loading ? (
            <p className="text-gray-500">加载中...</p>
          ) : teachers.length === 0 ? (
            <p className="text-gray-500">没有可授权的已审教师</p>
          ) : (
            <div className="space-y-2">
              {teachers.map((teacher) => (
                <label key={teacher.id} className="flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    checked={Boolean(selected[teacher.id])}
                    onChange={(e) => setSelected((current) => ({ ...current, [teacher.id]: e.target.checked }))}
                  />
                  {teacherLabel(teacher)}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t">
          <button onClick={onClose} className="btn-secondary">取消</button>
          <button onClick={() => void save()} disabled={loading || saving} className="btn-primary">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default MaterialGrantModal
