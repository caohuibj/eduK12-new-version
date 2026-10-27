from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[6]
backend=root/'server-version/backend/src/modules/cognitive/content-candidates/voice-emotion-cues'
frontend=root/'server-version/frontend/src/modules/cognitive/tasks/voice-emotion-cues/generated'
frontend.mkdir(parents=True,exist_ok=True)
records=[]
for name in ['protocol.ts','materials.ts','report.ts']:
 data=(backend/name).read_bytes();(frontend/name).write_bytes(data)
 records.append({'backend':str((backend/name).relative_to(root)),'frontend':str((frontend/name).relative_to(root)),'sha256':hashlib.sha256(data).hexdigest()})
(Path(__file__).parent/'browser-model-sources.json').write_text(json.dumps(records,indent=2)+'\n')
print(json.dumps(records))
