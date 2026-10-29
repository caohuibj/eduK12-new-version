import {describe,it,expect,vi} from 'vitest'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
import {nativeAntFixture} from './native-ant-fixtures.test-support'
import {validateNativeContentArchive} from '../../modules/cognitive/content-candidates/native-registry/archive-detail'
import {antNativeDisplaySchema} from '../../modules/cognitive/content-candidates/ant/native-schema'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {getCognitiveTaskResource,assertNativeDeliverySupported} from '../../modules/cognitive/task-resource'
describe('user-confirmed ANT native transport',()=>{
 it('binds measured geometry into authoritative core and validates the original frame archive without rescore',()=>{
  const f=nativeAntFixture(),t=f.input.trials[0].payload as any
  expect(t.presentationBinding).toEqual({schemaVersion:1,geometryVersion:f.context.administration.geometryVersion,geometryHash:f.context.administration.geometryHash,displayHash:canonicalHash(f.context.administration)})
  expect(validateNativeContentArchive(f.detail,f.authority)).toEqual(f.detail)
  expect(f.adapter.isReport(f.publicReport.report)).toBe(true);expect(f.publicReport.state).toBe('invalid')
  expect((f.publicReport.report as any).contextId).toBe(f.context.contextKey)
  expect(f.publicReport.report).not.toHaveProperty('metrics')
  const changed=structuredClone(f.context.administration);changed.geometry.arrowWidthCssPx+=1
  expect(antNativeDisplaySchema.safeParse(changed).success).toBe(false)
  expect(antNativeDisplaySchema.safeParse({...f.context.administration,origin:'synthetic_fixture'}).success).toBe(false)
  const resource=getCognitiveTaskResource('ant','1.1.0','1.1.0')!
  expect(()=>assertNativeDeliverySupported(resource,'authenticated')).not.toThrow()
  expect(()=>assertNativeDeliverySupported(resource,'public')).toThrow()
  expect(()=>assertNativeDeliverySupported(getCognitiveTaskResource('ant','1.0.0','1.1.0')!,'authenticated')).toThrow()
 })
})
