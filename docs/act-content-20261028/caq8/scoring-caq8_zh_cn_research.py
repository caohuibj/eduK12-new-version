# -*- coding: utf-8 -*-
"""CAQ-8 参考计分实现（完整题答计分；缺答按 complete_required 不计分，不补 0）。"""

# 全部题码（按官方题序）
ITEMS = ["CAQ8_01", "CAQ8_02", "CAQ8_03", "CAQ8_04", "CAQ8_05", "CAQ8_06", "CAQ8_07", "CAQ8_08"]
MAX_VALUE = 6  # 作答量尺上端

# committed_action_total: 承诺行动总分（8题，负向键反向后）
SCORE_ITEMS_COMMITTED_ACTION_TOTAL = ["CAQ8_01", "CAQ8_02", "CAQ8_03", "CAQ8_04", "CAQ8_05", "CAQ8_06", "CAQ8_07", "CAQ8_08"]
SCORE_REVERSE_COMMITTED_ACTION_TOTAL = ["CAQ8_05", "CAQ8_06", "CAQ8_07", "CAQ8_08"]
# values_persistence: 目标坚持（第1–4题）
SCORE_ITEMS_VALUES_PERSISTENCE = ["CAQ8_01", "CAQ8_02", "CAQ8_03", "CAQ8_04"]
SCORE_REVERSE_VALUES_PERSISTENCE = []
# negative_committed_action_raw: 困难时的坚持（第5–8题反向后）
SCORE_ITEMS_NEGATIVE_COMMITTED_ACTION_RAW = ["CAQ8_05", "CAQ8_06", "CAQ8_07", "CAQ8_08"]
SCORE_REVERSE_NEGATIVE_COMMITTED_ACTION_RAW = ["CAQ8_05", "CAQ8_06", "CAQ8_07", "CAQ8_08"]

def compute(answers):
    """answers: {itemCode: 数值}；返回 {scoreKey: 分数或 None}。"""
    out = {}
    missing = [c for c in SCORE_ITEMS_COMMITTED_ACTION_TOTAL if c not in answers]
    if missing:
        out['committed_action_total'] = None
    else:
        out['committed_action_total'] = sum(
            (MAX_VALUE - answers[c]) if c in SCORE_REVERSE_COMMITTED_ACTION_TOTAL else answers[c]
            for c in SCORE_ITEMS_COMMITTED_ACTION_TOTAL)
    missing = [c for c in SCORE_ITEMS_VALUES_PERSISTENCE if c not in answers]
    if missing:
        out['values_persistence'] = None
    else:
        out['values_persistence'] = sum(
            (MAX_VALUE - answers[c]) if c in SCORE_REVERSE_VALUES_PERSISTENCE else answers[c]
            for c in SCORE_ITEMS_VALUES_PERSISTENCE)
    missing = [c for c in SCORE_ITEMS_NEGATIVE_COMMITTED_ACTION_RAW if c not in answers]
    if missing:
        out['negative_committed_action_raw'] = None
    else:
        out['negative_committed_action_raw'] = sum(
            (MAX_VALUE - answers[c]) if c in SCORE_REVERSE_NEGATIVE_COMMITTED_ACTION_RAW else answers[c]
            for c in SCORE_ITEMS_NEGATIVE_COMMITTED_ACTION_RAW)
    return out
