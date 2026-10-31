export type WordproblemConfig={totalTrials:number;stimulusSetVersion:string;fixationMs:number;timeoutMs:number;validRtFloorMs:number}
export type WordproblemTrialPayload={itemId:string;responseIndex:number|null;rtMs:number|null;interrupted:boolean}
