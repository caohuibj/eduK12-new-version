import React, { useCallback, useEffect, useMemo, useState } from 'react'
import apiClient from '../api/client'

type FormItem = {
  id: string
  formLabel?: string | null
  label?: string | null
  formSectionId?: string | null
  sectionId?: string | null
  formSectionPosition?: number | null
  sectionPosition?: number | null
  contextKey?: string | null
}

type FormSection = {
  id: string
  title: string
  description?: string | null
  position: number
  contextSection: boolean
  items: FormItem[]
}

type ContentUnit = {
  type: 'scale' | 'cognitive' | 'form-section' | 'SCALE' | 'COGNITIVE' | 'FORM_SECTION'
  id: string
  position: number
  label: string
  itemCount: number
  contextSection: boolean
}

export interface FormSectionManagerProps {
  basePath: string
  readOnly?: boolean
  title?: string
}

const itemLabel = (item: FormItem): string => item.formLabel || item.label || item.id

/**
 * Small management surface shared by Questionnaire and Composite editors.
 * The server remains authoritative for section/content positions; this UI
 * only sends complete reorder lists and never mutates participant attempts.
 */
const FormSectionManager: React.FC<FormSectionManagerProps> = ({ basePath, readOnly = false, title = '表单区段' }) => {
  const [sections, setSections] = useState<FormSection[]>([])
  const [items, setItems] = useState<FormItem[]>([])
  const [units, setUnits] = useState<ContentUnit[]>([])
  const [newTitle, setNewTitle] = useState('新表单区段')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sectionResponse, itemResponse, contentResponse] = await Promise.all([
        apiClient.get<{ list: FormSection[] }>(`${basePath}/form-sections`),
        apiClient.get<{ list: FormItem[] }>(`${basePath}/form-items`),
        apiClient.get<{ units?: ContentUnit[] }>(`${basePath}/content`),
      ])
      if (sectionResponse.code !== 0) throw new Error(sectionResponse.message || '区段加载失败')
      if (itemResponse.code !== 0) throw new Error(itemResponse.message || '字段加载失败')
      setSections((sectionResponse.data?.list ?? []).slice().sort((left, right) => left.position - right.position))
      setItems(itemResponse.data?.list ?? [])
      setUnits((contentResponse?.code === 0 ? contentResponse.data?.units ?? [] : []).slice().sort((left, right) => left.position - right.position))
      setNotice(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '区段加载失败')
    } finally {
      setLoading(false)
    }
  }, [basePath])

  useEffect(() => { void load() }, [load])

  const unassigned = useMemo(
    () => items.filter((item) => !(item.formSectionId || item.sectionId)),
    [items],
  )

  const run = async (operation: () => Promise<{ code: number | string; message: string }>) => {
    setSaving(true)
    try {
      const response = await operation()
      if (response.code !== 0) throw new Error(response.message || '保存失败')
      await load()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const createSection = async () => {
    if (readOnly || !newTitle.trim()) return
    await run(() => apiClient.post(`${basePath}/form-sections`, { title: newTitle.trim() }))
  }

  const reorderUnits = async (nextUnits: ContentUnit[]) => {
    await run(() => apiClient.post(`${basePath}/content/reorder`, {
      units: nextUnits.map((unit, index) => ({
        type: unit.type,
        id: unit.id,
        position: index,
      })),
    }))
  }

  const moveUnit = async (index: number, delta: -1 | 1) => {
    if (readOnly) return
    const nextIndex = index + delta
    if (nextIndex < 0 || nextIndex >= units.length) return
    const next = units.slice()
    ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    await reorderUnits(next)
  }

  const moveSection = async (index: number, delta: -1 | 1) => {
    if (readOnly) return
    if (units.length > 0) {
      const unitIndex = units.findIndex((unit) => unit.id === sections[index]?.id)
      if (unitIndex >= 0) await moveUnit(unitIndex, delta)
      return
    }
    const nextIndex = index + delta
    if (nextIndex < 0 || nextIndex >= sections.length) return
    const ids = sections.map((section) => section.id)
    ;[ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]]
    await run(() => apiClient.post(`${basePath}/form-sections/reorder`, { sectionIds: ids }))
  }

  const moveItem = async (section: FormSection, index: number, delta: -1 | 1) => {
    if (readOnly) return
    const ordered = section.items.slice().sort((left, right) => (
      (left.formSectionPosition ?? left.sectionPosition ?? 0) - (right.formSectionPosition ?? right.sectionPosition ?? 0)
    ))
    const nextIndex = index + delta
    if (nextIndex < 0 || nextIndex >= ordered.length) return
    const ids = ordered.map((item) => item.id)
    ;[ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]]
    await run(() => apiClient.post(`${basePath}/form-sections/${section.id}/items/reorder`, { itemIds: ids }))
  }

  return (
    <section className="mt-6 rounded-lg border border-indigo-100 bg-indigo-50/40 p-4" aria-label={title}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-600">每个区段是一次提交单元，字段只在区段内排序。</p>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} className="rounded border px-2 py-1 text-sm" aria-label="新区段名称" />
            <button type="button" onClick={() => void createSection()} disabled={saving} className="btn-secondary">新增区段</button>
          </div>
        )}
      </div>
      {notice && <p role="alert" className="mb-3 text-sm text-red-600">{notice}</p>}
      {loading ? <p className="text-sm text-gray-500">加载区段中...</p> : (
        <div className="space-y-3">
          {units.length > 0 && (
            <div className="rounded border border-indigo-100 bg-white p-3">
              <h3 className="text-sm font-medium text-gray-800">统一内容顺序</h3>
              <p className="mt-1 text-xs text-gray-500">量表、认知任务和表单区段都是一个内容单元；表单字段只在区段内排序。</p>
              <ol className="mt-2 space-y-1 text-sm text-gray-700">
                {units.map((unit, index) => (
                  <li key={`${unit.type}:${unit.id}`} className="flex items-center justify-between gap-2 rounded bg-gray-50 px-2 py-1.5">
                    <span>
                      <span className="mr-2 text-xs text-gray-400">{index + 1}.</span>
                      {unit.label}
                      <span className="ml-2 text-xs text-gray-400">
                        {unit.type.toLowerCase().replace(/_/g, '-') === 'form-section' ? `表单区段 · ${unit.itemCount} 个字段` : unit.type.toLowerCase() === 'cognitive' ? '认知任务' : '心理量表'}
                      </span>
                    </span>
                    {!readOnly && (
                      <span className="flex gap-1">
                        <button type="button" onClick={() => void moveUnit(index, -1)} disabled={saving || index === 0} className="rounded border px-1.5 py-0.5 text-xs">上移</button>
                        <button type="button" onClick={() => void moveUnit(index, 1)} disabled={saving || index === units.length - 1} className="rounded border px-1.5 py-0.5 text-xs">下移</button>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {sections.map((section, sectionIndex) => {
            const orderedItems = section.items.slice().sort((left, right) => (
              (left.formSectionPosition ?? left.sectionPosition ?? 0) - (right.formSectionPosition ?? right.sectionPosition ?? 0)
            ))
            return (
              <div key={section.id} className="rounded border bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    defaultValue={section.title}
                    onBlur={(event) => {
                      const value = event.target.value.trim()
                      if (!readOnly && value && value !== section.title) void run(() => apiClient.put(`${basePath}/form-sections/${section.id}`, { title: value }))
                    }}
                    disabled={readOnly || saving}
                    className="min-w-48 flex-1 rounded border px-2 py-1 font-medium"
                    aria-label={`区段 ${sectionIndex + 1} 名称`}
                  />
                  {units.length === 0 && <>
                    <button type="button" onClick={() => void moveSection(sectionIndex, -1)} disabled={readOnly || saving || sectionIndex === 0} className="rounded border px-2 py-1 text-sm">上移</button>
                    <button type="button" onClick={() => void moveSection(sectionIndex, 1)} disabled={readOnly || saving || sectionIndex === sections.length - 1} className="rounded border px-2 py-1 text-sm">下移</button>
                  </>}
                  <label className="flex items-center gap-1 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={section.contextSection}
                      disabled={readOnly || saving || !section.items.some((item) => item.contextKey)}
                      onChange={(event) => void run(() => apiClient.put(`${basePath}/form-sections/${section.id}`, { contextSection: event.target.checked }))}
                    />
                    首个上下文区段
                  </label>
                </div>
                {section.description && <p className="mt-1 text-xs text-gray-500">{section.description}</p>}
                <ol className="mt-2 space-y-1 pl-5 text-sm text-gray-700">
                  {orderedItems.map((item, itemIndex) => (
                    <li key={item.id} className="flex items-center justify-between gap-2">
                      <span>{itemLabel(item)}{item.contextKey ? ` · ${item.contextKey}` : ''}</span>
                      <span className="flex gap-1">
                        <button type="button" onClick={() => void moveItem(section, itemIndex, -1)} disabled={readOnly || saving || itemIndex === 0} className="rounded border px-1.5 py-0.5 text-xs">上</button>
                        <button type="button" onClick={() => void moveItem(section, itemIndex, 1)} disabled={readOnly || saving || itemIndex === orderedItems.length - 1} className="rounded border px-1.5 py-0.5 text-xs">下</button>
                      </span>
                    </li>
                  ))}
                </ol>
                {!readOnly && unassigned.length > 0 && (
                  <select
                    value=""
                    onChange={(event) => {
                      if (event.target.value) void run(() => apiClient.post(`${basePath}/form-sections/${section.id}/items/${event.target.value}`, {}))
                    }}
                    disabled={saving}
                    className="mt-2 rounded border px-2 py-1 text-sm"
                    aria-label={`向${section.title}添加字段`}
                  >
                    <option value="">添加未分配字段...</option>
                    {unassigned.map((item) => <option key={item.id} value={item.id}>{itemLabel(item)}</option>)}
                  </select>
                )}
              </div>
            )
          })}
          {sections.length === 0 && <p className="text-sm text-gray-500">尚未创建区段。保存第一个区段后，表单字段会按区段提交。</p>}
        </div>
      )}
    </section>
  )
}

export default FormSectionManager
