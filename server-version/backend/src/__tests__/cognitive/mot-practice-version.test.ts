import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {createMotSnapshot} from '../../modules/cognitive/content-candidates/mot/package'
import {scoreMot} from '../../modules/cognitive/content-candidates/mot/scorer'
import {MOT_IDENTITY} from '../../modules/cognitive/content-candidates/mot/protocol'
describe('MOT completed-practice engine patch freezes its execution identity',()=>{
 it('pins new protocol signature while preserving each frozen config and historical golden',()=>{
  const old=JSON.parse(readFileSync(join(__dirname,'fixtures/mot-native-v1.1.0.json'),'utf8'))
  const current=JSON.parse(readFileSync(join(__dirname,'fixtures/mot-native-v1.1.1.json'),'utf8'))
  expect(MOT_IDENTITY).toMatchObject({engineVersion:'1.1.1',scoringVersion:'1.1.0',configVersion:'1.0.0'})
  for(const profile of ['experience','research'] as const){const s=createMotSnapshot(profile)
   expect(s.protocol.key).toBe('mot/1.1.1/1.1.0');expect(s.protocol.version).toBe('1.1.1')
   expect(s.configHash).toBe(old[profile].configHash);expect(s.protocolSignature).toBe(current[profile].protocolSignature)
   expect(s.protocolSignature).not.toBe(old[profile].protocolSignature)
   expect(current[profile].planSha256).toBe(old[profile].planSha256)
  }
 })
 it('rejects an old frozen engine or protocol instead of silently applying new practice policy',()=>{
  const s=createMotSnapshot('experience');const base={session:s,config:s.config,trials:[],randomSeed:'version-only-no-trial'}
  expect(()=>scoreMot({...base,session:{...s,engineVersion:'1.1.0'}})).toThrow('Unsupported frozen MOT identity')
  expect(()=>scoreMot({...base,session:{...s,protocol:{...s.protocol,key:'mot/1.1.0/1.1.0'}}})).toThrow('Unsupported frozen MOT identity')
 })
})
