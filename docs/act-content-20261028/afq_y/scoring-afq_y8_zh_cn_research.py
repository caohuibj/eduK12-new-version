# -*- coding: utf-8 -*-
"""AFQ-Y8 参考计分实现（完整题答计分；缺答按 complete_required 不计分，不补 0）。"""

# 全部题码（按官方题序）
ITEMS = ["AFQY8_01", "AFQY8_02", "AFQY8_03", "AFQY8_04", "AFQY8_05", "AFQY8_06", "AFQY8_07", "AFQY8_08"]
MAX_VALUE = 4  # 作答量尺上端

# total: 心理不灵活性总分（8题）
SCORE_ITEMS_TOTAL = ["AFQY8_01", "AFQY8_02", "AFQY8_03", "AFQY8_04", "AFQY8_05", "AFQY8_06", "AFQY8_07", "AFQY8_08"]
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
