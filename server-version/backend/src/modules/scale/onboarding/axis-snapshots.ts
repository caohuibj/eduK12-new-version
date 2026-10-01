import { Prisma, type PrismaClient } from '@prisma/client'
import { canonicalHash } from '../../assessment-runtime/canonical'
import { referenceSetHash } from '../../assessment-runtime/reference-binding'
import { hashScaleDefinition, scaleDefinitionSchema, type ScaleDefinitionV2 } from '../scale-definition'
import type { ScaleInstrumentSourceV1 } from './types'
const newer=(a:string,b:string)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);return x.some((n,i)=>n>y[i] && x.slice(0,i).every((v,j)=>v===y[j]))}
/** Only explicitly versioned report/reference revisions may retain measurement identity. */
export function allowsScaleAxisRevision(previous:unknown,next:ScaleDefinitionV2):boolean {
 const parsed=scaleDefinitionSchema.safeParse(previous)
 if(!parsed.success || !parsed.data.versionAxes || !next.versionAxes) return false
 const old=parsed.data
 if(hashScaleDefinition(old)!==hashScaleDefinition(next)) return false
 const stripped=(d:ScaleDefinitionV2)=>{const {report,referencePolicy,...measurement}=d;return measurement}
 if(canonicalHash(stripped(old))!==canonicalHash(stripped(next)))return false
 if(canonicalHash(old.report)!==canonicalHash(next.report) && !newer(next.report.reportVersion,old.report.reportVersion))return false
 if(canonicalHash(old.referencePolicy)!==canonicalHash(next.referencePolicy)) {
  if(old.referencePolicy.type!=='declared' || next.referencePolicy.type!=='declared')return false
  const oldVersions=new Set(old.referencePolicy.selections.map(s=>s.referenceVersion))
  if(next.referencePolicy.selections.some(s=>oldVersions.has(s.referenceVersion)))return false
 }
 return true
}
export async function freezeScaleAxisSnapshot(db:PrismaClient|Prisma.TransactionClient,scaleId:string,source:ScaleInstrumentSourceV1) {
 const e=source.executable!,d=e.definition
 if(!d.versionAxes)return
 const axes={instrumentVersion:source.identity.instrumentVersion,measurementHash:hashScaleDefinition(d),scoringVersion:d.scoring.scoringVersion,reportVersion:d.report.reportVersion,referenceVersions:e.references.map(r=>({version:r.referenceVersion,hash:referenceSetHash(r)})),localizationVersion:source.localization!.localizationVersion,catalogManifestVersion:source.catalog.catalogManifestVersion}
 const safeSource={...source,executable:{...e,scorerPlugins:(e.scorerPlugins??[]).map(p=>({key:p.key,version:p.version}))}},sourceHash=canonicalHash(safeSource),axisHash=canonicalHash(axes)
 await db.$executeRaw(Prisma.sql`INSERT INTO scale_axis_snapshots(scale_id,axis_hash,source_hash,axes,source_snapshot) VALUES (${scaleId},${axisHash},${sourceHash},${JSON.stringify(axes)}::jsonb,${JSON.stringify(safeSource)}::jsonb) ON CONFLICT (scale_id,axis_hash) DO NOTHING`)
 const rows=await db.$queryRaw<Array<{source_hash:string}>>(Prisma.sql`SELECT source_hash FROM scale_axis_snapshots WHERE scale_id=${scaleId} AND axis_hash=${axisHash}`)
 if(rows[0]?.source_hash!==sourceHash)throw new Error('SCALE_AXIS_VERSION_CONTENT_CONFLICT')
}
