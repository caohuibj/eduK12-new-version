# Huisurvey Modern Education — Shared Cross-role Surfaces

Stack base: PR #180 Modern Education foundation.

## Presentation scope

### First-login password change

- Modern Education card/input/button treatment for the mandatory password-change flow.
- Responsive height avoids nesting a second 100vh surface underneath the application shell.
- Mobile card padding and safe-area spacing.
- Existing password policy, CSRF, reauthentication and redirect behavior remain unchanged.

### Shared Scale Library

- Shared Student / Teacher / Admin library presentation.
- Modern Education list header, filter panel, scale cards and detail sections.
- Inputs/selects use 44px+ targets.
- Tablet filters collapse to two columns; mobile filters collapse to one.
- Student availability/launch rules and Admin governance content are unchanged.

No interaction or domain-logic changes are included.
