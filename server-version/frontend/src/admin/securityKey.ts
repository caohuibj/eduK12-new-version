import api from '../api/client'
import type { User } from '../types'

type CredentialJSON = { id: string; rawId: string; type: 'public-key'; authenticatorAttachment?: string;
  clientExtensionResults: AuthenticationExtensionsClientOutputs; response: Record<string, unknown> }
const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0))
const encode = (value: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
function supported() {
  if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials)
    throw new Error('当前浏览器不支持安全密钥，请在受信任的 HTTPS 管理入口使用支持 WebAuthn 的浏览器。')
}
function serialize(credential: PublicKeyCredential): CredentialJSON {
  const result: CredentialJSON = { id: credential.id, rawId: encode(credential.rawId), type: 'public-key',
    clientExtensionResults: credential.getClientExtensionResults(),
    ...(credential.authenticatorAttachment ? { authenticatorAttachment: credential.authenticatorAttachment } : {}), response: {} }
  const response = credential.response
  if (response instanceof AuthenticatorAttestationResponse) result.response = { clientDataJSON: encode(response.clientDataJSON),
    attestationObject: encode(response.attestationObject), transports: response.getTransports?.() ?? [] }
  else {
    const assertion = response as AuthenticatorAssertionResponse
    result.response = { clientDataJSON: encode(assertion.clientDataJSON), authenticatorData: encode(assertion.authenticatorData),
      signature: encode(assertion.signature), ...(assertion.userHandle ? { userHandle: encode(assertion.userHandle) } : {}) }
  }
  return result
}
export async function assertSecurityKey(options: Record<string, unknown>) {
  supported()
  const descriptors = (options.allowCredentials ?? []) as Array<{ id: string; type: 'public-key'; transports?: AuthenticatorTransport[] }>
  const credential = await navigator.credentials.get({ publicKey: { ...options, challenge: decode(options.challenge as string),
    allowCredentials: descriptors.map(c=>({ ...c, id: decode(c.id) })) } as PublicKeyCredentialRequestOptions })
  if (!credential) throw new Error('安全密钥验证未完成，请重试。')
  return serialize(credential as PublicKeyCredential)
}
export async function enrollSecurityKey(username: string, password: string, enrollmentToken: string) {
  supported()
  const response = await api.post<{ options: Record<string, unknown> }>('/admin/security/registration/options', { username, password, enrollmentToken })
  const options = response.data!.options
  const user = options.user as { id: string; name: string; displayName: string }
  const excluded = (options.excludeCredentials ?? []) as Array<{ id: string; type: 'public-key' }>
  const credential = await navigator.credentials.create({ publicKey: { ...options, challenge: decode(options.challenge as string),
    rp: options.rp as PublicKeyCredentialRpEntity, pubKeyCredParams: options.pubKeyCredParams as PublicKeyCredentialParameters[],
    user: { ...user, id: decode(user.id) }, excludeCredentials: excluded.map(c=>({ ...c, id: decode(c.id) })) } })
  if (!credential) throw new Error('安全密钥登记未完成，请重试。')
  return api.post('/admin/security/registration/verify', { response: serialize(credential as PublicKeyCredential) })
}
export async function reauthenticateAdmin() {
  const options = await api.post<{ options: Record<string, unknown> }>('/admin/security/step-up/options', {})
  const response = await assertSecurityKey(options.data!.options)
  return api.post<{ user: User }>('/admin/security/step-up/verify', { response })
}
