import {AssessmentMaterialPicker,type MaterialLibraryProvider} from '../modules/assessment-media/AssessmentMaterialPicker'
import {toolLibraryApi as api} from './tool-library-api'
import type {AssessmentMaterial} from '../modules/assessment-media/material'
const provider:MaterialLibraryProvider={appearance:'survey',manageHref:'/workspace/media',loadContent:(asset,signal)=>fetch('/api/survey/media-library/'+encodeURIComponent(asset.assetId)+'/content',{credentials:'same-origin',cache:'no-store',signal}),note:'仅列出你可复用的私有素材；随授权量表提供的附件仍限原量表使用。',load:({kind,page})=>api('/media-library?source=owned&kind='+kind+'&page='+page)}
export function SurveyMaterialPicker(props:{value?:AssessmentMaterial[];onChange:(items:AssessmentMaterial[])=>void;label?:string}){return <AssessmentMaterialPicker {...props} provider={provider}/>}
