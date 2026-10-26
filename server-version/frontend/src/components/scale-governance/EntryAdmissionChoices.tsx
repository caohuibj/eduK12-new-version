export type EntryAdmissionProduct = 'TRAINING' | 'SURVEY'
const products:EntryAdmissionProduct[]=['TRAINING','SURVEY']
export function EntryAdmissionChoices({value,onChange,disabled=false,supported=products,label='允许使用的入口',unavailableReason}: {
  value:EntryAdmissionProduct[];onChange:(next:EntryAdmissionProduct[])=>void;disabled?:boolean;
  supported?:EntryAdmissionProduct[];label?:string;unavailableReason?:string
}) {
  return <fieldset disabled={disabled} className="my-3" aria-label={label}>
    <legend>{label}</legend>
    {products.map(product=><label key={product} className="mr-4 inline-flex gap-2 items-center">
      <input type="checkbox" checked={value.includes(product)} disabled={!supported.includes(product)}
        onChange={event=>{if(!disabled&&supported.includes(product))onChange(event.target.checked?[...value,product]:value.filter(entry=>entry!==product))}}/>
      {product==='TRAINING'?'Training':'Survey'}
    </label>)}
    <p>本次批准同时确定入口范围；用户使用权仍由对应入口分配。</p>
    {unavailableReason&&<p>{unavailableReason}</p>}
  </fieldset>
}
