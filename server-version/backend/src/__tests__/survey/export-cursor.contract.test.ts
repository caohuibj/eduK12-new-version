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
      const v2={...cursor,v:2 as const}
      const upgraded=encodeSurveyExportCursor(v2)
      expect(decodeSurveyExportCursor(upgraded,'a','RAW_WAVE','b')).toEqual(v2)
      const v3={...cursor,v:3 as const,phase:'FINALS' as const,attendanceCount:2}
      expect(decodeSurveyExportCursor(encodeSurveyExportCursor(v3),'a','RAW_WAVE','b'))
        .toEqual(v3)
      const attendance={...v3,phase:'ATTENDANCE' as const,
        afterAttemptId:'22222222-2222-4222-8222-222222222222',page:3}
      expect(decodeSurveyExportCursor(encodeSurveyExportCursor(attendance),'a','RAW_WAVE','b'))
        .toEqual(attendance)
      expect(()=>decodeSurveyExportCursor(encodeSurveyExportCursor({
        ...attendance,attendanceCount:-1,
      }),'a','RAW_WAVE','b')).toThrow()
      expect(()=>decodeSurveyExportCursor(encodeSurveyExportCursor({
        ...attendance,afterAttemptId:'not-a-uuid',
      }),'a','RAW_WAVE','b')).toThrow()
      expect(()=>decodeSurveyExportCursor(encodeSurveyExportCursor({
        ...v3,phase:'UNKNOWN' as 'FINALS',
      }),'a','RAW_WAVE','b')).toThrow()
      expect(()=>decodeSurveyExportCursor(upgraded,'a','RAW_LONG','b')).toThrow()
      expect(()=>decodeSurveyExportCursor(encodeSurveyExportCursor({
        ...cursor,v:3 as unknown as 2,
      }),'a','RAW_WAVE','b')).toThrow()
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
