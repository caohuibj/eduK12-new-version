from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'backend/src/modules/assessment-runtime/unified-aggregate-finalizer.service.ts'
text = path.read_text()
old = """          throw new InstrumentFinalSubmitError(\n            'RELATIONAL_ASSIGNMENT_CONFLICT',\n            '关系测评 assignment 状态与 Composite FINAL 不一致',\n            409,\n          )"""
new = """          throw new InstrumentFinalSubmitError(\n            'STALE_ATTEMPT',\n            '关系测评 assignment 状态与 Composite FINAL 不一致',\n            409,\n          )"""
if old not in text:
    raise SystemExit('expected relational completion error block not found')
path.write_text(text.replace(old, new, 1))
