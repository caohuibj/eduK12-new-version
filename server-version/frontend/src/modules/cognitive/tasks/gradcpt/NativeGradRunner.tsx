import React from 'react'
import {createNativeContentRunner,nativeContentSnapshot} from '../../core/NativeContentRunner'
import {isNativePublicReportSnapshot} from '../../core/native-public-report'
import type {NativePublicReportSnapshot} from '../../types'
import {GradCptTask} from './GradCptTask'
import {GradReport} from './GradReport'
import {GRAD_IDENTITY,gradPlan,type GradRaw} from './generated/protocol'
import {isGradReport,type GradReport as PublicReport} from './generated/report'
import {packGradEnvelope} from './wire'
import {digest,validateGradContext,gradManifest,type GradContext,type GradDraft,type GradFinal} from './contracts'

export const NativeGradRunner=createNativeContentRunner<GradContext,GradDraft,GradFinal,GradRaw,PublicReport>({
 createContext:(c,key)=>{const snapshot=nativeContentSnapshot(c);return validateGradContext({contextKey:key,snapshot:snapshot as GradContext['snapshot'],randomSeed:c.randomSeed,manifestHash:digest(gradPlan(snapshot.config as GradContext['snapshot']['config'],c.randomSeed))})},
 manifest:gradManifest,envelope:packGradEnvelope,freezeEnvelope:true,isReport:isGradReport,Component:GradCptTask,
})
export function NativeContentReport({snapshot}:{snapshot:NativePublicReportSnapshot}){
 if(!isNativePublicReportSnapshot(snapshot)||snapshot.testType!==GRAD_IDENTITY.testType||snapshot.engineVersion!==GRAD_IDENTITY.engineVersion||snapshot.scoringVersion!==GRAD_IDENTITY.scoringVersion||snapshot.configVersion!==GRAD_IDENTITY.configVersion||!isGradReport(snapshot.report))return <p role="alert">已保存公开报告暂时无法核对。</p>
 return <GradReport report={snapshot.report}/>
}
