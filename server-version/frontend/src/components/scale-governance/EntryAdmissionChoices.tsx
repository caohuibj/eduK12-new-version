export type EntryAdmissionProduct = 'TRAINING' | 'SURVEY'
export type StandardCombinationEntryAdmissionProduct=EntryAdmissionProduct|'SCHOOL'|'TEACHER'
const products:EntryAdmissionProduct[]=['TRAINING','SURVEY']
const standardProducts:StandardCombinationEntryAdmissionProduct[]=['TRAINING','SURVEY','SCHOOL','TEACHER']
const labels={TRAINING:'Training',SURVEY:'Survey',SCHOOL:'School',TEACHER:'Teacher'}
export function EntryAdmissionChoices<T extends StandardCombinationEntryAdmissionProduct=EntryAdmissionProduct>({value,onChange,disabled=false,includeEducationEntries=false,supported,label='允许使用的入口',unavailableReason}: {
  value:T[];onChange:(next:T[])=>void;disabled?:boolean;
  supported?:T[];label?:string;unavailableReason?:string;includeEducationEntries?:boolean
}) {
  const choices=(includeEducationEntries?standardProducts:products) as T[]
  const available=supported??choices
  return <fieldset disabled={disabled} className="my-3" aria-label={label}>
    <legend>{label}</legend>
    {choices.map(product=><label key={product} className="mr-4 inline-flex gap-2 items-center">
      <input type="checkbox" checked={value.includes(product)} disabled={!available.includes(product)}
        onChange={event=>{if(!disabled&&available.includes(product))onChange(event.target.checked?[...value,product]:value.filter(entry=>entry!==product))}}/>
      {labels[product]}
    </label>)}
    <p>本次批准同时确定入口范围；用户使用权仍由对应入口分配。</p>
    {unavailableReason&&<p>{unavailableReason}</p>}
  </fieldset>
}
