from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'backend/src/modules/assessment-relational/product.service.ts'
text = path.read_text()
old = """      const resolved = await repository.resolveAcceptedConsent(assignment)\n      if (!resolved) relationalFail('RELATIONAL_CONSENT_REQUIRED', 'consent acceptance was not persisted')\n      return { accepted: true, replayed: resolved.consentId !== accepted.consentId }"""
new = """      const resolved = await repository.resolveAcceptedConsent(assignment)\n        ?? relationalFail('RELATIONAL_CONSENT_REQUIRED', 'consent acceptance was not persisted')\n      return { accepted: true, replayed: resolved.consentId !== accepted.consentId }"""
if old not in text:
    raise SystemExit('expected resolved-consent block not found')
path.write_text(text.replace(old, new, 1))
