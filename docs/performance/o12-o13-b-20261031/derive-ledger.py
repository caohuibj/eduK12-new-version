"""Derive allocated-byte bookkeeping from retained originals; no DB replay."""
import pathlib,json,hashlib
root=pathlib.Path(__file__).resolve().parents[3]
source=root/'docs/performance/storage-ledger-20261028/lifecycle'
out=pathlib.Path(__file__).parent
originals={n:json.loads((source/n).read_text()) for n in ['legacy-r2.json','shared-compact-r2.json','comparison-r2.json']}
result={'schemaVersion':1,'kind':'derived_from_retained_originals_not_new_measurement','sourceHashes':{n:hashlib.sha256((source/n).read_bytes()).hexdigest() for n in originals},'modes':[],'unknown':['production flags and database size','heap free space/dead tuple/TOAST component breakdown','current production disk and pool utilization','backup compressed/encrypted bytes and actual retained versions','WAL archival/retention/replication physical occupancy','billing rates/discounts/region and retention duration']}
for name in ['legacy-r2.json','shared-compact-r2.json']:
 data=originals[name];assert data['completed'] and len(data['records'])==30
 snapshots=[]
 for snap in data['snapshots']:
  tables=[]
  for t in snap['tables']:
   values={k:int(t[k]) for k in ['rows','tableBytes','indexesBytes','relationBytes']}
   assert values['tableBytes']+values['indexesBytes']==values['relationBytes']
   tables.append({'table':t['table'],**values})
  snapshots.append({'label':snap['label'],'tables':tables,'totals':{k:sum(t[k] for t in tables) for k in ['tableBytes','indexesBytes','relationBytes']}})
 result['modes'].append({'mode':data['mode'],'flags':data['flags'],'snapshots':snapshots})
legacy,compact=result['modes']
assert legacy['snapshots'][0]['totals']==compact['snapshots'][0]['totals']
left={s['label']:s for s in legacy['snapshots']};right={s['label']:s for s in compact['snapshots']}
result['checkpointDeltaCompactMinusLegacy']=[{'label':label,**{k:right[label]['totals'][k]-left[label]['totals'][k] for k in ['tableBytes','indexesBytes','relationBytes']}} for label in left]
assert result['checkpointDeltaCompactMinusLegacy'][-1]['tableBytes']==-565248
assert result['checkpointDeltaCompactMinusLegacy'][-1]['indexesBytes']==73728
assert result['checkpointDeltaCompactMinusLegacy'][-1]['relationBytes']==-491520
result['finalPerTableDelta']=[{'table':a['table'],**{k:b[k]-a[k] for k in ['rows','tableBytes','indexesBytes','relationBytes']}} for a,b in zip(legacy['snapshots'][-1]['tables'],compact['snapshots'][-1]['tables'],strict=True)]
assert all(a['table']==b['table'] for a,b in zip(legacy['snapshots'][-1]['tables'],compact['snapshots'][-1]['tables'],strict=True))
(out/'ledger-derived.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result['checkpointDeltaCompactMinusLegacy']))
