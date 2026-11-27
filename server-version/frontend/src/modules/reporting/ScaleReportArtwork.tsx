import type {ReactNode} from 'react'
import {buildScaleReportArtworkRegistry,type ScaleReportArtworkModules} from './scale-report-artwork-registry'

const rawManifests=import.meta.glob('/src/scale-report-artwork/*/*/*/report-artwork.json',{eager:true,import:'default'}) as ScaleReportArtworkModules
const rawImages=import.meta.glob('/src/scale-report-artwork/*/*/*/*.webp',{eager:true,query:'?url',import:'default'}) as ScaleReportArtworkModules
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value)

const registry=buildScaleReportArtworkRegistry(rawManifests,rawImages)
const imageForBlock=(key:string|undefined,block:unknown)=>{
 if(!key||!object(block)||block.type!=='REFERENCE_BAND'||typeof block.metricKey!=='string'||typeof block.bandKey!=='string')return null
 return registry.get(key)?.bands.get(`${block.metricKey}\0${block.bandKey}`)??null
}

export function ScaleReportArtworkHero({artworkKey:key}:{artworkKey?:string}){
 const artwork=key?registry.get(key)?.hero:null
 if(!artwork)return null
 return <figure className="my-4 w-full max-w-3xl">
  <a href={artwork.src} target="_blank" rel="noreferrer" className="block">
   <img src={artwork.src} alt={artwork.alt} width={artwork.width} height={artwork.height} loading="lazy" decoding="async" className="block h-auto w-full rounded-lg"/>
   <span className="mt-1 inline-block text-sm underline">查看插画大图</span>
  </a>
 </figure>
}

export function ScaleReportBandArtwork({artworkKey:key,block,children}:{artworkKey?:string;block:unknown;children:ReactNode}){
 const artwork=imageForBlock(key,block)
 if(!artwork)return <>{children}</>
 return <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
  {children}
  <img src={artwork.src} alt={artwork.alt} width={artwork.width} height={artwork.height} loading="lazy" decoding="async" className="h-auto w-40 max-w-full justify-self-center rounded-lg"/>
 </div>
}
