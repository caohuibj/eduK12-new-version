import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { defineScaleInstrumentSource } from '../../modules/scale/onboarding/define-instrument'
import { freezeScaleAxisSnapshot } from '../../modules/scale/onboarding/axis-snapshots'
import type { ScaleInstrumentSourceV1 } from '../../modules/scale/onboarding/types'
const root=path.resolve(process.cwd(),'../..')
const audit=JSON.parse(fs.readFileSync(path.join(root,'docs/scale-instruments/taxonomy/catalog-revision-2/applied-source-mapping.json'),'utf8')) as {packages:Array<{identity:{instrumentKey:string;instrumentVersion:string};sourcePath:string;oldManifestVersion:number;newManifestVersion:number;oldTags:string[];newTags:string[];beforeSourceCanonicalHash:string;afterSourceCanonicalHash:string;unchangedContentCanonicalHash:string;measurementHash:string;reportVersion:string;localizationVersion:string}>}
const strip=(source:ScaleInstrumentSourceV1)=>{const x=structuredClone(source) as unknown as {catalog:{catalogManifestVersion?:number;construct:{constructOverlapTags?:string[]}}};delete x.catalog.catalogManifestVersion;delete x.catalog.construct.constructOverlapTags;return x}
const safe=(s:ScaleInstrumentSourceV1)=>({...s,executable:{...s.executable,scorerPlugins:[]}})
for(const row of audit.packages)describe(row.identity.instrumentKey+' catalog-only revision',()=>{
 const source=JSON.parse(fs.readFileSync(path.join(root,row.sourcePath),'utf8')) as ScaleInstrumentSourceV1
 const old=structuredClone(source);old.catalog.catalogManifestVersion=row.oldManifestVersion;old.catalog.construct.constructOverlapTags=row.oldTags
 it('changes only tags and the monotonic catalog axis, never C/P/R/localization',()=>{expect(()=>defineScaleInstrumentSource(source)).not.toThrow();expect(source.catalog.catalogManifestVersion).toBe(row.oldManifestVersion+1);expect(canonicalHash(source)).toBe(row.afterSourceCanonicalHash);expect(canonicalHash(old)).toBe(row.beforeSourceCanonicalHash);expect(canonicalHash(strip(source))).toBe(row.unchangedContentCanonicalHash);expect(canonicalHash(strip(old))).toBe(row.unchangedContentCanonicalHash);expect(source.executable).toEqual(old.executable);expect(hashScaleDefinition(source.executable!.definition)).toBe(row.measurementHash);expect(source.executable!.definition.report.reportVersion).toBe(row.reportVersion);expect(source.localization!.localizationVersion).toBe(row.localizationVersion)})
 it('retains every old tag and adds complete namespaced tags without false therapy claims',()=>{expect(source.catalog.construct.constructOverlapTags).toEqual(row.newTags);expect(new Set(row.newTags).size).toBe(row.newTags.length);for(const tag of row.oldTags)expect(row.newTags).toContain(tag);for(const axis of ['domain','construct','population','response','use','license','language_validation'])expect(row.newTags.some(t=>t.startsWith(axis+':'))).toBe(true);expect(row.newTags.some(t=>t.startsWith('orientation:'))).toBe(false);if(row.identity.instrumentKey==='gse3_asku_zh_cn_research')expect(row.newTags).toContain('非商业')})
 it('existing freeze function retains old snapshot, creates distinct catalog axis and rejects unversioned overwrite',async()=>{
  const snapshots=new Map<string,{sourceHash:string;axes:unknown;source:unknown}>()
  const db={ $executeRaw:async(query:{values:unknown[]})=>{const v=query.values;const key=String(v[1]);if(!snapshots.has(key))snapshots.set(key,{sourceHash:String(v[2]),axes:JSON.parse(String(v[3])),source:JSON.parse(String(v[4]))});return 1},$queryRaw:async(query:{values:unknown[]})=>{const x=snapshots.get(String(query.values[1]));return x?[{source_hash:x.sourceHash}]:[]}} as unknown as Parameters<typeof freezeScaleAxisSnapshot>[0]
  await freezeScaleAxisSnapshot(db,'synthetic-only',old);const prior=[...snapshots.values()][0];await freezeScaleAxisSnapshot(db,'synthetic-only',source);expect(snapshots.size).toBe(2);expect([...snapshots.values()][0]).toEqual(prior);expect(prior.sourceHash).toBe(canonicalHash(safe(old)));expect([...snapshots.values()][1].sourceHash).toBe(canonicalHash(safe(source)));await freezeScaleAxisSnapshot(db,'synthetic-only',source);expect(snapshots.size).toBe(2)
  const bad=structuredClone(source);bad.catalog.catalogManifestVersion=old.catalog.catalogManifestVersion;await expect(freezeScaleAxisSnapshot(db,'synthetic-only',bad)).rejects.toThrow('SCALE_AXIS_VERSION_CONTENT_CONFLICT')
 })
})
