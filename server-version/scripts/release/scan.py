import json,subprocess
from pathlib import Path
images=json.loads(Path('release-images.json').read_text());p=json.loads(Path('release-plan.json').read_text());scans={}
for c,i in images.items():
    file='release-scan-'+c+'.json'
    subprocess.run(['trivy','image','--exit-code','1','--ignore-unfixed','--scanners','vuln','--severity','HIGH,CRITICAL','--format','json','--output',file,i],check=True,timeout=600)
    scans[c]={'image':i,'report':file,'status':'success'}
Path('release-scans.json').write_text(json.dumps(scans,indent=2))
