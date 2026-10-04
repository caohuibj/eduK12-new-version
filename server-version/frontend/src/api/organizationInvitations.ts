import apiClient from './client'
import type { OrganizationPersona } from './organizations'
const data = <T>(r: {
  code: number | string
  data?: T
  message: string
}): T => {
  if (r.code !== 0 || r.data == null)
    throw new Error(r.message || '邀请响应无效')
  return r.data
}
export interface OrganizationInvite {
  id: string
  persona: OrganizationPersona | null
  status: string
  expiresAt: string
  createdAt: string
  consumedByUserId: string | null
}
export const organizationInvitationsApi = {
  list: async (org: string, page: number, signal?: AbortSignal) =>
    data(
      await apiClient.get<{ list: OrganizationInvite[]; hasMore: boolean }>(
        `/organizations/${encodeURIComponent(org)}/member-invitations`,
        { params: { page, pageSize: 20 }, signal },
      ),
    ),
  create: async (org: string, persona: OrganizationPersona | null) =>
    data(
      await apiClient.post<{
        id: string
        inviteCode: string
        expiresAt: string
      }>(`/organizations/${encodeURIComponent(org)}/member-invitations`, {
        persona,
      }),
    ),
  revoke: async (org: string, id: string) =>
    data(
      await apiClient.post(
        `/organizations/${encodeURIComponent(org)}/member-invitations/${encodeURIComponent(id)}/revoke`,
        {},
      ),
    ),
  preview: async (inviteCode: string, signal?: AbortSignal) =>
    data(
      await apiClient.post<{
        organization: { id: string; name: string }
        orgRole: 'MEMBER'
        persona: OrganizationPersona | null
        expiresAt: string
        alreadyMember: boolean
      }>('/organization-invitations/preview', { inviteCode }, { signal }),
    ),
  accept: async (
    inviteCode: string,
    commandKey: string,
    signal?: AbortSignal,
  ) =>
    data(
      await apiClient.post<{ organizationId: string; membershipId: string }>(
        '/organization-invitations/accept',
        { inviteCode, commandKey },
        { signal },
      ),
    ),
}
