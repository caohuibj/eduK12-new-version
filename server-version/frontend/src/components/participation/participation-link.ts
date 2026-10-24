/** Product adapters fix route and fragment namespace. A parsed proof is never authorization. */
export function createParticipationLinkCodec({route,namespace,proofFields}:{route:string;namespace:string;proofFields:Record<string,RegExp>}) {
  const keys=['resume',...Object.keys(proofFields)].sort().join(',')
  const valid=(proof:Record<string,string>)=>Object.entries(proofFields).every(([key,pattern])=>pattern.test(proof[key]??''))
  return {
    read(hash:string):Record<string,string>|null {
      if(hash.length>512)return null
      const params=new URLSearchParams(hash.replace(/^#/,''))
      if([...params.keys()].sort().join(',')!==keys||params.get('resume')!==namespace)return null
      const proof=Object.fromEntries(Object.keys(proofFields).map(key=>[key,params.get(key)??'']))
      return valid(proof)?proof:null
    },
    link(origin:string,id:string,proof:Record<string,string>):string {
      if(!/^[a-f0-9-]{36}$/i.test(id)||!valid(proof))return ''
      try {
        const url=new URL(route+id,origin)
        if(!['http:','https:'].includes(url.protocol))return ''
        url.hash=new URLSearchParams({resume:namespace,...Object.fromEntries(Object.keys(proofFields).map(key=>[key,proof[key]]))}).toString()
        return url.href
      }catch{return ''}
    },
  }
}
