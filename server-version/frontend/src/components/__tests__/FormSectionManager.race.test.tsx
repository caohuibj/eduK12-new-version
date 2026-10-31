import React from 'react'
import { it, expect, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import FormSectionManager from '../FormSectionManager'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../api/client', () => ({ default: { get, post: vi.fn() } }))

it('keeps B content when A responses arrive after the reused manager switches resource', async () => {
  const pending = new Map<string, (value: unknown) => void>()
  get.mockImplementation((path: string) => new Promise(resolve => pending.set(path, resolve)))
  const view = render(<FormSectionManager basePath="/composite-assessments/A" />)
  view.rerender(<FormSectionManager basePath="/composite-assessments/B" />)
  const finish = async (id: string) => {
    await act(async () => {
      pending.get(`/composite-assessments/${id}/form-sections`)?.({ code: 0, data: { list: [] } })
      pending.get(`/composite-assessments/${id}/content`)?.({ code: 0, data: { units: [
        { id: `${id}-unit`, type: 'scale', position: 0, label: `${id} exclusive scale`, itemCount: 1, contextSection: false },
      ] } })
    })
  }
  expect(get).toHaveBeenCalledTimes(4)
  await finish('B')
  expect(screen.getByText('B exclusive scale')).toBeInTheDocument()
  await finish('A')
  console.info('final visible units', { A: Boolean(screen.queryByText('A exclusive scale')), B: Boolean(screen.queryByText('B exclusive scale')) })
  expect(screen.queryByText('A exclusive scale')).not.toBeInTheDocument()
  expect(screen.getByText('B exclusive scale')).toBeInTheDocument()
})

it('ignores an older refresh failure without clearing the newer loading state', async () => {
  const pending: Array<{ resolve: (value: unknown) => void; reject: (reason: unknown) => void }> = []
  get.mockReset()
  get.mockImplementation(() => new Promise((resolve, reject) => pending.push({ resolve, reject })))
  const view = render(<FormSectionManager basePath="/composite-assessments/A" refreshKey={0} />)
  view.rerender(<FormSectionManager basePath="/composite-assessments/A" refreshKey={1} />)
  expect(get).toHaveBeenCalledTimes(4)
  await act(async () => {
    pending[0].reject(new Error('obsolete request failed'))
    pending[1].resolve({ code: 0, data: { units: [] } })
  })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByText('加载区段中...')).toBeInTheDocument()
  await act(async () => {
    pending[2].resolve({ code: 0, data: { list: [] } })
    pending[3].resolve({ code: 0, data: { units: [
      { id: 'fresh', type: 'scale', position: 0, label: 'Fresh current scale', itemCount: 1, contextSection: false },
    ] } })
  })
  expect(screen.getByText('Fresh current scale')).toBeInTheDocument()
  expect(screen.queryByText('加载区段中...')).not.toBeInTheDocument()
})

it('keeps the newer combined questionnaire snapshot after resource switching', async () => {
  const pending = new Map<string, (value: unknown) => void>()
  get.mockReset()
  get.mockImplementation((path: string) => new Promise(resolve => pending.set(path, resolve)))
  const view = render(<FormSectionManager basePath="/general-questionnaires/A" />)
  view.rerender(<FormSectionManager basePath="/questionnaires/B" />)
  const finish = async (path: string, label: string) => act(async () => {
    pending.get(`${path}/form-sections?include=units`)?.({ code: 0, data: { list: [], units: [
      { id: label, type: 'scale', position: 0, label, itemCount: 1, contextSection: false },
    ] } })
  })
  expect(get).toHaveBeenCalledTimes(2)
  await finish('/questionnaires/B', 'Current B')
  await finish('/general-questionnaires/A', 'Stale A')
  expect(screen.getByText('Current B')).toBeInTheDocument()
  expect(screen.queryByText('Stale A')).not.toBeInTheDocument()
})
