# FE-01 validation and review guide

Validated on 2026-09-12 against main `8bbb40960079740cb5720b67969737971f367d8f` plus this PR.

## Results

| Check | Result |
|---|---|
| Generated route inventory drift check | 86 routes match App.tsx |
| TypeScript, including standalone example | Passed |
| ESLint | 0 errors; 118 warnings in existing files |
| Full frontend Vitest suite | 91 files, 337 tests passed |
| Production build | Passed; existing bundle-size warnings remain |
| Chrome browser fixture | 11 cases passed |
| Visual inspection | 360px and 1366px screenshots inspected |
| Patch whitespace | Passed |

The browser matrix uses widths 360, 390, 768, 820 and 1366px, each with keyboard or emulated touch, plus reduced motion. It checks horizontal overflow, 44px targets, compact action width, native keyboard focus/activation, disabled-button skipping, labeled radio/textarea interaction, status feedback, token isolation, browser errors and absence of API requests. It caught a 360px root box-sizing overflow; the scope root now uses border-box.

The three new component tests cover landmark/heading ownership, native button behavior and opt-in live announcements. Browser emulation is not real iPad/Android/Chromebook validation, screen-reader validation or Cognitive timing validation. Those remain later journey gates.

## Reproduce

From `server-version/frontend`:

```sh
npm ci --ignore-scripts
npm run inventory:product-ui:check
npm run typecheck
npm run lint
npx vitest run
npm run build
npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

Open `http://127.0.0.1:5179/examples/product-ui.html`. This standalone Vite example is not an application route or a production build entry. It creates no attempt and sends no answers. Its local state only demonstrates presentation and native controls.

In another terminal, from `server-version/frontend`, with the existing backend Playwright dependency installed:

```sh
PRODUCT_UI_BASE_URL=http://127.0.0.1:5179 PRODUCT_UI_BROWSER_CHANNEL=chrome node ../e2e/product-ui-foundation-browser-e2e.cjs
```

Use an installed Chrome for `PRODUCT_UI_BROWSER_CHANNEL=chrome`; omit that variable to use Playwright's installed Chromium. `PLAYWRIGHT_CORE_PATH` can point to an existing Playwright Core installation. `PRODUCT_UI_EVIDENCE_DIR` overrides the default `/tmp/eduk12-product-ui-foundation` output directory for screenshots and `results.json`.

## Review boundaries

Review the generated inventory as a migration map, not as a new authorization or routing source. The new primitives are opt-in and presentation-only. App.tsx, runtime controllers, API clients, finalDraftStore, media players and backend contracts are unchanged. No active page is migrated in FE-01.

Submission recovery, local-only intermediate answers, complete-video enforcement and retained scene completion are recorded design constraints, not features delivered by this foundation PR. The example's pending/error messages do not implement those state machines.
