import {describe,expect,it} from 'vitest'
import {resolveSurveyCheckpointDraft,sameSurveyCheckpointAnswers} from './checkpoint-recovery'

describe('Survey checkpoint conflict recovery',()=>{
  const local={screen:{eligible:'yes'},scale:{q1:'o2'}}
  const server={revision:7,checkpoint:{answers:{screen:{eligible:'yes'},scale:{q1:'o5'}}}}
  it('compares answer sets independent of object insertion order',()=>{
    expect(sameSurveyCheckpointAnswers(local,{scale:{q1:'o2'},screen:{eligible:'yes'}})).toBe(true)
    expect(sameSurveyCheckpointAnswers(local,server.checkpoint.answers)).toBe(false)
  })
  it('selects server content without reapplying stale local values',()=>{
    expect(resolveSurveyCheckpointDraft(local,server,true)).toEqual({
      answers:server.checkpoint.answers,revision:7,requiresOverwriteConfirmation:false,conflict:true,
    })
  })
  it('preserves local draft only with an explicit server-overwrite warning',()=>{
    expect(resolveSurveyCheckpointDraft(local,server,false)).toEqual({
      answers:local,revision:7,requiresOverwriteConfirmation:true,conflict:true,
    })
  })
  it('keeps historical local drafts when remote is empty and is silent on exact matches',()=>{
    expect(resolveSurveyCheckpointDraft(local,{revision:0,checkpoint:null},true)).toMatchObject({
      answers:local,revision:0,requiresOverwriteConfirmation:false,conflict:false,
    })
    expect(resolveSurveyCheckpointDraft(local,{revision:8,checkpoint:{answers:local}},false))
      .toMatchObject({revision:8,requiresOverwriteConfirmation:false,conflict:false})
    expect(resolveSurveyCheckpointDraft(null,server,false))
      .toMatchObject({answers:server.checkpoint.answers,revision:7,conflict:false})
  })
})
