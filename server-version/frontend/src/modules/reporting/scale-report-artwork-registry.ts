export interface ScaleReportArtworkImage {src:string;alt:string;width:number;height:number}
export interface ScaleReportArtworkManifest {artworkKey:string;hero?:ScaleReportArtworkImage;bands:Map<string,ScaleReportArtworkImage>}
export type ScaleReportArtworkModules=Record<string,unknown>

const imageFile=/^[a-z][a-z0-9_-]*\.webp$/
const artworkKey=/^[a-z][a-z0-9_]*\/\d+\.\d+\.\d+\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value)
function image(value:unknown,directory:string,images:ScaleReportArtworkModules):ScaleReportArtworkImage|null{
 if(!object(value)||typeof value.file!=='string'||!imageFile.test(value.file)||typeof value.alt!=='string'||!value.alt.trim()||value.alt.trim()!==value.alt
   ||typeof value.width!=='number'||typeof value.height!=='number'||!Number.isInteger(value.width)||!Number.isInteger(value.height)
   ||value.width<64||value.width>4096||value.height<64||value.height>4096)return null
 const src=images[`${directory}/${value.file}`]
 return typeof src==='string'?{src,alt:value.alt,width:value.width,height:value.height}:null
}

/** Invalid declarations fail closed instead of breaking an otherwise usable
 * frozen report. The content lane performs the stricter authoring validation. */
export function buildScaleReportArtworkRegistry(manifests:ScaleReportArtworkModules,images:ScaleReportArtworkModules){
 const registry=new Map<string,ScaleReportArtworkManifest>(),conflicts=new Set<string>()
 for(const [path,raw] of Object.entries(manifests)){
  const directory=path.replace(/\/report-artwork\.json$/,'')
  if(!object(raw)||raw.schemaVersion!==1||typeof raw.artworkKey!=='string'||!artworkKey.test(raw.artworkKey)||!Array.isArray(raw.bands))continue
  const expected=directory.replace(/^\/src\/scale-report-artwork\//,'')
  if(raw.artworkKey!==expected)continue
  const hero=raw.hero===undefined?undefined:image(raw.hero,directory,images)??undefined
  if(raw.hero!==undefined&&!hero)continue
  const bands=new Map<string,ScaleReportArtworkImage>();let valid=true
  for(const entry of raw.bands){
   if(!object(entry)||typeof entry.scoreKey!=='string'||typeof entry.bandKey!=='string'){valid=false;break}
   const resolved=image(entry,directory,images),key=`${entry.scoreKey}\0${entry.bandKey}`
   if(!resolved||bands.has(key)){valid=false;break}bands.set(key,resolved)
  }
  if(!valid||!hero&&!bands.size)continue
  if(registry.has(raw.artworkKey)){registry.delete(raw.artworkKey);conflicts.add(raw.artworkKey);continue}
  if(!conflicts.has(raw.artworkKey))registry.set(raw.artworkKey,{artworkKey:raw.artworkKey,hero,bands})
 }
 return registry
}
