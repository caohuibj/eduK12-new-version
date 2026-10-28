import React from 'react'
import {createNativeContentRunner,nativeContentSnapshot} from '../../core/NativeContentRunner'
import {isNativePublicReportSnapshot} from '../../core/native-public-report'
import type {NativePublicReportSnapshot} from '../../types'
import {AttentionalBlinkTask} from './AttentionalBlinkTask'
import {BlinkReport} from './BlinkReport'
import {BLINK_IDENTITY,blinkPlan,type BlinkRaw} from './generated/protocol'
import {isBlinkReport,type BlinkReport as PublicReport} from './generated/report'
import {blinkEnvelope} from './generated/envelope'
import {digest,validateBlinkContext,blinkManifest,type BlinkContext,type BlinkDraft,type BlinkFinal} from './contracts'

export const NativeBlinkRunner=createNativeContentRunner<BlinkContext,BlinkDraft,BlinkFinal,BlinkRaw,PublicReport>({
 createContext:(c,key)=>{const snapshot=nativeContentSnapshot(c);return validateBlinkContext({contextKey:key,snapshot:snapshot as BlinkContext['snapshot'],randomSeed:c.randomSeed,manifestHash:digest(blinkPlan(snapshot.config as BlinkContext['snapshot']['config'],c.randomSeed))})},
 manifest:blinkManifest,envelope:blinkEnvelope,isReport:isBlinkReport,Component:AttentionalBlinkTask,
})
export function NativeContentReport({snapshot}:{snapshot:NativePublicReportSnapshot}){
 if(!isNativePublicReportSnapshot(snapshot)||snapshot.testType!==BLINK_IDENTITY.testType||snapshot.engineVersion!==BLINK_IDENTITY.engineVersion||snapshot.scoringVersion!==BLINK_IDENTITY.scoringVersion||snapshot.configVersion!==BLINK_IDENTITY.configVersion||!isBlinkReport(snapshot.report))return <p role="alert">已保存公开报告暂时无法核对。</p>
 return <BlinkReport report={snapshot.report}/>
}
