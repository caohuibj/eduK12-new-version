import React from 'react'
import {createNativeContentRunner,nativeContentSnapshot} from '../../core/NativeContentRunner'
import {isNativePublicReportSnapshot} from '../../core/native-public-report'
import type {NativePublicReportSnapshot} from '../../types'
import {HeartsFlowersTask} from './HeartsFlowersTask'
import {HFReport} from './HFReport'
import {HF_IDENTITY,hfPlan,type HFRaw} from './generated/protocol'
import {isHFReport,type HFReport as PublicReport} from './generated/report'
import {hfEnvelope} from './generated/envelope'
import {digest,validateHFContext,hfManifest,type HFContext,type HFDraft,type HFFinal} from './contracts'

export const NativeHFRunner=createNativeContentRunner<HFContext,HFDraft,HFFinal,HFRaw,PublicReport>({
 createContext:(c,key)=>{const snapshot=nativeContentSnapshot(c);return validateHFContext({contextKey:key,snapshot:snapshot as HFContext['snapshot'],randomSeed:c.randomSeed,manifestHash:digest(hfManifest({snapshot:snapshot as HFContext['snapshot'],randomSeed:c.randomSeed})),administration:{language:'zh' as const,deviceClass:'UNKNOWN' as const,viewportCss:{width:innerWidth,height:innerHeight},dpr:devicePixelRatio,displayCalibration:null}})},
 manifest:hfManifest,envelope:hfEnvelope,isReport:isHFReport,Component:HeartsFlowersTask,
})
export function NativeContentReport({snapshot}:{snapshot:NativePublicReportSnapshot}){
 if(!isNativePublicReportSnapshot(snapshot)||snapshot.testType!==HF_IDENTITY.testType||snapshot.engineVersion!==HF_IDENTITY.engineVersion||snapshot.scoringVersion!==HF_IDENTITY.scoringVersion||snapshot.configVersion!==HF_IDENTITY.configVersion||!isHFReport(snapshot.report))return <p role="alert">已保存公开报告暂时无法核对。</p>
 return <HFReport report={snapshot.report}/>
}
