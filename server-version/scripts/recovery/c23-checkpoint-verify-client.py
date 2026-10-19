#!/usr/bin/env python3
"""Verify existing generated Prisma bytes without generating or connecting to DB.
This is current-artifact verification, never reconstructed generation provenance.
"""
import argparse, importlib.util, json, os, re, subprocess, sys
from pathlib import Path
sys.dont_write_bytecode=True
BASE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('c23_client_db',BASE/'c23-checkpoint-db.py')
db=importlib.util.module_from_spec(spec);spec.loader.exec_module(db)

def closure(backend,subdirectory):
    entries={}
    for directory,dirs,files in os.walk(backend/subdirectory,followlinks=True):
        dirs[:]=sorted(d for d in dirs if d not in ['.cache','.vite','.vite-temp'])
        for name in sorted(files):
            f=Path(directory)/name
            if f.is_file():entries[str(f.relative_to(backend))]={'realpath':str(f.resolve()),'sha256':db.sha_file(f)}
    return entries

REVIEWED_FORMATTING_PAIR=('4ce65dad2773c956c79c2fb56d3d74c50c28430a01e0b131a5e796db2a14244b','c1fbc3dfe259197ce8c14b523c9f0831a7d8a895a81a54ef862093846a490339')

def schema_agreement(backend):
    source=backend/'prisma/schema.prisma';generated=backend/'node_modules/.prisma/client/schema.prisma'
    pair=(db.sha_file(source),db.sha_file(generated))
    exact=pair[0]==pair[1]
    assert exact or pair==REVIEWED_FORMATTING_PAIR, 'schema bytes differ outside the exact reviewed C23 formatting pair'
    agreement=db.fresh_prisma(backend)
    agreement.pop('generationPolicy',None)
    agreement.update(exactSchemaBytes=exact,verificationPolicy='EXISTING_CLIENT_CURRENT_BYTES_ONLY',
        normalization='NONE' if exact else 'EXACT_C23_HASH_PAIR: whitespace/comments and independent attribute ordering only; all generator/config tokens, identifiers, field order and arguments retained',
        reviewedFormattingDifferences=[] if exact else ['CompositeAssessmentAccessToken model @@map/@@index order',
          'SituationalAttempt model @@unique/@@index order','ScaleDeploymentPolicy createdAt/activatedAt/retiredAt @map/@db.Timestamptz order'])
    return agreement

def inspect_metadata(schema,index,versions):
    literal=r'("(?:\\.|[^"\\])*")'
    inline=json.loads(re.search(r'^  "inlineSchema":\s*'+literal,index,re.M).group(1))
    assert inline==schema, 'client inline schema differs from generated schema'
    runtime=json.loads(json.loads(re.search(r'^config\.runtimeDataModel = JSON\.parse\('+literal+r'\)',index,re.M).group(1)))
    models={name:body for name,body in re.findall(r'^model\s+(\w+)\s*\{(.*?)^\}',schema,re.M|re.S)}
    enums={name for name in re.findall(r'^enum\s+(\w+)\s*\{',schema,re.M)}
    assert set(models)==set(runtime['models']) and enums==set(runtime['enums'])
    fields=0
    for name,body in models.items():
        expected=[]
        for line in body.splitlines():
            field=re.match(r'^\s*(\w+)\s+([A-Za-z_]\w*)(\[\]|\?)?(?:\s+|$)(.*)',line)
            if not field:continue
            key,typ,modifier,attrs=field.groups()
            mapping=re.search(r'@map\("([^"\\]+)"\)',attrs)
            expected.append({'name':key,'type':typ,'isList':modifier=='[]','isRequired':modifier!='?',
                             'kind':'object' if typ in models else 'enum' if typ in enums else 'scalar',
                             'dbName':mapping.group(1) if mapping else None})
        actual=[{k:f.get(k) for k in ['name','type','isList','isRequired','kind','dbName']} for f in runtime['models'][name]['fields']]
        assert actual==expected, name+': generated runtime field metadata differs from embedded schema'
        fields+=len(expected)
    client_version=re.search(r'"clientVersion":\s*"([^"\n]+)"',index).group(1)
    engine_version=re.search(r'"engineVersion":\s*"([^"\n]+)"',index).group(1)
    assert client_version==versions['prisma']==versions['@prisma/client']==versions['@prisma/engines']
    assert engine_version==versions['engineCommit']
    return {'models':len(models),'enums':len(enums),'fields':fields,'clientVersion':client_version,'engineVersion':engine_version,
            'inlineSchemaSha256':__import__('hashlib').sha256(inline.encode()).hexdigest(),
            'runtimeDataModelSha256':db.digest(runtime),'inlineSchemaExact':True,'runtimeFieldMetadataMatches':True}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backend',type=Path,required=True);parser.add_argument('--node',type=Path,required=True)
    parser.add_argument('--expected-head',required=True);parser.add_argument('--receipt',type=Path,required=True)
    a=parser.parse_args();os.umask(0o077);backend=a.backend.resolve();repo=backend.parents[1]
    assert not a.receipt.exists();assert re.fullmatch('[a-f0-9]{40}',a.expected_head)
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==a.expected_head
    assert subprocess.check_output([a.node,'--version'],text=True).strip()=='v24.21.0'
    node_before=db.sha_file(a.node);tool_before=db.sha_file(Path(__file__))
    inputs={name:db.sha_file(backend/name) for name in ['prisma/schema.prisma','package.json','package-lock.json']}
    dependencies=closure(backend,'node_modules');client={path:entry['sha256'] for path,entry in dependencies.items() if path.startswith('node_modules/.prisma/client/')}
    assert client and dependencies
    versions={name:json.loads((backend/'node_modules'/name/'package.json').read_text())['version'] for name in ['prisma','@prisma/client','@prisma/engines']}
    versions['engineCommit']=json.loads((backend/'node_modules/@prisma/engines-version/package.json').read_text())['prisma']['enginesVersion']
    matched=schema_agreement(backend)
    generated=backend/'node_modules/.prisma/client'
    metadata=inspect_metadata((generated/'schema.prisma').read_text(),(generated/'index.js').read_text(),versions)
    # The local native engine delivered by generation must equal installed official Prisma engine bytes.
    engines=list(generated.glob('libquery_engine-*.so.node'));assert len(engines)==1
    installed=backend/'node_modules/@prisma/engines'/engines[0].name
    assert db.sha_file(engines[0])==db.sha_file(installed), 'generated and installed native engine differ'
    assert closure(backend,'node_modules')==dependencies
    assert {name:db.sha_file(backend/name) for name in inputs}==inputs
    assert db.sha_file(a.node)==node_before and db.sha_file(Path(__file__))==tool_before
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==a.expected_head
    result={'scope':'EXISTING_GENERATED_CLIENT_VERIFIED_NOT_GENERATION_PROVENANCE','passed':True,
            'head':a.expected_head,'nodeVersion':'v24.21.0','nodeSha256':db.sha_file(a.node),
            'verificationToolSha256':db.sha_file(Path(__file__)),'inputs':inputs,'client':client,'dependencies':dependencies,
            'inputsUnchanged':True,'clientUnchanged':True,'dependenciesUnchanged':True,
            'schemaAgreement':matched,'runtimeMetadata':metadata,'installedNativeEngineMatches':True,
            'steps':[{'name':'verify-existing-prisma-client','exitCode':0}],
            'limitations':['No generation was rerun. This receipt does not establish historical generation inputs or before/after bytes.',
                           'Metadata consistency and frozen current bytes are verified; actual database behavior requires the separate PG/HTTP qualification.']}
    a.receipt.parent.mkdir(parents=True,exist_ok=True);a.receipt.write_text(json.dumps(result,indent=2))
    print(json.dumps({'scope':result['scope'],'receiptSha256':db.sha_file(a.receipt),'clientFiles':len(client),'dependencyFiles':len(dependencies),'metadata':metadata}))

if __name__=='__main__':main()
