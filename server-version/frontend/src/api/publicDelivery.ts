import apiClient from './client'
import { cognitiveApi } from '../modules/cognitive/api'
import { compositeApi } from '../modules/composite/api'

export type PublicDeliveryFamily = 'QUESTIONNAIRE' | 'COGNITIVE' | 'COMPOSITE'
export interface PublicDeliveryLink {
  id: string
  token: string | null
  createdAt: string | null
  expiresAt: string
  maxUses: number
  usedCount: number
  isActive: boolean
}
export interface PublicDeliveryAdapter {
  listLinks(): Promise<PublicDeliveryLink[]>
  createLink(input: { expiresAt: string; maxUses: number }): Promise<PublicDeliveryLink>
  revealLink(id: string): Promise<PublicDeliveryLink>
  disableLink(id: string): Promise<void>
  getPublicEntry(link: PublicDeliveryLink): string | null
}
const data = <T>(response: {code: number | string; message?: string; data?: T}): T => {
  if (response.code !== 0 || response.data == null) throw new Error(response.message || '匿名链接操作失败')
  return response.data
}
const normalize = (row: PublicDeliveryLink): PublicDeliveryLink => ({
  id: row.id, token: row.token || null, createdAt: row.createdAt || null,
  expiresAt: row.expiresAt, maxUses: row.maxUses, usedCount: row.usedCount ?? 0, isActive: row.isActive ?? true,
})
/** Product adapter only: authorization, encrypted token storage and quota remain in existing services. */
export function publicDeliveryAdapter(family: PublicDeliveryFamily, resourceId: string): PublicDeliveryAdapter {
  const questionnaireRoot = `/general-questionnaires/${encodeURIComponent(resourceId)}/tokens`
  return {
    async listLinks() {
      const response = family === 'QUESTIONNAIRE' ? await apiClient.get<{list: PublicDeliveryLink[]}>(questionnaireRoot)
        : family === 'COGNITIVE' ? await cognitiveApi.listPublicTokens(resourceId) : await compositeApi.listTokens(resourceId)
      return data<{list: PublicDeliveryLink[]}>(response).list.map(normalize)
    },
    async createLink(input) {
      if (!Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= Date.now()) throw new Error('请选择未来的有效期')
      if (!Number.isSafeInteger(input.maxUses) || input.maxUses < 0 || input.maxUses > 2147483647) throw new Error('最大参与次数必须为有效的非负整数')
      const response = family === 'QUESTIONNAIRE' ? await apiClient.post<PublicDeliveryLink>(questionnaireRoot,input)
        : family === 'COGNITIVE' ? await cognitiveApi.createPublicToken(resourceId,input) : await compositeApi.createToken(resourceId,input)
      return normalize(data(response) as PublicDeliveryLink)
    },
    async revealLink(id) {
      const encoded = encodeURIComponent(id)
      const response = family === 'QUESTIONNAIRE' ? await apiClient.post<PublicDeliveryLink>(`${questionnaireRoot}/${encoded}/reveal`, {})
        : family === 'COGNITIVE' ? await cognitiveApi.revealPublicToken(resourceId,id) : await compositeApi.revealToken(resourceId,id)
      return normalize(data(response) as PublicDeliveryLink)
    },
    async disableLink(id) {
      const response = family === 'QUESTIONNAIRE' ? await apiClient.delete(`${questionnaireRoot}/${encodeURIComponent(id)}`)
        : family === 'COGNITIVE' ? await cognitiveApi.disablePublicToken(resourceId,id) : await compositeApi.disableToken(resourceId,id)
      if (response.code !== 0) throw new Error(response.message || '停用链接失败')
    },
    getPublicEntry(link) {
      if (!link.token) return null
      const path = family === 'QUESTIONNAIRE' ? '/public/questionnaire/' : family === 'COGNITIVE' ? '/public/cognitive/assignments/' : '/public/composite/'
      return `${window.location.origin}${path}${encodeURIComponent(link.token)}`
    },
  }
}
export const publicLinkStatus = (link: PublicDeliveryLink, now = Date.now()) => !link.isActive ? '已停用'
  : Date.parse(link.expiresAt) <= now ? '已过期'
    : link.maxUses > 0 && link.usedCount >= link.maxUses ? '已用尽' : '使用中'
