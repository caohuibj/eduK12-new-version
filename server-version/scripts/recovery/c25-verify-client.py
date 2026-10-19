#!/usr/bin/env python3
"""Verify existing generated Prisma bytes without generating or connecting to DB.
This is current-artifact verification, never reconstructed generation provenance.
"""
import argparse, hashlib, importlib.util, json, os, re, subprocess, sys
from pathlib import Path
sys.dont_write_bytecode=True
BASE=Path(__file__).resolve().parent

def python_helper_closure(base=BASE):
    # Capture before loading the transitive C23/C21/C20/C19/C18/C16 helpers.
    entries={}
    for file in sorted(base.rglob('*.py')):
        assert file.is_file() and not file.is_symlink(), 'Python helper must be a regular source file'
        entries[str(file.relative_to(base))]={'realpath':str(file.resolve()),'mode':file.stat().st_mode&0o777,
                                             'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
    return entries

IMPORTED_PYTHON_HELPERS=python_helper_closure()

def unchanged_python_helpers(expected, base=BASE):
    current=python_helper_closure(base)
    assert current==expected, 'consumed Python helper closure changed'
    return current

def python_identity():
    executable=Path(sys.executable).resolve()
    return {'realpath':str(executable),'sha256':hashlib.sha256(executable.read_bytes()).hexdigest(),
            'version':sys.version}

spec=importlib.util.spec_from_file_location('c25_client_db',BASE/'c23-checkpoint-db.py')
db=importlib.util.module_from_spec(spec);spec.loader.exec_module(db)

def closure(backend,subdirectory):
    entries={}
    for directory,dirs,files in os.walk(backend/subdirectory,followlinks=True):
        dirs[:]=sorted(d for d in dirs if d not in ['.cache','.vite','.vite-temp'])
        for name in sorted(files):
            f=Path(directory)/name
            if f.is_file():entries[str(f.relative_to(backend))]={'realpath':str(f.resolve()),'sha256':db.sha_file(f)}
    return entries

REVIEWED_FORMATTING_PAIR=('2a753ccecd230abc8f4d468cf8ccc7a5313b0bdc6ba25a59620076b9db6a072e','3d13a0c9584a9797360c725f42d376f35603f79ec7909990b7dd18d580e814d3')
COMPILER_FILES=('node_modules/typescript/bin/tsc','node_modules/typescript/lib/_tsc.js','node_modules/typescript/package.json')


def schema_tokens(text):
    # String literals are single opaque tokens: spaces, escapes and comment-like
    # text INSIDE strings are retained. No identifier/argument/field sorting.
    return [token for token in re.findall(r'"(?:\\.|[^"\\])*"|//[^\n]*|/\*[\s\S]*?\*/|[A-Za-z_][A-Za-z_0-9]*|[0-9]+|[^\s]', text)
            if not token.startswith(('//','/*'))]


def reviewed_source_tokens(source):
    """Five exact local moves in three exact models, never generic sorting."""
    raw = schema_tokens(source)
    def change_model(name, replacements):
        header = ['model', name, '{']
        starts = [i for i in range(len(raw)-2) if raw[i:i+3] == header]
        assert len(starts) == 1, 'reviewed model absent or duplicated: ' + name
        start = starts[0]+3
        end = raw.index('}', start)
        body = raw[start:end]
        for old_text, new_text in replacements:
            old, new = schema_tokens(old_text), schema_tokens(new_text)
            positions = [i for i in range(len(body)-len(old)+1) if body[i:i+len(old)] == old]
            assert len(positions) == 1, 'reviewed attribute block changed: ' + name
            i = positions[0]
            body[i:i+len(old)] = new
        raw[start:end] = body
    change_model('CompositeAssessmentAccessToken', [(
        '@@map("composite_assessment_access_tokens") @@index([trainingRoundId])',
        '@@index([trainingRoundId]) @@map("composite_assessment_access_tokens")')])
    indexes = '@@index([instrumentKey, instrumentVersion, participantKey, attemptNo]) @@index([userId, status]) @@index([participantKey, status]) @@index([instrumentKey, instrumentVersion, status]) @@index([compositeAttemptId, status])'
    unique = '@@unique([compositeAttemptId, compositeItemId], map: "situational_attempts_composite_item_key")'
    change_model('SituationalAttempt', [(indexes+' '+unique, unique+' '+indexes)])
    changes = []
    for field, mapping, prefix in [('createdAt','created_at','DateTime @default(now())'),
                                    ('activatedAt','activated_at','DateTime?'),
                                    ('retiredAt','retired_at','DateTime?')]:
        changes.append((field+' '+prefix+' @db.Timestamptz(6) @map("'+mapping+'")',
                        field+' '+prefix+' @map("'+mapping+'") @db.Timestamptz(6)'))
    change_model('ScaleDeploymentPolicy', changes)
    return raw


def schema_agreement(backend):
    source=backend/'prisma/schema.prisma';generated=backend/'node_modules/.prisma/client/schema.prisma'
    pair=(db.sha_file(source),db.sha_file(generated))
    assert pair==REVIEWED_FORMATTING_PAIR, 'schema bytes differ outside the exact reviewed C25 formatting pair'
    assert reviewed_source_tokens(source.read_text())==schema_tokens(generated.read_text()), 'unreviewed schema token difference'
    return {'sourceSchemaSha256':pair[0],'generatedSchemaSha256':pair[1],
        'generatedClientSha256':db.sha_file(generated.parent/'index.js'),'schemaTokensMatch':True,
        'exactSchemaBytes':False,'verificationPolicy':'EXISTING_CLIENT_CURRENT_BYTES_ONLY',
        'normalization':'EXACT_C25_HASH_PAIR_AND_FIVE_LOCAL_ATTRIBUTE_MOVES: only whitespace/comments plus the five exact reviewed moves; generator/config/string/argument/field-order tokens retained',
        'reviewedFormattingDifferences':['CompositeAssessmentAccessToken: exact @@map/@@index([trainingRoundId]) move',
            'SituationalAttempt: exact composite-item @@unique before the unchanged five indexes',
            'ScaleDeploymentPolicy: createdAt/activatedAt/retiredAt exact @map/@db.Timestamptz order']}

def inspect_metadata(schema,index,versions):
    literal=r'("(?:\\.|[^"\\])*")'
    inline=json.loads(re.search(r'^  "inlineSchema":\s*'+literal,index,re.M).group(1))
    assert inline==schema, 'client inline schema differs from generated schema'
    runtime=json.loads(json.loads(re.search(r'^config\.runtimeDataModel = JSON\.parse\('+literal+r'\)',index,re.M).group(1)))
    models={name:body for name,body in re.findall(r'^model\s+(\w+)\s*\{(.*?)^\}',schema,re.M|re.S)}
    enum_bodies=dict(re.findall(r'^enum\s+(\w+)\s*\{(.*?)^\}',schema,re.M|re.S));enums=set(enum_bodies)
    assert set(models)==set(runtime['models']) and enums==set(runtime['enums'])
    def read_mapping(body,model=False):
        found=re.search((r'^\s*@@map' if model else r'@map')+r'\('+literal+r'\)',body,re.M)
        return json.loads(found.group(1)) if found else None
    for name,body in enum_bodies.items():
        values=[]
        for line in body.splitlines():
            match=re.match(r'^\s*(\w+)(?:\s+|$)(.*)',line)
            if match:values.append({'name':match.group(1),'dbName':read_mapping(match.group(2))})
        assert runtime['enums'][name]['values']==values and runtime['enums'][name].get('dbName')==read_mapping(body,True),name+': enum values/mappings differ'
    fields=0
    for name,body in models.items():
        assert runtime['models'][name].get('dbName')==read_mapping(body,True),name+': model table mapping differs'
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
            'runtimeDataModelSha256':db.digest(runtime),'inlineSchemaExact':True,'runtimeFieldMetadataMatches':True,'modelMappingsMatch':True,'enumValuesAndMappingsMatch':True}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backend',type=Path,required=True);parser.add_argument('--node',type=Path,required=True)
    parser.add_argument('--expected-head',required=True);parser.add_argument('--receipt',type=Path,required=True)
    a=parser.parse_args();os.umask(0o077);backend=a.backend.resolve();repo=backend.parents[1]
    assert not a.receipt.exists() and not a.receipt.is_symlink();assert re.fullmatch('[a-f0-9]{40}',a.expected_head)
    receipt_path=a.receipt.resolve();assert repo not in receipt_path.parents and receipt_path!=repo
    assert all(not part.is_symlink() for part in [a.receipt,*a.receipt.parents]), 'receipt symlink ancestor'
    def clean_helper_sources():
        assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==a.expected_head
        paths=['server-version/scripts/recovery']
        assert subprocess.run(['git','diff','--quiet','HEAD','--',*paths],cwd=repo).returncode==0, 'commit recovery helpers before verifying client'
        assert not subprocess.check_output(['git','ls-files','--others','--exclude-standard','--',*paths],cwd=repo).strip(), 'untracked recovery helper source'
    clean_helper_sources()
    python_helpers=unchanged_python_helpers(IMPORTED_PYTHON_HELPERS)
    python_before=python_identity()
    assert subprocess.check_output([a.node,'--version'],text=True).strip()=='v24.21.0'
    node_before=db.sha_file(a.node);tool_before=db.sha_file(Path(__file__))
    inputs={name:db.sha_file(backend/name) for name in ['prisma/schema.prisma','package.json','package-lock.json','tsconfig.json']}
    compiler={name:db.sha_file(backend/name) for name in COMPILER_FILES}
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
    assert {name:db.sha_file(backend/name) for name in COMPILER_FILES}==compiler
    assert {name:db.sha_file(backend/name) for name in inputs}==inputs
    assert db.sha_file(a.node)==node_before and db.sha_file(Path(__file__))==tool_before
    clean_helper_sources();unchanged_python_helpers(python_helpers)
    assert python_identity()==python_before, 'Python verifier executable changed'
    result={'scope':'EXISTING_GENERATED_CLIENT_VERIFIED_NOT_GENERATION_PROVENANCE','passed':True,
            'head':a.expected_head,'nodeVersion':'v24.21.0','nodeSha256':db.sha_file(a.node),
            'python':python_before,'pythonUnchanged':True,
            'verificationToolSha256':db.sha_file(Path(__file__)),'pythonHelperClosure':python_helpers,'pythonHelpersUnchanged':True,'inputs':inputs,'client':client,'dependencies':dependencies,'compiler':compiler,'compilerUnchanged':True,
            'inputsUnchanged':True,'clientUnchanged':True,'dependenciesUnchanged':True,
            'schemaAgreement':matched,'runtimeMetadata':metadata,'installedNativeEngineMatches':True,
            'steps':[{'name':'verify-existing-prisma-client','exitCode':0}],
            'limitations':['No generation was rerun. This receipt does not establish historical generation inputs or before/after bytes.',
                           'Metadata consistency and frozen current bytes are verified; actual database behavior requires the separate PG/HTTP qualification.']}
    # A receipt must be outside source/dependencies and is written exactly once.
    a.receipt.parent.mkdir(parents=True,exist_ok=True)
    with a.receipt.open('x') as handle: json.dump(result,handle,indent=2)
    print(json.dumps({'scope':result['scope'],'receiptSha256':db.sha_file(a.receipt),'clientFiles':len(client),'dependencyFiles':len(dependencies),'metadata':metadata}))

if __name__=='__main__':main()
