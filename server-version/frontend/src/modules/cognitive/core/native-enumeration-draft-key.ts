/** This first native enumeration product key isolates authorized server epochs; legacy/MOT keys stay unchanged. */
export function nativeEnumerationDraftKey(sessionId:string,attemptEpoch:number):string {
 if(!sessionId||sessionId.length>512||!Number.isSafeInteger(attemptEpoch)||attemptEpoch<1)throw Error('缺少真实点数测验身份')
 return 'cognitive:enumeration:'+JSON.stringify([sessionId,attemptEpoch])
}

/** Standalone key routing only; parent Training retention still owns its separate key. */
export function standaloneCognitiveDraftKey(session:{sessionId:string;nativeTask?:boolean;testType:string;engineVersion:string;scoringVersion:string;configVersion:string;attemptEpoch?:number;attemptNo:number}):string {
 return session.nativeTask&&session.testType==='enumeration'&&session.engineVersion==='0.2.0'
  &&session.scoringVersion==='0.2.0'&&session.configVersion==='0.3.0'
  ?nativeEnumerationDraftKey(session.sessionId,session.attemptEpoch??session.attemptNo):'cognitive:'+session.sessionId
}
