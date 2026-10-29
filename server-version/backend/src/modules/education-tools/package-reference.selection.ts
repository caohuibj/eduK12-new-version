import type {TrainingContentSnapshot} from '../composite/training-content-binding'
import {canonicalHash} from '../assessment-runtime/canonical'
/** The original whole source owns P/R choices, priorities and explicit absence. */
export function fixedEducationPackageSelection(snapshot:TrainingContentSnapshot){return {
 references:{schemaVersion:1 as const,units:snapshot.units.map(unit=>({itemId:unit.itemId,
  choices:(unit.referencePolicy?.choices??[]).map(({releaseId,entryKey,priority})=>({releaseId,entryKey,priority}))}))},
 reports:snapshot.units.flatMap(unit=>unit.report?[{itemId:unit.itemId,releaseId:unit.report.releaseId}]:[]),
}}
export function preservesEducationPackageSelection(snapshot:TrainingContentSnapshot,selection:ReturnType<typeof fixedEducationPackageSelection>){
 const fixed=fixedEducationPackageSelection(snapshot)
 // An absent source report may receive a separately authorized target-audience
 // report through existing registration. It does not replace the Bundle report.
 return canonicalHash(fixed.references)===canonicalHash(selection.references)
  &&fixed.reports.every(original=>selection.reports.some(report=>report.itemId===original.itemId&&report.releaseId===original.releaseId))
}
