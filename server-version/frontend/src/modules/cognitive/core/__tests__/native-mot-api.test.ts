import {describe,it,expect,vi} from 'vitest'
import apiClient from '../../../../api/client'
import {cognitiveApi,publicCognitiveApi} from '../../api'
const identity={sessionId:'s/actual',attemptEpoch:2,submissionId:'submit',definitionHash:'a'.repeat(64)}
describe('native raw archive authenticated transport',()=>{
 it('sends finite UTF8 JSON as octet-stream Blob through existing apiClient',async()=>{
  const post=vi.spyOn(apiClient,'post').mockResolvedValueOnce({code:0,data:{}} as any)
  const raw={rawPayload:{schemaVersion:1,formal:[{raw:{motionFrameTimesMs:[1,2]}}],practice:[]},rawSha256:'b'.repeat(64)}
  await cognitiveApi.archiveRaw(identity,raw)
  const [path,body,config]=post.mock.calls[0]
  expect(path).toBe('/cognitive/sessions/s%2Factual/raw-archive');expect(body).toBeInstanceOf(Blob)
  expect(config?.headers?.['Content-Type']).toBe('application/octet-stream')
  const text=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsText(body as Blob)})
  expect(JSON.parse(text)).toEqual({attemptEpoch:2,submissionId:'submit',definitionHash:identity.definitionHash,...raw})
  expect(text).not.toContain('base64');post.mockRestore()
 })
 it('uses normal JSON GET binding and leaves public archive unavailable',async()=>{
  const get=vi.spyOn(apiClient,'get').mockResolvedValueOnce({code:0,data:{}} as any)
  await cognitiveApi.getRawArchive(identity)
  expect(get.mock.calls[0][0]).toContain('/s%2Factual/raw-archive?attemptEpoch=2&submissionId=submit&definitionHash=')
  expect(publicCognitiveApi('fixture').archiveRaw).toBeUndefined();get.mockRestore()
 })
})
