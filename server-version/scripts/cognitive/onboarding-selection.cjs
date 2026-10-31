/** Selection is caller intent, never Git scope evidence. Reject the whole invalid batch. */
function selectOnboarding(args, packages) {
  if (!Array.isArray(args) || !Array.isArray(packages)) throw Error('COG_SELECTION_INVALID');
  let requested, source, json=false, contentOnly=false, base;
  const choose=(value,kind)=>{if(source)throw Error('COG_SELECTION_MIXED');requested=value;source=kind;};
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(arg==='--json') {if(json)throw Error('COG_SELECTION_DUPLICATE_FLAG');json=true;}
    else if(arg==='--content-only') {if(contentOnly)throw Error('COG_SELECTION_DUPLICATE_FLAG');contentOnly=true;}
    else if(arg==='--base') {if(base!==undefined || !/^[a-f0-9]{40}$/.test(args[++i]||''))throw Error('COG_COMPATIBILITY_BASE_REQUIRED');base=args[i];}
    else if(arg==='--all') choose(packages.map(p=>p.task),'all');
    else if(arg==='--tasks') choose((args[++i]||'').split(','),'batch');
    else if(arg==='--tasks-json') {let value;try{value=JSON.parse(args[++i]);}catch{throw Error('COG_SELECTION_JSON_INVALID');} choose(value?.tasks,'batch');}
    else if(typeof arg==='string'&&!arg.startsWith('-')) choose([arg],'legacy');
    else throw Error('COG_SELECTION_UNKNOWN_OPTION:'+arg);
  }
  if(!source || !Array.isArray(requested) || !requested.length || requested.some(t=>typeof t!=='string'||!t||!packages.some(p=>p.task===t)) || new Set(requested).size!==requested.length) throw Error('COG_SELECTION_INVALID_TASKS');
  if(contentOnly&&!base)throw Error('COG_COMPATIBILITY_BASE_REQUIRED');
  if(base&&!contentOnly)throw Error('COG_SELECTION_BASE_WITHOUT_CONTENT_ONLY');
  const tasks=[...requested].sort(), selected=packages.filter(p=>tasks.includes(p.task));
  return {tasks,selected,json,contentOnly,base,batch:source==='batch',frontendSuites:[...new Set(selected.flatMap(p=>p.acceptance?.frontendSuites||[]))].sort()};
}
module.exports={selectOnboarding};
