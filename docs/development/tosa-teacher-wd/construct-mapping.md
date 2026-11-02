# 构念机会与竞争解释

以下表对应完整工具0.4.2（题面与动作键沿用0.4.1冻结内容）。A/B/C/D是名义类别；source_option保留修订前字母身份，不是权重。

| mother | node | question | evidence_type | role | target | boundary |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | T01_R1 | T01_R1_P1 | COST | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T01 | T01_R1 | T01_R1_P2 | WORRY | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T01 | T01_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T01 | T01_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | VP | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T01 | T01_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | VH | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T01 | T01_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PA | 竞争解释，不能与P相加 |
| T01 | T01_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PO | 竞争解释，不能与P相加 |
| T01 | T01_R2 | T01_R2_P1 | FOCC | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T01 | T01_R2 | T01_R2_P2 | WORRY | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T01 | T01_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | TC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T01 | T01_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T01 | T01_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | HO | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T01 | T01_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PA | 竞争解释，不能与P相加 |
| T01 | T01_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PO | 竞争解释，不能与P相加 |
| T01 | T01_R3 | T01_R3_P1 | ATTR | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T01 | T01_R3 | T01_R3_P2 | EFFICACY | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T01 | T01_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | TC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T01 | T01_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T01 | T01_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | HO | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T01 | T01_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PA | 竞争解释，不能与P相加 |
| T01 | T01_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PO | 竞争解释，不能与P相加 |
| T02 | T02_R1 | T02_R1_P1 | STATE | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T02 | T02_R1 | T02_R1_P2 | ATTR | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T02 | T02_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | RM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T02 | T02_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PA | 竞争解释，不能与P相加 |
| T02 | T02_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T02 | T02_R2_CONTACT | T02_R2_CONTACT_P1 | ATTR | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T02 | T02_R2_CONTACT | T02_R2_CONTACT_P2 | EFFICACY | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T02 | T02_R2_CONTACT | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | OA | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T02 | T02_R2_CONTACT | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | RM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T02 | T02_R2_CONTACT | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PA | 竞争解释，不能与P相加 |
| T02 | T02_R2_CONTACT | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T02 | T02_R2_NOCONTACT | T02_R2_NOCONTACT_P1 | ATTR | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T02 | T02_R2_NOCONTACT | T02_R2_NOCONTACT_P2 | EFFICACY | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T02 | T02_R2_NOCONTACT | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | OA | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T02 | T02_R2_NOCONTACT | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | RM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T02 | T02_R2_NOCONTACT | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PA | 竞争解释，不能与P相加 |
| T02 | T02_R2_NOCONTACT | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T02 | T02_R3_COMMON | T02_R3_COMMON_P1 | STATE | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T02 | T02_R3_COMMON | T02_R3_COMMON_P2 | COPING | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T02 | T02_R3_COMMON | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | RM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T02 | T02_R3_COMMON | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T02 | T02_R3_COMMON | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PA | 竞争解释，不能与P相加 |
| T02 | T02_R3_COMMON | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T03 | T03_R1 | T03_R1_P1 | ATTR | RAW_ONLY | OA | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T03 | T03_R1 | T03_R1_P2 | EFFICACY | RAW_ONLY | RM | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T03 | T03_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | OA | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T03 | T03_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | RM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T03 | T03_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T03 | T03_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | GC | 竞争解释，不能与P相加 |
| T03 | T03_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PO | 竞争解释，不能与P相加 |
| T03 | T03_R2 | T03_R2_P1 | VALUE | RAW_ONLY | PC;GC | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T03 | T03_R2 | T03_R2_P2 | ROLE | RAW_ONLY | HS | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T03 | T03_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | HS | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T03 | T03_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | RM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T03 | T03_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T03 | T03_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | GC | 竞争解释，不能与P相加 |
| T03 | T03_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PO | 竞争解释，不能与P相加 |
| T04 | T04_R1 | T04_R1_P1 | RISK | RAW_ONLY | VH | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T04 | T04_R1 | T04_R1_P2 | ATTR | RAW_ONLY | GC | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T04 | T04_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T04 | T04_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | VH | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T04 | T04_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PA | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T04 | T04_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | RM | 竞争解释，不能与P相加 |
| T04 | T04_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PO | 竞争解释，不能与P相加 |
| T04 | T04_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HO | 竞争解释，不能与P相加 |
| T04 | T04_R2E | T04_R2E_P1 | EFFICACY | RAW_ONLY | VH;RM | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T04 | T04_R2E | T04_R2E_P2 | ROLE | RAW_ONLY | TC | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T04 | T04_R2E | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | VH | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T04 | T04_R2E | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T04 | T04_R2E | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PA | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T04 | T04_R2E | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | RM | 竞争解释，不能与P相加 |
| T04 | T04_R2E | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PO | 竞争解释，不能与P相加 |
| T04 | T04_R2E | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HO | 竞争解释，不能与P相加 |
| T04 | T04_R2L | T04_R2L_P1 | EFFICACY | RAW_ONLY | VH;RM | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T04 | T04_R2L | T04_R2L_P2 | ROLE | RAW_ONLY | TC | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T04 | T04_R2L | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | VH | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T04 | T04_R2L | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T04 | T04_R2L | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PA | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T04 | T04_R2L | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | RM | 竞争解释，不能与P相加 |
| T04 | T04_R2L | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PO | 竞争解释，不能与P相加 |
| T04 | T04_R2L | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HO | 竞争解释，不能与P相加 |
| T04 | T04_R3 | T04_R3_P1 | VALUE | RAW_ONLY | GC | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T04 | T04_R3 | T04_R3_P2 | FOCC | RAW_ONLY | TC;VP | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T04 | T04_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | TC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T04 | T04_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | VP | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T04 | T04_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T04 | T04_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | RM | 竞争解释，不能与P相加 |
| T04 | T04_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PO | 竞争解释，不能与P相加 |
| T04 | T04_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HO | 竞争解释，不能与P相加 |
| T05 | T05_R1 | T05_R1_P1 | STATE | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T05 | T05_R1 | T05_R1_P2 | ATTR | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T05 | T05_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | OA | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T05 | T05_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PO | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T05 | T05_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T05 | T05_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | GM | 竞争解释，不能与P相加 |
| T05 | T05_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PN | 竞争解释，不能与P相加 |
| T05 | T05_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HO | 竞争解释，不能与P相加 |
| T05 | T05_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | VP | 竞争解释，不能与P相加 |
| T05 | T05_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | TC | 竞争解释，不能与P相加 |
| T05 | T05_R2 | T05_R2_P1 | ATTR | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T05 | T05_R2 | T05_R2_P2 | EFFICACY | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T05 | T05_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | OA | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T05 | T05_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PO | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T05 | T05_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T05 | T05_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | GM | 竞争解释，不能与P相加 |
| T05 | T05_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PN | 竞争解释，不能与P相加 |
| T05 | T05_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HO | 竞争解释，不能与P相加 |
| T05 | T05_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | VP | 竞争解释，不能与P相加 |
| T05 | T05_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | TC | 竞争解释，不能与P相加 |
| T05 | T05_R3 | T05_R3_P1 | STATE | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T05 | T05_R3 | T05_R3_P2 | ATTR | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T05 | T05_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | HT | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T05 | T05_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PO | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T05 | T05_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T05 | T05_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | GM | 竞争解释，不能与P相加 |
| T05 | T05_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PN | 竞争解释，不能与P相加 |
| T05 | T05_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HO | 竞争解释，不能与P相加 |
| T05 | T05_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | VP | 竞争解释，不能与P相加 |
| T05 | T05_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | TC | 竞争解释，不能与P相加 |
| T06 | T06_R1 | T06_R1_P1 | ATTR | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T06 | T06_R1 | T06_R1_P2 | COST | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T06 | T06_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | HT | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T06 | T06_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PR | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T06 | T06_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | OA | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T06 | T06_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | GC | 竞争解释，不能与P相加 |
| T06 | T06_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PC | 竞争解释，不能与P相加 |
| T06 | T06_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HO | 竞争解释，不能与P相加 |
| T06 | T06_R2_COMMIT | T06_R2_COMMIT_P1 | ATTR | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T06 | T06_R2_COMMIT | T06_R2_COMMIT_P2 | EFFICACY | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T06 | T06_R2_COMMIT | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | HT | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T06 | T06_R2_COMMIT | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PR | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T06 | T06_R2_COMMIT | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | RM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T06 | T06_R2_COMMIT | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | GC | 竞争解释，不能与P相加 |
| T06 | T06_R2_COMMIT | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PC | 竞争解释，不能与P相加 |
| T06 | T06_R2_COMMIT | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HO | 竞争解释，不能与P相加 |
| T06 | T06_R2_OPEN | T06_R2_OPEN_P1 | ATTR | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T06 | T06_R2_OPEN | T06_R2_OPEN_P2 | EFFICACY | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T06 | T06_R2_OPEN | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | HT | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T06 | T06_R2_OPEN | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PR | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T06 | T06_R2_OPEN | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | RM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T06 | T06_R2_OPEN | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | GC | 竞争解释，不能与P相加 |
| T06 | T06_R2_OPEN | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PC | 竞争解释，不能与P相加 |
| T06 | T06_R2_OPEN | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HO | 竞争解释，不能与P相加 |
| T06 | T06_R3_COMMON | T06_R3_COMMON_P1 | FOCC | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T06 | T06_R3_COMMON | T06_R3_COMMON_P2 | ATTR | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T06 | T06_R3_COMMON | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | TC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T06 | T06_R3_COMMON | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | VP | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T06 | T06_R3_COMMON | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T06 | T06_R3_COMMON | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | GC | 竞争解释，不能与P相加 |
| T06 | T06_R3_COMMON | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PC | 竞争解释，不能与P相加 |
| T06 | T06_R3_COMMON | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HO | 竞争解释，不能与P相加 |
| T07 | T07_R1 | T07_R1_P1 | STATE | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T07 | T07_R1 | T07_R1_P2 | ATTR | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T07 | T07_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PO | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T07 | T07_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PA | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T07 | T07_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | OA | 竞争解释，不能与P相加 |
| T07 | T07_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T07 | T07_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HT | 竞争解释，不能与P相加 |
| T07 | T07_R2 | T07_R2_P1 | STATE | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T07 | T07_R2 | T07_R2_P2 | COPING | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T07 | T07_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PO | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T07 | T07_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | OA | 竞争解释，不能与P相加 |
| T07 | T07_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T07 | T07_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HT | 竞争解释，不能与P相加 |
| T07 | T07_R3 | T07_R3_P1 | COST | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T07 | T07_R3 | T07_R3_P2 | WORRY | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T07 | T07_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | HT | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T07 | T07_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PA | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T07 | T07_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | OA | 竞争解释，不能与P相加 |
| T07 | T07_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T07 | T07_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HT | 竞争解释，不能与P相加 |
| T08 | T08_R1 | T08_R1_P1 | STATE | RAW_ONLY | SA;PN | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T08 | T08_R1 | T08_R1_P2 | EFFICACY | RAW_ONLY | GM | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T08 | T08_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T08 | T08_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | RM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T08 | T08_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PA | 竞争解释，不能与P相加 |
| T08 | T08_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PC | 竞争解释，不能与P相加 |
| T08 | T08_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T08 | T08_R2B | T08_R2B_P1 | ATTR | RAW_ONLY | OA;SA | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T08 | T08_R2B | T08_R2B_P2 | WORRY | RAW_ONLY | SR;RM | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T08 | T08_R2B | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | OA | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T08 | T08_R2B | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | RM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T08 | T08_R2B | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T08 | T08_R2B | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PA | 竞争解释，不能与P相加 |
| T08 | T08_R2B | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PC | 竞争解释，不能与P相加 |
| T08 | T08_R2B | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T08 | T08_R2I | T08_R2I_P1 | ATTR | RAW_ONLY | OA;SA | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T08 | T08_R2I | T08_R2I_P2 | WORRY | RAW_ONLY | SR;RM | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T08 | T08_R2I | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | OA | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T08 | T08_R2I | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | RM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T08 | T08_R2I | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T08 | T08_R2I | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PA | 竞争解释，不能与P相加 |
| T08 | T08_R2I | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PC | 竞争解释，不能与P相加 |
| T08 | T08_R2I | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T08 | T08_R3 | T08_R3_P1 | STATE | RAW_ONLY | SA;PN | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T08 | T08_R3 | T08_R3_P2 | EFFICACY | RAW_ONLY | GM | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T08 | T08_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T08 | T08_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | RM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T08 | T08_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PA | 竞争解释，不能与P相加 |
| T08 | T08_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PC | 竞争解释，不能与P相加 |
| T08 | T08_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T09 | T09_R1 | T09_R1_P1 | URGENCY | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T09 | T09_R1 | T09_R1_P2 | VALUE | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T09 | T09_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | RM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T09 | T09_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PR | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T09 | T09_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PA | 竞争解释，不能与P相加 |
| T09 | T09_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PC | 竞争解释，不能与P相加 |
| T09 | T09_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HO | 竞争解释，不能与P相加 |
| T09 | T09_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | SA | 竞争解释，不能与P相加 |
| T09 | T09_R2 | T09_R2_P1 | EFFICACY | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T09 | T09_R2 | T09_R2_P2 | WORRY | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T09 | T09_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | VH | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T09 | T09_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | VP | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T09 | T09_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | TC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T09 | T09_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PA | 竞争解释，不能与P相加 |
| T09 | T09_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PC | 竞争解释，不能与P相加 |
| T09 | T09_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HO | 竞争解释，不能与P相加 |
| T09 | T09_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | SA | 竞争解释，不能与P相加 |
| T10 | T10_R1 | T10_R1_P1 | VALUE | RAW_ONLY | GC;PC | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T10 | T10_R1 | T10_R1_P2 | ATTR | RAW_ONLY | OA;PR | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T10 | T10_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T10 | T10_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | OA | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T10 | T10_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T10 | T10_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | GM | 竞争解释，不能与P相加 |
| T10 | T10_R2 | T10_R2_P1 | ATTR | RAW_ONLY | OA;GC | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T10 | T10_R2 | T10_R2_P2 | EFFICACY | RAW_ONLY | RM;GC | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T10 | T10_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T10 | T10_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | OA | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T10 | T10_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PR | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T10 | T10_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | GM | 竞争解释，不能与P相加 |
| T10 | T10_R3 | T10_R3_P1 | VALUE | RAW_ONLY | HS | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T10 | T10_R3 | T10_R3_P2 | COST | RAW_ONLY | HS;PR | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T10 | T10_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | HS | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T10 | T10_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T10 | T10_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | GM | 竞争解释，不能与P相加 |
| T11 | T11_R1 | T11_R1_P1 | VALUE | RAW_ONLY | GC | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T11 | T11_R1 | T11_R1_P2 | ATTR | RAW_ONLY | PO;GM | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T11 | T11_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | VP | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T11 | T11_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T11 | T11_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PA | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T11 | T11_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PC | 竞争解释，不能与P相加 |
| T11 | T11_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T11 | T11_R2 | T11_R2_P1 | VALUE | RAW_ONLY | GC;GM | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T11 | T11_R2 | T11_R2_P2 | EFFICACY | RAW_ONLY | GM | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T11 | T11_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T11 | T11_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T11 | T11_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PC | 竞争解释，不能与P相加 |
| T11 | T11_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T11 | T11_R3 | T11_R3_P1 | FOCC | RAW_ONLY | TC;HO | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T11 | T11_R3 | T11_R3_P2 | PREFERENCE | RAW_ONLY | PA;GM | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T11 | T11_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | HO | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T11 | T11_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | HT | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T11 | T11_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | TC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T11 | T11_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PC | 竞争解释，不能与P相加 |
| T11 | T11_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T12 | T12_R1 | T12_R1_P1 | ATTR | RAW_ONLY | OA;PC | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T12 | T12_R1 | T12_R1_P2 | EFFICACY | RAW_ONLY | GM;RM | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T12 | T12_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | OA | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T12 | T12_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | RM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T12 | T12_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T12 | T12_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T12 | T12_R2 | T12_R2_P1 | VALUE | RAW_ONLY | OA;RM | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T12 | T12_R2 | T12_R2_P2 | ROLE | RAW_ONLY | HS | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T12 | T12_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | HS | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T12 | T12_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | RM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T12 | T12_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T12 | T12_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T13 | T13_R1 | T13_R1_P1 | RISK | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T13 | T13_R1 | T13_R1_P2 | ATTR | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T13 | T13_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | VH | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T13 | T13_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | OA | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T13 | T13_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T13 | T13_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | RM | 竞争解释，不能与P相加 |
| T13 | T13_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T13 | T13_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | TC | 竞争解释，不能与P相加 |
| T13 | T13_R2_RAISED | T13_R2_RAISED_P1 | EFFICACY | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T13 | T13_R2_RAISED | T13_R2_RAISED_P2 | WORRY | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T13 | T13_R2_RAISED | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | VH | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T13 | T13_R2_RAISED | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T13 | T13_R2_RAISED | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | RM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T13 | T13_R2_RAISED | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | RM | 竞争解释，不能与P相加 |
| T13 | T13_R2_RAISED | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T13 | T13_R2_RAISED | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | TC | 竞争解释，不能与P相加 |
| T13 | T13_R2_UNRAISED | T13_R2_UNRAISED_P1 | EFFICACY | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T13 | T13_R2_UNRAISED | T13_R2_UNRAISED_P2 | WORRY | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T13 | T13_R2_UNRAISED | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | VH | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T13 | T13_R2_UNRAISED | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T13 | T13_R2_UNRAISED | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | RM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T13 | T13_R2_UNRAISED | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | RM | 竞争解释，不能与P相加 |
| T13 | T13_R2_UNRAISED | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T13 | T13_R2_UNRAISED | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | TC | 竞争解释，不能与P相加 |
| T13 | T13_R3_COMMON | T13_R3_COMMON_P1 | VALUE | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T13 | T13_R3_COMMON | T13_R3_COMMON_P2 | WILLINGNESS | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T13 | T13_R3_COMMON | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T13 | T13_R3_COMMON | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | TC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T13 | T13_R3_COMMON | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | RM | 竞争解释，不能与P相加 |
| T13 | T13_R3_COMMON | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T13 | T13_R3_COMMON | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | TC | 竞争解释，不能与P相加 |
| T14 | T14_R1 | T14_R1_P1 | RISK | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T14 | T14_R1 | T14_R1_P2 | VALUE | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T14 | T14_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | VH | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T14 | T14_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T14 | T14_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | PA | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T14 | T14_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | GM | 竞争解释，不能与P相加 |
| T14 | T14_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HO | 竞争解释，不能与P相加 |
| T14 | T14_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | VP | 竞争解释，不能与P相加 |
| T14 | T14_R2_SPOKEN | T14_R2_SPOKEN_P1 | EFFICACY | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T14 | T14_R2_SPOKEN | T14_R2_SPOKEN_P2 | ATTR | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T14 | T14_R2_SPOKEN | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T14 | T14_R2_SPOKEN | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T14 | T14_R2_SPOKEN | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | VP | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T14 | T14_R2_SPOKEN | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | GM | 竞争解释，不能与P相加 |
| T14 | T14_R2_SPOKEN | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HO | 竞争解释，不能与P相加 |
| T14 | T14_R2_SPOKEN | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | VP | 竞争解释，不能与P相加 |
| T14 | T14_R2_SILENT | T14_R2_SILENT_P1 | EFFICACY | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T14 | T14_R2_SILENT | T14_R2_SILENT_P2 | ATTR | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T14 | T14_R2_SILENT | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T14 | T14_R2_SILENT | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T14 | T14_R2_SILENT | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | VP | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T14 | T14_R2_SILENT | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | GM | 竞争解释，不能与P相加 |
| T14 | T14_R2_SILENT | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HO | 竞争解释，不能与P相加 |
| T14 | T14_R2_SILENT | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | VP | 竞争解释，不能与P相加 |
| T14 | T14_R3_COMMON | T14_R3_COMMON_P1 | VALUE | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T14 | T14_R3_COMMON | T14_R3_COMMON_P2 | COST | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T14 | T14_R3_COMMON | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | HO | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T14 | T14_R3_COMMON | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | GM | 竞争解释，不能与P相加 |
| T14 | T14_R3_COMMON | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HO | 竞争解释，不能与P相加 |
| T14 | T14_R3_COMMON | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | VP | 竞争解释，不能与P相加 |
| T15 | T15_R1 | T15_R1_P1 | ATTR | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T15 | T15_R1 | T15_R1_P2 | FOCC | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T15 | T15_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | TC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T15 | T15_R1 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T15 | T15_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | VP | 竞争解释，不能与P相加 |
| T15 | T15_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HT | 竞争解释，不能与P相加 |
| T15 | T15_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T15 | T15_R1 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PO | 竞争解释，不能与P相加 |
| T15 | T15_R2 | T15_R2_P1 | ATTR | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T15 | T15_R2 | T15_R2_P2 | EFFICACY | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T15 | T15_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | TC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T15 | T15_R2 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T15 | T15_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | VP | 竞争解释，不能与P相加 |
| T15 | T15_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HT | 竞争解释，不能与P相加 |
| T15 | T15_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T15 | T15_R2 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PO | 竞争解释，不能与P相加 |
| T15 | T15_R3 | T15_R3_P1 | ATTR | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T15 | T15_R3 | T15_R3_P2 | VALUE | RAW_ONLY |  | 原targets仅来源记录，不是权重；以本轮process为解释口径 |
| T15 | T15_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | TC | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T15 | T15_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | HO | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T15 | T15_R3 | action | ROUND_ACTION_OPPORTUNITY | P_CANDIDATE | GM | 只表示本轮有待验证的行动机会，不表示每选项都能测量该构念；需独立盲审 |
| T15 | T15_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | VP | 竞争解释，不能与P相加 |
| T15 | T15_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | HT | 竞争解释，不能与P相加 |
| T15 | T15_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PR | 竞争解释，不能与P相加 |
| T15 | T15_R3 | action | MOTHER_SCENE_OPPORTUNITY | S_OR_COMPETING | PO | 竞争解释，不能与P相加 |
