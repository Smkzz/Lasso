# LASSO

LASSO is an AI-assisted dispatch console where a human draws what an agent may understand and change. WebMCP turns that visual scope into a live typed capability contract.

A dispatcher draws a freehand boundary around deliveries and drivers. The page turns that live UI state into revision-specific WebMCP tools whose JSON Schemas contain only the selected resource IDs. A visiting agent authors a recovery plan, LASSO validates it, the agent may request additional scope, and only the human-facing workflow can expose a single-use exact-plan apply capability.

> **The human interface generates the agent interface.**
>
> **The map is the prompt. The boundary is the permission.**

## Human–agent workflow

1. **Human draws scope.** Detailed tool data and valid input enums are compiled from the selected map objects.
2. **Agent authors a plan.** LASSO evaluates the agent's driver-to-delivery patch; it does not generate the answer.
3. **Agent negotiates scope.** The tool may return an opaque boundary opportunity. A request is visible to the human but cannot expand authority by itself.
4. **Human changes the contract.** Approving a resource or changing a constraint invalidates the prior revision and compiles a new one.
5. **Human authorizes one exact plan.** A consequential, expiring, single-use apply tool appears only for the verified plan and current state.
6. **Agent applies or fails closed.** Every write is revalidated before an atomic scoped patch is committed.

## Why this is WebMCP-native

The differentiator is not simply that an agent can call a website function. **The human interface generates the agent interface.**

- Spatial selection becomes typed schema enums.
- UI constraints become policy enforced by handlers.
- Scope changes create new tool identities instead of silently mutating an old contract.
- The page and the agent share the same current canvas without a separate MCP server or state-synchronization service.
- The technical-proof panel shows the active registration context, clearly labels native-host versus local-bridge evidence, and renders the actual contract diff.

Screenshot or DOM automation may perceive a highlight, but perception alone does not tell an agent which IDs and operations the application will accept. A conventional remote MCP service would need a separate synchronization path to learn what the person just selected in the browser.

## Demo scenario

The seeded incident starts with six late deliveries. The human scopes six deliveries and two drivers.

- An agent-authored plan incorrectly gives refrigerated delivery **D15** to Aino. It is rejected for vehicle capability, protected capacity, and overtime.
- LASSO returns an opaque opportunity for compatible capacity outside the WebMCP contract.
- The agent requests it; the request does not grant authority.
- The human includes Mika, invalidating the old contract and compiling a new schema containing `MIKA-03`.
- A repaired agent-authored plan recovers five deliveries with three changed routes, **+4.0 km**, and zero overtime.
- **D18** remains late because its recovery window is closed.
- The human authorizes the exact verified plan; one consequential apply capability appears.
- Execution preserves every outside-scope commitment, keeps one global owner per delivery, persists the new routes, and removes the consumed capability.

## Architecture overview

The browser holds one live dispatch state. `src/app.js` turns the freehand SVG gesture and human controls into store updates; `src/scopeCompiler.js` compiles that state into revision-specific WebMCP tools; `src/webmcp.js` replaces registrations transactionally; and `src/core.js` validates and applies atomic scoped patches. The external agent authors assignments. LASSO exposes scoped facts, diagnoses invalid proposals, and applies only a human-authorized exact plan.

## Run locally

Requires Node.js 20 or newer.

```bash
npm start
```

Open `http://localhost:4173`.

The application has no runtime dependencies, backend, external API calls, accounts, or secrets. Set `HOST` and `PORT` when a deployment platform requires different values.

## Quality gates

```bash
npm run check
```

This runs syntax checks, deterministic invariants, a deterministic 5,000-case scoped-patch fuzz campaign, source-quality checks, package/static checks, HTTP security checks, a performance smoke test, and the self-contained browser build.

The optional real-Chromium campaign requires a browser listening on remote-debugging port `9222` plus the Python packages in `requirements-dev.txt`:

```bash
python -m pip install -r requirements-dev.txt
npm run check:browser
```

Current local release-candidate results:

```text
CORE_INVARIANTS=153/153 PASS
PACKAGE_CHECKS=82/82 PASS
HTTP_SECURITY_CHECKS=25/25 PASS
FUZZ_ITERATIONS=5000
FUZZ_SECURITY_CHECKS=PASS
SOURCE_QUALITY_CHECKS=59/59 PASS
PERFORMANCE_CHECKS=4/4 PASS
BROWSER_E2E=PASS
PAGE_ERRORS=0
```

The browser campaign uses real pointer input for the lasso and covers schema compilation, an invalid agent plan, opaque scope negotiation, a repaired plan, exact authorization, protected-route non-interference, global single ownership, persistent applied routes, stale replay rejection, responsive layout, and mobile-width layout.

See [`docs/VALIDATION.md`](docs/VALIDATION.md) for the precise evidence boundary.

## Security model

LASSO enforces an **application workflow boundary**, not general internet authorization.

- Discovery schemas narrow valid inputs, while handlers independently revalidate generation, revision, resource membership, constraints, and authorization.
- Agent assignments are atomic scoped patches. Deliveries outside the selected set remain on their existing routes.
- An in-scope delivery cannot be moved from an owner whose driver is outside the selected scope.
- The full live assignment graph is checked for duplicate ownership before commit.
- Exact authorization is bound to plan, scope, workspace generation, live-state envelope, and actuation epoch; it expires after five minutes and is single-use.
- Contract replacement waits for in-flight calls to settle and fails closed if the host confirms only part of a desired tool surface.
- Outside-scope identities are excluded from WebMCP tool results where specified; this is not a claim that a browser agent cannot perceive information already rendered in the human-facing page.
- The deterministic plan digest is an in-memory integrity identifier, not a cryptographic signature.

See [`SECURITY.md`](SECURITY.md) for explicit non-claims and production limitations.

## Native WebMCP status

The implementation uses imperative registration with an `AbortSignal` lifecycle:

```js
document.modelContext.registerTool(tool, { signal })
```

Native WebMCP end-to-end validation passed in the Codex In-app Browser using a WebMCP-supported model. The host exposed `document.modelContext`; its exact model identifier was not exposed. The native mission verified discovery, invocation, human-generated schema enums, stale revision rejection, agent-authored invalid and repaired plans, human-only scope expansion, exact-plan authorization, single-use apply, non-interference, and stale replay rejection.

```text
NATIVE_WEBMCP_FULL_MISSION=PASS
LATE_DELIVERIES=6 -> 1
ROUTE_CHANGES=3
OVERTIME=0
CONTRACT_REFRESH=R2/C4 -> R3/C5
OUT_OF_SCOPE_MUTATIONS=0
PROTECTED_COMMITMENT_MUTATIONS=0
DUPLICATE_DELIVERY_OWNERS=0
STALE_REPLAY=REJECTED
```

The local bridge remains a deterministic test harness and is not counted as native evidence.

Use [`docs/NATIVE_WEBMCP_HOST_CHECKLIST.md`](docs/NATIVE_WEBMCP_HOST_CHECKLIST.md).

## Project layout

```text
index.html                      production page
styles.css                      production styling
src/core.js                     state, validation, authorization, scoped reducer
src/scopeCompiler.js            UI state → WebMCP tool compiler
src/webmcp.js                   transactional registration lifecycle
src/app.js                      freehand UI, visualization, human controls
serve.mjs                       dependency-free hardened static server
tests/core.test.mjs             deterministic invariant suite
tests/fuzz_smoke.mjs             deterministic adversarial patch campaign
tests/source_quality.py          source, HTML, CSS, and secret-pattern audit
tests/package_check.py           package, policy, and asset-graph audit
tests/http_security.py          server and header adversarial checks
tests/performance_smoke.mjs     bounded performance gate
tests/browser_e2e.py            Chromium DevTools end-to-end campaign
scripts/build_smoke.py          self-contained E2E artifact builder
docs/                           validation, release, demo, and submission evidence
.github/workflows/quality.yml   deterministic CI quality gate
```

## License

MIT.
