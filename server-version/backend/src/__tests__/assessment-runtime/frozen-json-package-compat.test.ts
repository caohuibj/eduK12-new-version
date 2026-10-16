import {afterEach,describe,it,expect,vi}from 'vitest'
import {jsonArtifactBytes}from '../../modules/assessment-runtime/bounded-artifact-cache'
afterEach(()=>vi.unstubAllEnvs())
describe('complete package switch preserves the prior strict JSON contract',()=>{
 it('preserves exact bytes for frozen and mutable scientific content',()=>{for(const object of [{z:[0,-0,'中文'],a:{n:1}},Object.freeze({nested:Object.freeze([1,2,3])})]){vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED','false');const old=jsonArtifactBytes(object);vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED','true');const next=jsonArtifactBytes(object);expect(next).toEqual(old);expect(next).not.toBe(old)}})
 it('rejects unsupported content in both paths after warming a valid immutable value',()=>{const cycle:any={};cycle.self=cycle;for(const flag of ['false','true']){vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED',flag);jsonArtifactBytes(Object.freeze({a:1}));for(const value of [{a:undefined},{a:NaN},{a:()=>1},{get a(){return 1}},new Date(),cycle])expect(jsonArtifactBytes(value)).toBeNull()}})
 it('does not satisfy a changed mutable object from a previous frozen content hit',()=>{vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED','true');const first=Object.freeze({a:Object.freeze({n:1})});jsonArtifactBytes(first);const current={a:{n:1}};const before=jsonArtifactBytes(current);current.a.n=2;expect(jsonArtifactBytes(current)).not.toEqual(before)})
})
