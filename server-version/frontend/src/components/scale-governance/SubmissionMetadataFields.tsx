import type {SubmissionMetadata} from '../../api/scaleLibraryGovernance'
export const emptySubmissionMetadata:SubmissionMetadata={title:'',author:'',copyright:'',applicability:'',scoringDescription:'',reportDescription:''}
const labels:Record<keyof SubmissionMetadata,string>={title:'量表名称',author:'作者 / 来源（可选资料）',copyright:'版权说明（可选资料）',applicability:'用途与适用范围',scoringDescription:'计分说明',reportDescription:'报告说明'}
const limits:Record<keyof SubmissionMetadata,number>={title:200,author:500,copyright:2000,applicability:2000,scoringDescription:4000,reportDescription:4000}
export function SubmissionMetadataFields({value,onChange,disabled,entry}:{value:SubmissionMetadata;onChange:(value:SubmissionMetadata)=>void;disabled:boolean;entry:'SCHOOL'|'TEACHER'}){
 return <fieldset disabled={disabled}>{(Object.keys(labels) as Array<keyof SubmissionMetadata>).map(key=><label key={key} className={entry==='SCHOOL'?'hs-field':'ht-field'}><span>{labels[key]}</span><textarea value={value[key]} maxLength={limits[key]} required={key!=='author'&&key!=='copyright'} onChange={event=>onChange({...value,[key]:event.target.value})}/></label>)}</fieldset>
}
