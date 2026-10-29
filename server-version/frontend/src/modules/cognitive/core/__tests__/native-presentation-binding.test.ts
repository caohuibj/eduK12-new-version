import {it,expect,vi} from 'vitest'
import {nativeContentCases} from '../../../../../../backend/src/__tests__/cognitive/native-content-fixtures.test-support'
import {nativeAntFixture} from '../../../../../../backend/src/__tests__/cognitive/native-ant-fixtures.test-support'
import {projectNativeContentReport} from '../../../../../../backend/src/modules/cognitive/content-candidates/native-registry/public-report'
import {isNativePublicReportSnapshot} from '../native-public-report'
import {isNativeAntReport} from '../../tasks/ant/generated/native-report'
import type {NativePublicReportSnapshot} from '../../types'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
it.each([...nativeContentCases,nativeAntFixture()])('$name binds task and generic presentation identities independently, rejecting unknown versions',f=>{
 const saved=f.publicReport as NativePublicReportSnapshot,r=saved.report as Record<string,unknown>
 expect(saved.participantPresentationVersion).toBe(f.name==='precision-working-memory'?'0.1.1':f.name==='ant'?'1.0.0':'0.1.0')
 expect(saved.presentationVersion).toBe(r.presentationVersion)
 expect(isNativePublicReportSnapshot(saved)).toBe(true)
 expect(isNativePublicReportSnapshot({...saved,presentationVersion:'next'})).toBe(false)
 expect(isNativePublicReportSnapshot({...saved,participantPresentationVersion:'next'})).toBe(false)
 expect(()=>projectNativeContentReport({...f.context.snapshot,contextKey:f.context.contextKey,profile:f.input.config.profile,reportDefinitionVersion:f.definition.report.version,presentationVersion:'next',score:f.score})).toThrow('Unknown exact native report combination')
 const legacy=structuredClone(saved);delete legacy.participantPresentationVersion
 if(f.name==='precision-working-memory')legacy.presentationVersion='0.1.1'
 if(f.name==='ant')delete (legacy.report as Record<string,unknown>).presentationVersion
 const before=JSON.stringify(legacy)
 expect(isNativePublicReportSnapshot(legacy)).toBe(true)
 if(f.name==='ant')expect(isNativeAntReport(legacy.report)).toBe(true)
 expect(JSON.stringify(legacy)).toBe(before)
 expect(isNativePublicReportSnapshot({...legacy,presentationVersion:'next'})).toBe(false)
})
