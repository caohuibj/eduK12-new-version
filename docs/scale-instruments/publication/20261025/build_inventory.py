#!/usr/bin/env python3
"""只读 Git 快照与成功回执，输出无题文的公开交接清单（Python 标准库）。"""
import argparse,csv,hashlib,json,pathlib,re,subprocess
p=argparse.ArgumentParser();p.add_argument('--repo',required=True);p.add_argument('--base',required=True);p.add_argument('--head',required=True);p.add_argument('--receipts',required=True);p.add_argument('--out',required=True);a=p.parse_args()
def git(*args):return subprocess.check_output(['git','-C',a.repo,*args])
head=git('rev-parse',a.head).decode().strip();base=git('rev-parse',a.base).decode().strip();tree=git('rev-parse',head+'^{tree}').decode().strip()
paths=git('ls-tree','-r','--name-only',head).decode().splitlines();pset=set(paths)
added=git('diff','--name-only','--diff-filter=A',base,head).decode().splitlines()
def read(path):return git('show',head+':'+path)
def urls(text):return sorted(set(u.rstrip('.,;，。；') for u in re.findall(r'https?://[^\s<>"\)\]]+',text)))
records=[]
for path in added:
 if not path.startswith('server-version/backend/src/modules/scale/instruments/') or not path.endswith('/source.json'):continue
 raw=read(path);x=json.loads(raw);e=x['executable'];d=e['definition'];c=x['catalog'];identity=x['identity'];key=identity['instrumentKey'];v=identity['instrumentVersion'];subject=d['versionAxes']['subjectKey']
 candidates=[f'docs/scale-instruments/research-drafts/{k}/{v}' for k in (key,subject)]
 doc=next((z for z in candidates if any(q.startswith(z+'/') for q in paths)),None)
 if doc is None:raise ValueError('Missing document folder: '+key)
 docs=[q for q in paths if q.startswith(doc+'/')]
 refs=[q for q in docs if q.endswith('references.md')]
 parameters=[q for q in docs if any(s in q.rsplit('/',1)[-1] for s in ('scoring','threshold','reference-dossier','source-pack')) and not 'historical' in q]
 tags=c['construct'].get('constructOverlapTags',[])
 scores=[]
 for s in d['scoring']['scores']:
  src=s.get('source',{});scores.append({'key':s['key'],'label':s.get('label'),'type':s.get('type'),'itemCount':len(src['items']) if 'items' in src else None,'aggregation':src.get('aggregation'),'direction':s.get('direction')})
 rights=x.get('usageRequirements',{});allowed=rights.get('allowedCommercialNatures',[])
 record={**identity,'subjectKey':subject,'displayTitle':c['identity']['canonicalName'],'sourcePath':path,'sourceSha256':hashlib.sha256(raw).hexdigest(),'primaryDomain':c['construct']['primaryDomain'],'constructDefinition':c['construct'].get('constructDefinition'),'tags':tags,'itemCount':len(d['items']),'declaredItemCount':c['administration']['itemCount'],'scores':scores,'population':c['population'],'languageEvidence':x.get('localization',{}),'license':d.get('license',{}),'allowedCommercialNatures':allowed,'noncommercialOnly':allowed==['NON_COMMERCIAL'],'noncommercialTagPresent':'非商业' in tags,'usageNotes':rights.get('notes',[]),'reportVersion':d.get('report',{}).get('reportVersion'),'catalogManifestVersion':c.get('catalogManifestVersion'),'scoringVersion':d['scoring'].get('scoringVersion'),'declaredReleaseStatus':e.get('releaseStatus'),'intendedLibraryVisibility':'HIDDEN','sourceReferenceCount':len(e.get('references',[])),'referencePolicy':d.get('referencePolicy'),'runtimeReferenceActivation':'NOT_CLAIMED','documentDirectory':doc,'referenceDocuments':refs,'parameterDocuments':parameters or refs,'sourceParameterLocations':[path+'#/executable/definition/scoring',path+'#/executable/definition/referencePolicy'],'parameterDocumentationNote':'独立参数档案与运行源计分均需核对；没有经验阈值不意味着资料遗漏。','reportExampleDocuments':[q for q in docs if 'report-example' in q],'referenceLinks':urls(json.dumps(d.get('source',{}),ensure_ascii=False)+'\n'+ '\n'.join(read(q).decode() for q in refs))}
 assert record['itemCount']==record['declaredItemCount'];assert record['declaredReleaseStatus']=='DRAFT';records.append(record)
holds=[]
reasons={'phq9':'静态安全说明尚不能覆盖开始、作答、中断、缺失及不可用报告路径。','pcl5':'原版不计分最严重事件字段尚无完整施测支持。','pc_ptsd5':'原始门控、跳题及否→0语义与旧答案排除尚未完整支持。'}
for path in added:
 if path.endswith('/runtime-hold.md'):
  key=path.split('/')[-3];holds.append({'documentKey':key,'status':'DOCUMENTATION_ONLY_HOLD','executable':False,'runtimeHoldDocument':path,'reason':reasons.get(key,'见公开阻碍说明')})
ledger=[]
root=pathlib.Path(a.receipts)
receiptpaths=sorted([q for q in root.rglob('*.json') if q.name in ('push-receipt.json','receipt.json')],key=lambda q:0 if q.parent==root else int(re.sub(r'\D','',q.parent.name) or 999))
prevlocal=base
for rp in receiptpaths:
 r=json.loads(rp.read_text());lh=r.get('localHead');rh=r.get('remoteHead');t=r.get('tree');verification=r.get('verification',{})
 if not all((lh,rh,t)):continue
 success=r.get('gitLsRemoteVerified') or r.get('lsRemoteReadback') or (isinstance(verification,dict) and verification.get('gitHubCommitTree')) or (isinstance(verification,list) and any(z.get('data',{}).get('sha')==rh and z.get('data',{}).get('tree',{}).get('sha')==t for z in verification))
 if not success:continue
 if subprocess.run(['git','-C',a.repo,'merge-base','--is-ancestor',lh,head],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode != 0:continue
 localtree=git('rev-parse',lh+'^{tree}').decode().strip();assert localtree==t
 stamp=r.get('verifiedAt');remoteparent=r.get('remoteParent');dateSource='verifiedAt' if stamp else None
 if isinstance(verification,list):
  commit=next((z['data'] for z in verification if z.get('data',{}).get('sha')==rh and 'tree' in z.get('data',{})),{})
  if not stamp:stamp=commit.get('committer',{}).get('date');dateSource='remoteCommitDate' if stamp else None
 if not remoteparent:
  # First receipt replays a commit chain: recover actual last-commit parent from verified mapping.
  mapping=r.get('mapping',[]);remoteparent=mapping[-2]['remoteSha'] if len(mapping)>1 else r.get('base')
 scope=git('diff','--name-only',r.get('localBase',prevlocal),lh).decode().splitlines()
 newsource=[q for q in scope if q.endswith('/source.json') and q in added]
 ledger.append({'batch':len(ledger)+1,'localHead':lh,'localTree':localtree,'remoteHead':rh,'remoteParent':remoteparent,'remoteTree':t,'date':stamp,'dateEvidence':dateSource,'scope':{'changedFileCount':len(scope),'sourcePackagesTouched':[q.split('/')[-3]+'/'+q.split('/')[-2] for q in newsource],'publicDocumentationChanged':any(q.startswith('docs/') for q in scope)},'treeMatch':True,'ciRun':False})
 prevlocal=lh
out=pathlib.Path(a.out);out.mkdir(parents=True,exist_ok=True)
data={'schemaVersion':1,'base':base,'snapshotHead':head,'snapshotTree':tree,'snapshotCommitDate':git('show','-s','--format=%cI',head).decode().strip(),'countingUnit':'base→HEAD 新增的可执行 source.json 版本包；不是独立心理构念数，也不是生产可用量表数','executableSourcePackageCount':len(records),'documentationOnlyHoldCount':len(holds),'productionAvailability':'NOT_CLAIMED','records':records,'documentationOnlyHolds':holds}
(out/'inventory.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
(out/'publication-ledger.json').write_text(json.dumps({'schemaVersion':1,'snapshotHead':head,'entries':ledger},ensure_ascii=False,indent=2)+'\n')
fields=['instrumentKey','instrumentVersion','displayTitle','subjectKey','primaryDomain','itemCount','scores','population','languageEvidence','license','noncommercialOnly','noncommercialTagPresent','reportVersion','catalogManifestVersion','sourceSha256','sourcePath','referenceDocuments','parameterDocuments','sourceParameterLocations','referenceLinks']
with (out/'inventory.csv').open('w',newline='',encoding='utf-8-sig') as f:
 w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
 for r in records:w.writerow({k:json.dumps(r[k],ensure_ascii=False) if isinstance(r[k],(dict,list)) else r[k] for k in fields})
md=f'''# 量表内容扩充交接清单

## 当前交付

本快照新增 **{len(records)} 个可执行源包**，另有 **{len(holds)} 个仅公开资料的 HOLD 包**。全部源包保持 **DRAFT / HIDDEN**；已完成隔离环境草稿物化验证，不代表生产入库、公开上架或临床可用。本批内容未运行 CI，未合并、未部署。

- 基线：`{base}`
- 快照：`{head}`
- 内容树：`{tree}`
- 完整机器清单：[JSON](inventory.json) / [CSV](inventory.csv)
- 成功公开发布记录：[publication-ledger.json](publication-ledger.json)

**计数口径：**只统计基线到指定快照新增的 `source.json` 版本包。不把主干既有条目、学科平行表、同一工具的语言版本当作新独立构念；本数不是心理构念去重数。

## 使用前必须知道

1. 每条记录保留实际目标人口及来源人口说明；源文献年龄、学生样本或父母身份不等于系统已经实现资格核验。不得自动泛化到 K12、临床或高风险选择。
2. `languageEvidence` 区分工作译稿、作者提供中文及已发表中文研究；有中文版不意味着对当前人群完成本地验证。人工审核状态以源声明为准。
3. 四个既有非商业包（ASKU、SCI、DJGLS、L1）保留“非商业”标签及精确许可条件；后续新增以逐条许可为准。开源/免费使用不意味着公共领域。署名、非商业、相同方式共享等条件不能省略。各量表及译文分别遵循其自身许可；仓库公开或代码许可不覆盖、替代第三方量表许可。
4. 计分、缺失处理、反向题及真实外部经验参数见各条目的参数文档。外部参数档案不等于已激活的运行时 ReferenceSet；理论中点不当常模或风险界值，未建立阈值时明确留空，不编造“补齐”。
5. 报告正文以生活化解释、反思问题及可选小行动为主，不以分数给人贴标签；机读清单保留审计所需的技术字段。原始源 SHA-256 按 Git blob 的文件字节计算。
6. 八轴标签来自冻结 sourceSnapshot；不宣称当前列表 UI 已实现全部筛选。词典扩展提案不等于运行映射已经落地。
7. SOP2 与 RSES 文档配图已经离线渲染并目视检查：中文可读、无溢出，假设示例数字正确；这不是浏览器 UI 验收，也不是运行时受治理媒体已发布。
8. 第二、第三类材料另行私下独立管理，不包含在本公开清单内。

## 可执行源包索引

“可执行”仅表示有引擎源定义，不代表可直接公开施测。详细适用边界和许可见 JSON/CSV。

| 工具 / 版本 | 题数 | 域 | 报告 / 目录版本 | 资料目录 |
|---|---:|---|---|---|
'''
for r in records:md+=f"| {r['displayTitle']} · `{r['instrumentVersion']}` | {r['itemCount']} | {r['primaryDomain']} | {r['reportVersion']} / {r['catalogManifestVersion']} | `{r['documentDirectory']}` |\n"
md+='\n## 仅公开资料：暂不注册为可执行工具\n\n'
for h in holds:md+=f"- **{h['documentKey']}**：{h['reason']} 详见 `{h['runtimeHoldDocument']}`。\n"
md+='''
## 发布记录如何读

公开发布使用连接器重建 Git 提交，提交元数据变化使本地 SHA 与 GitHub SHA 不同；逐批已核对最终内容树一致。部分批次仅发布最终清洁差异，**不是全部本地中间提交都会出现在 GitHub**。查找公开内容请使用 ledger 的 `remoteHead`，本地审计使用 `localHead`。

本 ledger 截止指定源快照，不自引用之后保存本清单的 docs-only 提交；该文档提交不增加源包计数。

Ledger 仅从成功回执提取白名单字段，不包含内部日志、个人通信或受限资料。`date` 为回执核验时间或已回读远端提交时间；未记录时保持 null，不推算精确时间。首批 `remoteParent` 是末次提交的实际前一提交，并非整批基线。

## 刷新方式

从任意工作目录运行（只读仓库与回执；只写输出目录）：

```sh
python build_inventory.py --repo <仓库目录> --base <基线SHA> --head <完整候选SHA> --receipts <成功回执目录> --out <输出目录>
```

快照推进后应重新生成计数、版本/源哈希、资料位置与发布 ledger；新源包只有成功回执出现后才算已公开发布。此脚本不触发 CI，不写数据库，不更改 Git 分支或工作树。
'''
(out/'README.md').write_text(md)
print(json.dumps({'snapshotHead':head,'count':len(records),'holds':len(holds),'successfulPublicationBatches':len(ledger),'out':str(out)},ensure_ascii=False))
