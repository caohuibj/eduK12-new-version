import {describe,it,expect} from 'vitest'
import {encodeSurveyExportCursor,decodeSurveyExportCursor} from '../../modules/survey/analytics.export-cursor'

describe('Survey bounded export continuation proof',()=>{
  it('binds the signed keyset to project, wave, format, cutoff and expiry',()=>{
    const old=process.env.ASSET_SIGNING_SECRET
    process.env.ASSET_SIGNING_SECRET='test-hmac-key-for-survey-exports-64-fixed'
    try{
      const cursor={v:1 as const,projectId:'a',waveId:'b',
        format:'RAW_WAVE' as const,
        after:{id:'11111111-1111-4111-8111-111111111111',
          completedAt:'2026-10-11T08:00:00.000Z'},
        cutOff:'2026-10-11T09:00:00.000Z',sourceRevision:5,
        page:1,issuedAt:Date.now(),completedFrom:null,completedBefore:null,
        freeTextIncluded:false,finalCount:22}
      const serialized=encodeSurveyExportCursor(cursor)
      expect(decodeSurveyExportCursor(serialized,'a','RAW_WAVE','b')).toEqual(cursor)
      expect(()=>decodeSurveyExportCursor(serialized,'wrong','RAW_WAVE','b')).toThrow()
      expect(()=>decodeSurveyExportCursor(serialized,'a','SCORE_LONG','b')).toThrow()
      expect(()=>decodeSurveyExportCursor(serialized.slice(0,-3)+'zzz','a','RAW_WAVE','b')).toThrow()
      expect(()=>decodeSurveyExportCursor(encodeSurveyExportCursor({
        ...cursor,issuedAt:Date.now()-3600_001,
      }),'a','RAW_WAVE','b')).toThrow()
    }finally{
      if(old===undefined)delete process.env.ASSET_SIGNING_SECRET
      else process.env.ASSET_SIGNING_SECRET=old
    }
  })
})
