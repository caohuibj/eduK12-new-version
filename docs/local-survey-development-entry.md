# Survey loopback development entry

Survey normally selects its frontend by the exact product hostname. For a local
browser in which `http://survey.localhost:5173/` fails before the page loads, the
Vite development server supports an explicit presentation-only entry:

```sh
cd server-version/frontend
VITE_DEV_PRODUCT=survey E2E_BACKEND_URL=http://localhost:53100 npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Use an unused port to leave an existing server running. The backend URL above is
an example for an already-authorized isolated local backend; choose its actual
port. This does not start, seed, or reconfigure a backend. Open
`http://localhost:5174/` in the development browser. `/workspace` loads Survey;
`/r/<public-id>` loads its participant app; `/admin` and `/admin/*` remain the
existing platform administrator entry. Stop this separate server to undo it.
Without the environment option, existing host-based selection is unchanged.

The option only applies when Vite's `import.meta.env.DEV` is true, the value is
exactly `survey`, and the hostname is exactly `localhost` or `127.0.0.1` (case and
one trailing dot are normalized). Production builds, LAN hosts, lookalikes and
other product hosts do not gain a new entry. This is not a preview-build feature.
The synchronous loading fallback remains the shared brand; Survey applies its
existing Research branding after its app loads.

## Deliberate limits

This chooses presentation, not authorization. With this explicit development
option on loopback, Survey home/navigation, invitation and recruitment display
links use the current loopback origin, including its protocol and port. The
administrator origin stays unchanged. Without the option, or on non-loopback
hosts and production builds, the existing origin mapping is unchanged.
Protocol, credential, path and recruitment URL/token validation is preserved.

Administrator routing, cookies, CSRF, backend origin checks and researcher
grants are unchanged. Correctly displaying a local invitation or recruitment
link does not establish that its authentication, activation or submission flow
has passed. Do not claim cross-origin or authenticated acceptance from this UI test.

A visible home/login screen is not a successful authentication test. Existing
backend origin configuration may reject writes from the new port. Do not alter
origin allowlists, cookie behavior, credentials, grants, browser HTTPS/security
policies, DNS, certificates or TLS validation just to make a test pass. Report
that boundary separately and use the authorized authentication workflow for
any sign-in. Do not auto-read or fill test passwords.

## Diagnostic evidence and narrow checks

On 2026-10-25 the dot cloud browser could render the ordinary localhost admin
login but returned `ERR_SSL_PROTOCOL_ERROR` for the Survey localhost subdomain.
Separate existing HTTP probes returned 200 for all three host variants without
an HTML redirect. This does not establish the browser's upgrade mechanism or
any production certificate fault; the opt-in entry does not repair TLS.

Focused local routing checks (not full CI or deployed-product qualification):

```sh
cd server-version/frontend
npm test -- src/product-entry.development.test.ts src/product-entry.test.ts src/products/origins.test.ts src/products/origins.development.test.ts src/pages/AdminLogin.test.tsx
npx eslint src/product-entry.ts src/product-entry.development.test.ts src/products/development-entry.ts src/products/origins.ts src/products/origins.development.test.ts
```

The new cases cover opt-in/default behavior, administrator exclusions,
participant routing, production refusal and exact-host boundaries. Real browser
acceptance must identify the actual URL and whether it loaded this changed
source; an unchanged localhost platform page is not evidence of Survey loading.
