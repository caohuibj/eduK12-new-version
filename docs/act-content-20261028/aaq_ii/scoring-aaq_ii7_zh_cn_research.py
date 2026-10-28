# -*- coding: utf-8 -*-
"""AAQ-II 参考计分实现（完整题答计分；缺答按 complete_required 不计分，不补 0）。"""

# 全部题码（按官方题序）
ITEMS = ["AAQ2_01", "AAQ2_02", "AAQ2_03", "AAQ2_04", "AAQ2_05", "AAQ2_06", "AAQ2_07"]
MAX_VALUE = 7  # 作答量尺上端

# total: 心理不灵活性总分（7题）
SCORE_ITEMS_TOTAL = ["AAQ2_01", "AAQ2_02", "AAQ2_03", "AAQ2_04", "AAQ2_05", "AAQ2_06", "AAQ2_07"]
SCORE_REVERSE_TOTAL = []

def compute(answers):
    """answers: {itemCode: 数值}；返回 {scoreKey: 分数或 None}。"""
    out = {}
    missing = [c for c in SCORE_ITEMS_TOTAL if c not in answers]
    if missing:
        out['total'] = None
    else:
        out['total'] = sum(
            (MAX_VALUE - answers[c]) if c in SCORE_REVERSE_TOTAL else answers[c]
            for c in SCORE_ITEMS_TOTAL)
    return out
