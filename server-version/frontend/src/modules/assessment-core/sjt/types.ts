export type SjtQuestion={
  questionKey:string;prompt:string;responseType:'SINGLE'|'MULTIPLE';required:boolean;allowRefusal:boolean;
  minSelections?:number;maxSelections?:number;aggregationPolicy?:'SUM'|'MEAN';exclusiveOptionKeys?:string[];
  options:{optionKey:string;label:string;contributions:Record<string,number>;
    nonanswerReason?:'DECLINED'|'UNABLE_TO_JUDGE'}[]
}
export type SjtScene<Image = never>={sceneKey:string;title:string;stimulus:string;image?:Image;questions:SjtQuestion[]}
export type SjtDraftV2<Image = never>={
  schemaVersion:2;respondentType:'participant_self_report'|'student_self_report'|'teacher_self_report';
  title:string;author:string;sourceNote:string;licenseStatus:'self_authored'|'authorized'|'unknown';
  redistribution:'allowed'|'restricted'|'unknown';orderPolicy:'FIXED';
  metrics:{metricKey:string;label:string;direction:'descriptive'}[];
  scoring:{modelKey:'AUTHOR_KEY_SUM'|'EXPERT_KEY';modelVersion:'1';sourceNote:string};scenes:SjtScene<Image>[]
}
