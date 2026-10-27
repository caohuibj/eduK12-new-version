# PR357 最小直接影响 CI 计划

状态：准备与独立复核中，尚未触发，不是通过或合并声明。

## 固定输入与范围

- main/base：`04a8d994207d7b831b874d4be4f5c31640466458`。
- 产品候选：`3fb06cd2bf35b863144e4554f30b4284311b7751`，tree `d8e1b3d9970c2fef6e79a9a5774194fca19f0926`。
- 现有 PR357 分支 `work/school-teacher-consolidated-20261027`，保留原历史、正常 fast-forward，无新 Codex 对话。
- 产品 235 个实际差异路径，含原 School/Teacher 名单/UI 两项迁移及此次四入口直接复用修订。另有 9 个逐名控制/本计划路径。完整 blob/mode/组件 tree 由 `pr357-bindings.json` 冻结；最终控制提交与 merge preview 必须独立回读。
- 不把普通名单 PR 当纯 UI。也不恢复九套 opt-in、全平台 22 项、压测、生产操作或无关内容入库。

## 唯一主要执行位置

| 范围 → 可发现的故障 | 检查与位置 | 预算上限 |
| --- | --- | --- |
| 精确候选、未知文件、base 漂移、错误入口 | 正式 scope + admission 的真实 Git 冻结校验；本地控制反例另有 5 项证据，不冒充应用合格 | admission 5 分钟 |
| School/Teacher 及共享表单/测评直接消费者 | 前端当前 types、改动 TS/TSX lint、64 个逐名测试文件；Vite 只 build 一次；同 dist 打包与 HIGH/CRITICAL 扫描 | frontend 15 分钟 |
| 后端名单、事务、共享守卫、报告复用 | 当前 Docker build stage 一次 tsc；26 个逐名后端测试文件，其中13个PG文件各自从已升级空业务模板克隆隔离库；真实Redis为逐文件独立逻辑DB | backend 30 分钟 |
| SQL-owned 新6表、旧数据与不可变回执 | 04a8旧迁移+真实旧用户→当前239项迁移保留；名单非空库 dump→独立新库 restore，比对6表计数/hash，实测恢复后已提交回执仍拒改；空表如实记录 | 同 backend，不另建重复升级验收 |
| 紧凑/旧完整报告格式与权限 | 正常PG文件验证完整格式；另一个新库开启compact验证真实SFF1结果与同一报告/配图/隐私合同，不将不同格式算重复同输入 | 同 backend |
| 当前依赖与运行镜像 | 两锁定依赖生产 HIGH/CRITICAL audit；backend同缓存产出runtime，不再编译；frontend仅包装原dist | audit 10 分钟；扫描在各producer |
| 实际界面/身份/报告与受限数据库角色 | 既有真实School/Teacher浏览器旅程，下载同run同SHA原dist并验hash；只安装运行/浏览器依赖，不再编译应用。独立合成服务、实际restricted role和新表权限核验；新库迁移仅为浏览器fixture准备，不再次声称升级验收 | connected 25 分钟 |
| 源码SAST及合并资格 | 当前JS/TS CodeQL查询不减；稳定merge gate重算完整候选，并要求scope、整个pr357资格与CodeQL真实success；Draft/skip/cancel/缺失/漂移拒绝 | 沿现有CodeQL预算；qualified 5分钟 |

上述上限不是加速预测；并行后仍有 frontend/backend → connected 的关键路径。5分钟是报告等待环节的阈值，不是全链完成承诺。

## 复用边界与失败处理

- 原335/338/356等旧产品原件不可直接冒充当前357结果；现有 School/Teacher 浏览器脚本作为执行工具复用，而非复用历史PASS。
- 当前本地诊断使用Node24.22.1/PG17.11，正式工具链Node24.21.0/PG16.15；已完成局部诊断保留，不能签成正式同输入结果。正式逐文件报告禁止0测试、filtered或skipped冒充通过。
- 同一运行产物用现有ci-artifact manifest绑定head、run、lock及真实dist摘要。没有实现任意跨commit证据接纳，不作此承诺。失败先保留原日志与原件，按受影响输入制定续跑；不得盲目重建已成功的同产物。
- 不修改Chrome沙箱、系统安全配置、GitHub保护或required checks。不绕过TLS或用无沙箱浏览器补绿；若官方Chrome/环境前置不满足，明确阻塞并在必要时请求具体权限。
- 每次真正触发或失败后再触发前，读取并回写原Notion CI错误清单。依赖审计/镜像扫描错误不隐藏，首次失败不扩大成全平台排错。

## 明确保留的未完成事项

四入口即时反馈统一、最新冷/热资源基线、完整存储压缩收益及高级认知/SJT所有运行路径，不因本次定向CI而自动完成。当前目标是本PR的真实直接影响及可靠性，不以“全部功能一致”为名放宽角色、受众、同意或报告权限。

PR357仅准备正式CI与合并资格；未部署，也不将历史PR356合并授权自动扩大为新PR357合并授权。

## 首轮配置解析失败及第二候选

HEAD `41ad563d` 的主workflow run `40430737854` 与可复用workflow校验记录 `40430731672` 均失败且 jobs=0，应用、构建、数据库和CodeQL均未执行；另一个既有SJT publication工作流成功，不替代主门禁。API未返回可读的原始配置annotation，不能伪造其逐字错误。

独立静态核查确认：新YAML把 `job.services.*` 和 `runner.temp` 用在job级env，超出该层可用context。按GitHub官方context合同及仓库原有写法，改为step级env取得真实服务端口/容器ID/临时目录，再写入本job的GITHUB_ENV。新增实际YAML层级反例先FAIL，修正后单项PASS；补查所有job级env，不仅修改首个变量。应用两组件tree均未变，没有应用检查可重复，也没有producer产物可复用。

来源：https://docs.github.com/en/actions/reference/workflows-and-actions/contexts

## 两轮后独立定位：可复用 workflow 引用上限

已直接读取 GitHub 原始 run HTML：第二轮 `40431334757` 主 CI 失败原因是 `too many workflows are referenced, total: 51, limit: 50`。暂停继续试跑；将本次6个选中作业内联回原ci.yml，撤回新增的ci-pr357.yml引用及文件。旧50条复用引用和所有旧门禁不删不降级，当前限定scope仍要求同一候选的6个真实作业及CodeQL。不再为此增加第51个复用框架。第一轮的job/runner context也是独立真实配置错误，记录两者而不覆盖历史。

独立收敛证据补充：已用公开 GitHub run HTML 补得首轮真实annotation，确为job/runner不可用context；第二轮确为51/50上限。两类错误分别保存，不用后一项覆盖前一项。原main的完整递归调用图为50个被调用workflow（另加顶层caller共51个文件）；内联后与原main调用集合完全一致。固定集合写入binding供可移植控制使用，避免单元测试依赖本机完整Git历史。官方规则按被调用工作流计数，不把顶层caller计入50。

使用官方actionlint v1.7.7发布二进制，先核官方checksums中SHA256 `023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757`。实际主ci.yml语义lint发现新端口索引使用数字键，改为等价字符串键后exit0；关闭的是此工具的可选shellcheck/pyflakes调用，不是GitHub应用检查、SAST或安全门禁。另有3个直接控制PASS：真实YAML接线、context层级、递归调用图。未再次启动GitHub试跑来定位这些错误。

## 第一次应用检查后的精确续跑

原正式run40432261300（source667b7fec，checkout2fa23b853f1cc31efecbbd45a8869733cd6287a6）：scope/admission、两依赖audit、backend编译、旧用户237→239升级、JS/TS CodeQL均有实际成功。前端类型通过、lint0errors/19warnings，64文件570项为560PASS/10FAIL；后端unit13文件中5文件33PASS、8文件因CI合成JWT不足32字符未加载。PG文件、恢复、前端build、两runtime扫描与浏览器未执行。不能把原run整体标PASS。

修订产品只有两个失败前端fixture，明确匹配 `?view=current-unit`；本地10项定向PASS。CI只将合成JWT延长，实际配置消费者9项定向PASS。没有放宽生产保护。backend整个tree不变；除两个失败fixture外，frontend所有源码/配置/依赖均不变。

本次续跑固定原run、job、artifact ID及ZIP SHA256，先正式API回读并验证原scope/admission和producer状态，再核精确组件、变化路径、lock和产物digest。不支持任意“最近一次绿色”，输入漂移即停止。原完整失败report不修改，资格仅接纳整文件全部PASS：前端62文件560项＋新跑2文件原10个fullName；后端5个JWT无依赖文件33项＋新跑8个原未加载文件。后端这5文件是名单schema/工作簿和mock数据库的反馈、共识、报告服务，已逐项审读，不含实际JWT配置读取。不会只把旧report的success改成true。

- backend原dist的原manifest与官方ZIP摘要保存为原身份；当前组件tree与旧组件完全相同，包装为本候选产物时显式记录 `REPACKAGED_IDENTICAL_COMPONENT_NOT_RECOMPILED`，保留originalManifest。新包装manifest不声称重新编译。Docker只准备依赖与运行镜像，COPY原dist，不再次tsc。每份续跑证明分开写candidate身份与原run/head，防止字段覆盖混淆。
- 原升级receipt按同backend/schema接纳；当前deploy239仅为未跑PG的新隔离fixture准备，不再冒称第二次升级验收。13个PG文件、compact格式、非空恢复仍真实执行。
- frontend两个test文件属于tsconfig的输入，故类型检查确需更新；lint只查这两个变化文件。前端生产build此前未执行，本轮第一次构建并扫描，不使用旧不存在的产物。
- 原依赖audit按完全相同的两lock接纳，保持HIGH/CRITICAL门槛。原CodeQL job121952617174已于01:44:02UTC实际完成success；按仓库既有“官方成功应用SAST＋新控制分析”方式复用不变应用源，当前CodeQL仍实际扫描CI控制闭包及两个变化fixture，查询集和阈值不减。原工作流为upload:never，记录原job/阶段成功而不声称GitHub保有未上传的原SARIF或无发现。
- 读取令牌仅出现在必要step，传给产品测试/构建的子进程前移除；artifact重定向不转发Authorization。官方GET的502/503/504及网络错误仅有界重试，权限/身份/摘要错误不回退。
- 新复用消费者有固定ID/摘要/过期/输入漂移/原FAIL保留/缺失SAST阶段反例；实际原ZIP选择得到62/2与5/8，原backenddist按ci-artifact重新计算digest一致。Actions语义lint在本地真实执行；新增CodeQLstep缩进曾被本地lint拒绝并修正，没有推到CI试错。

续跑冻结口径：产品检查点为 `b37c60aebaa05b15d28f8172fc3a4600f5c29b90`（只增加上述两份fixture修订），backend tree `100ae07d90a1bf9fc53b1df0a610008571f565dd` 不变，frontend tree `1bb800f156220de1e5a2f043a82208f713cfa273`；235个source＋新增固定续跑消费者后的10个control＝245路径。页首旧候选作为首次激活历史保留，不把旧候选身份改写成新执行身份。

## 续跑中的局部变量遮蔽与已完成前端保全

run40436352177 / sourceedb119f6 / checkout0019a9ae：scope、admission、audit、CodeQL及整个frontend producer均实际success。frontend原10项在正式环境通过，原62文件/560项按原件接纳；生产dist及运行镜像扫描完成。backend成功复用原编译产物并上传，但database控制器在调用新fixture前报 `Cannot access 'original' before initialization`：本地restore快照变量与导入的原run身份同名。数据库消费者仍NOTRUN，不是业务断言失败。

修复只将restore快照命名为beforeRestore。针对实际脚本的no-shadow检查先1FAIL、修正后0；实际database函数前缀在隔离VM控制下验证原升级receipt后到达fixture边界，恢复旧命名则复现原TDZ，未执行伪造PG。另对此前未加载的7个unit文件在本地诊断112/112PASS，与先前9项同属于8个缺失文件；Node24.22本地诊断仍不冒充正式Node24.21资格。

后续不重复前端：固定成功job121965972676、run40436352177与同一frontend tree1bb800f1，核 checks artifact12703623377 SHA256 `b954b12f1ad078817f3b52b045ac185e7dbdebf2c8bd940c35c80e61b78fcb61` 与 dist artifact12704057621 SHA256 `decfa1befeace0a009d26018eae93461743017725d317dc8a3335dc6f3f5a92e`。真实原ZIP均已核，747个dist文件无非法路径，manifest contentDigest `94257d9e7ea5572bbc675d466f76a5f2c44580829e3e07212e560a3ecd223b97` 重算一致。消费者同时验证原560＋新10的完整链、当前frontend tree未变、扫描原image ID `sha256:fcb1c6da11c7ffdebde7757625cb3b60f1ba19a8d690f50c787cf8cd1721105a` 无HIGH/CRITICAL，保留原manifest/检查身份，仅转交同字节dist，不再npm安装、类型/lint/测试、Vite构建或重扫前端镜像。浏览器是独立未执行消费者，仍必须真实通过。

后端编译、原升级、audit与不变应用SAST继续沿原固定证据；实际新控制代码仍扫描。唯一未完成主链仍为后端8文件、13PG、compact、恢复、backend运行镜像扫描及connected浏览器。此阶段不增加新业务功能，不改检查阈值或分支保护。

## Redis-slot correction and precise database continuation (02:50 UTC)

Run40439156003 at61c3d874 retained the preceding failure history and advanced:
8 unit files/121 cases and PG0–4/62 cases PASS; roster PG5 has16 PASS and one
FAIL before Redis connect (expected `/14`, received `/5`). Artifact12704938910,
ZIP441b7c3007dc9af8eb13a306f33e61bce3ac5e291070fdf3a3547f56e466a21f,
is the sole new partial-progress source, not an arbitrary successful run.

Keep the original DB14 and empty-store assertions. Route roster only to14;
other PG file indexes stay0–12, compact13. Unit tests do not rerun. The whole
backend component, locked tools/schema and synthetic environment are unchanged.
The16 passing roster cases did not initialize Redis; the one failure occurred
before cache initialization. Select only its exact fullName on a fresh database
and empty DB14. The raw new report must preserve16 pending/filtered names from
the original passing cases and exactly1 fresh PASS; never label it17 freshly
passing cases or rewrite the original failed JSON. Original121 unit,62 PG and16
roster cases retain their original source/job/artifact identity. Their accepted
raw evidence is carried into the current proof. The preceding33 unit and upgrade
chain is independently reauthenticated as before.

PG6–12, compact13, nonempty roster restore, backend runtime scan and the actual
School/Teacher browser consumer remain NOTRUN until executed. The newly isolated
5000-row fixture supplies the nonempty restore snapshot, preserving all six
mapped-table hashes and immutable receipt trigger verification. No production
code, limits, security thresholds or database cleanup policy changed. Current
CI controls still require actual SAST and stable required gate success. No merge
or deployment is performed by this correction.

## Actual Vitest filtered-status correction (02:59 UTC)

Run40440930935/source976e has the real quota PASS (21.1s),16 filtered; artifact
12706064269 ZIP86578174eda2c428141a891dd2d5e5a9c8b36da1f65099236fe88132be5469f1.
The evidence reader then failed: JSON assertion status is `skipped`, while its
aggregate field is `numPendingTests`. The prior synthetic control used `pending`
incorrectly. Fix only that representation, require exact16 names and1 passed
quota name, retain original failed job and successful test raw bytes. The actual
report now validates locally; a `pending` assertion fixture is explicitly refused.

This completed HTTP quota test is not reexecuted. Because its ephemeral database
was removed on runner teardown before a dump existed, the pending restore now
uses a separate, explicitly synthetic small storage fixture: one user/school,
one batch/person and completed job/immutable part. Assignment/credential tables
are empty as in the prior staff-only quota fixture; all six table counts/hashes
still must match after real restore, with committed-part tampering refused.
This seed is storage-only, not a new permission, profile-decryption or business
qualification. Its actual creation was diagnosed with local PG17, not claimed
as formal PG16 restore success. Remaining PG6–12/compact/restore/runtime scan and
browser stay required; no passing application checks or compilation are repeated.

## Browser environment-only continuation (03:32 UTC)

Run40441725961 completed backend121983573857 successfully, including missing
PG17 cases, compact4, nonempty restore and runtime scan. Both application
qualifications are now fixed-source complete proofs; backend reuse authenticates
original partial-run chains plus this successful producer, every final report,
restore, image scan and original build manifest. No database services, application
tests, Docker repackaging or scans run in the backend reuse job. Actual changed
control analysis and stable gate remain mandatory.

Browser121985132030 stopped before launch: /opt root:root0777 violated the
unchanged trusted-directory rule; fonts returned CJK_FONT_FILE_UNTRUSTED without
a precise path. On2026-10-27 03:31UTC the user explicitly approved tightening
only /opt to0755 on the disposable GitHub runner. The step verifies exact real
root-owned directory/current mode, changes only that directory, and reads it
back. No sandbox disable, permission relaxation, recursive chmod or production
change. Font path metadata is read-only and constrained to /usr/share/fonts;
any additional permission action needs its own specific approval. Preflight is
moved before fixture seed so unavailable browser safety does not create unused
fixture data. Actual browser journey remains NOTRUN, never replaced by preflight.

## Complete trusted-path hardening authorized (03:38 UTC)

Run40444862647 retained all other qualifications, but browser preflight stopped
at root-owned0777 /opt/google after /opt was repaired. Read-only font metadata
also identified0777 /usr/share and its font ancestor directories. The user then
specifically approved removing group/other write bits from required Chrome/CJK
paths and parents on this disposable runner. The new preparation inventories
both exact Chrome executable paths and installed Chinese fonts under the fixed
/usr/share/fonts root, validates every root-owned non-symlink regular file or
directory before any mutation, and only applies mode & ~0022. Existing special
bits, owner, read and execute bits are preserved; no new privilege is added.
No unrelated recursive chmod, production change or sandbox bypass is allowed.
The actual Python syntax and bounded-path workflow controls pass locally; actual
Chrome/font/runtime acceptance remains a required real check, not assumed.

## First real-browser findings and minimal UI repair (03:48 UTC)

Run40445517199 at653cebc2 passed Chrome package/path and CJK preflight, actually
launched officialChrome155 with PID namespace and seccomp-BPF sandbox verified.
Both real API runtimes reached READY. Public UI and real Teacher login/MFA ran.
Browser artifact12707769042 ZIP24c1e2638daf804e7a8cb9a5541e2211a72bd8e2b732a1a303f9054f619fb0b6
retains the actual failure and three screenshots; dependent author/answer/report
journeys are NOTRUN, not passing because authentication worked.

Two distinct findings: School mobile transparent login button inherited white
primary text (actualcontrast1.13 on#edf4dc); fix the one mobile rule to use
--hs-ink. Teacher theme QA searched a removed combobox while the current shared
ProductThemeControl is an accessible cyclic button. The QA now clicks that real
button and waits for each actual accessible-label transition, preserving mode,
reload, account/product preference isolation, zero business-mutation and layout
assertions. A targeted pure consumer test covers18 product/source/target pairs
and refuses invalid legacy markup. This test does not replace real browser QA.

Product/consumer correction082aff88 is pushed withskip-ci. It adds3 previously
main-only paths to the PR diff: exact source binding is now238+10=248 paths.
Backend component remains100ae07; frontend438a7e9 differs from its successful
qualification only in the exact one CSS blobf4d99375. TS/types/unit inputs and
locks are unchanged: reuse their original570-case/type evidence, but produce
one NEW Vite build/runtime image/scan because CSS bytes changed. Browser consumes
that new output; old frontend image qualification is not claimed for it. Backend
complete qualification/build remains reused. Source/scope identities refreshed;
changed e2e consumer code is included in fresh CodeQL controls analysis.
