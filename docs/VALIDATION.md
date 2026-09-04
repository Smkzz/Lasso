# LASSO v0.3 validation record

## Verdict

```text
LOCAL_RELEASE_CANDIDATE=PASS
CORE_INVARIANTS=153/153 PASS
PACKAGE_CHECKS=82/82 PASS
HTTP_SECURITY_CHECKS=25/25 PASS
FUZZ_ITERATIONS=5000
FUZZ_SECURITY_CHECKS=PASS
SOURCE_QUALITY_CHECKS=59/59 PASS
PERFORMANCE_CHECKS=4/4 PASS
BROWSER_E2E=PASS
PAGE_ERRORS=0
NATIVE_WEBMCP_HOST_REPLAY=PASS
```

This record separates deterministic local evidence from the completed native-host mission and from claims that remain explicitly out of scope.

## Deterministic core campaign

Run:

```bash
npm test
```

The invariant suite covers:

- seeded scenario and live-assignment graph integrity;
- coarse pre-scope WebMCP output;
- selected-ID JSON Schema enums;
- strict runtime argument and stale-revision validation;
- current WebMCP annotation semantics;
- cancellation before shared-state mutation;
- agent-authored plan evaluation;
- capability, capacity, timing, overtime, closed-window, and route-change constraints;
- aggregate protected commitments without exposing their delivery IDs in tool results;
- opaque boundary opportunities and human-only workflow expansion;
- atomic scoped-patch semantics;
- preservation of every outside-scope assignment;
- safe transfer of one delivery between two in-scope drivers;
- rejection when the current owner is outside the selected driver scope;
- global one-owner-per-delivery validation;
- exact-plan authorization, expiry, revocation, state binding, generation binding, and replay protection;
- WebMCP in-flight execution barrier;
- partial native-host registration failure and fail-closed recovery;
- non-reuse of names from failed registration attempts.

The two earlier P0 regressions have explicit tests:

```text
PARTIAL_SCOPE_D04_PRESERVED_WHEN_D07_PATCHED=PASS
D04_TRANSFER_REMOVES_OLD_OWNER_AND_PRESERVES_D12=PASS
GLOBAL_SINGLE_OWNER_INVARIANT=PASS
```

## Deterministic fuzz campaign

Run:

```bash
npm run test:fuzz
```

A fixed-seed 5,000-case campaign generates varied scopes and agent-authored assignment patches. It asserts protected-route non-interference before application, then verifies global assignment integrity and unchanged outside-scope ownership for every valid applied plan. This is deterministic regression coverage, not a claim of exhaustive verification.

## Source-quality campaign

Run:

```bash
npm run test:quality
```

The source audit checks line hygiene, HTML IDs and button types, absence of inline scripts and handlers, local module loading, CSS parsing and duplicate selectors, common secret patterns, source-map directives, and debugger statements. Its test-only Python dependencies are exact-pinned and installed by CI.

## Static/package quality campaign

Run:

```bash
python3 tests/package_check.py
```

It checks the production asset graph, current annotations, obsolete architecture removal, CSP, absence of inline event handlers, runtime URL isolation, debug-API gating, source-size limits, security documentation, least-privilege CI permissions, and the presence of every quality script.

The production runtime is dependency-free and currently remains below the project gate of 160 KiB uncompressed.

## HTTP security campaign

Run:

```bash
npm run test:http
```

The test launches the included server on a private ephemeral port and verifies:

- GET and HEAD behavior;
- correct HTML and JavaScript MIME types;
- no-store HTML caching;
- CSP, no-referrer, nosniff, permissions, same-origin resource, and cross-domain-policy headers;
- GET/HEAD-only method policy;
- bounded generic error responses;
- encoded traversal, null-byte, and oversized-request-target rejection;
- explicit runtime-asset allow-list;
- test/project-metadata non-exposure;
- realpath/symlink escape rejection;
- invalid-port startup failure.

## Performance smoke campaign

Run:

```bash
npm run test:performance
```

The fixed gates are:

```text
10,000 plan evaluations < 5 seconds
10,000 contract compilations < 1 second
correct verified result retained under load
100,000-reference hostile plan rejected within 500 ms
```

Final release-candidate measurement in this container:

```text
PLAN_EVALUATION_10K_MS=539.9
CONTRACT_COMPILE_10K_MS=12.8
HOSTILE_PLAN_100K_REFS_MS=0.7
PERFORMANCE_CHECKS=4/4 PASS
```

These timings are environment-specific regression evidence, not a broad benchmark or a claim about production-scale routing workloads.

## Browser E2E campaign

Run:

```bash
npm run check:browser
```

The development container blocks normal local/file navigation in its centrally managed Chromium. The test therefore injects `_smoke_v03.html`, generated from the exact production HTML, CSS, and JavaScript, into a real Chromium document through the DevTools Protocol.

The browser sequence verifies:

```text
FREEHAND_SCOPE=PASS
SCHEMA_COMPILES_SELECTION=PASS
OPAQUE_SCOPE_NEGOTIATION=PASS
AGENT_AUTHORED_PLAN_REPAIR=PASS
EXACT_PLAN_AUTHORIZATION=PASS
PROTECTED_ROUTE_NON_INTERFERENCE=PASS
GLOBAL_SINGLE_OWNER_INVARIANT=PASS
PERSISTENT_LIVE_ROUTES=PASS
STALE_REPLAY=REJECTED
CONTRACT_DIFF=PASS
RESPONSIVE_SMOKE=PASS
MOBILE_SMOKE=PASS
PAGE_ERRORS=0
FINAL_LATE_COUNT=1
```

The freehand boundary is produced through Chromium pointer events, not direct store mutation.

## Evidence boundary

### Proven locally

- application state and validation semantics;
- true scoped-patch non-interference;
- one-owner global assignment integrity;
- UI-state-to-schema compilation;
- agent-authored plan contract;
- opaque WebMCP opportunity flow;
- human-facing scope and exact-plan controls;
- transactional contract replacement logic;
- registration failure visible as a degraded, zero-active-tool state;
- freehand Chromium interaction and responsive rendering;
- static server behavior and security headers;
- bounded local performance;
- zero observed browser page errors in the E2E campaign.

### Native WebMCP mission

Native WebMCP end-to-end validation passed in the Codex In-app Browser using a WebMCP-supported model. The host exposed `document.modelContext`; the exact model identifier was not exposed. This was a native host run, not local-bridge evidence.

```text
NATIVE_WEBMCP_FULL_MISSION=PASS
NATIVE_NONEMPTY_SCOPE=6 deliveries, 2 drivers
NATIVE_SCHEMA_ENUMS_MATCH_SCOPE=PASS
NATIVE_INVALID_PLAN_DIAGNOSIS=PASS
NATIVE_SCOPE_EXPANSION_REQUEST=PASS
NATIVE_CONTRACT_REFRESH=R2/C4 -> R3/C5
LATE_BEFORE=6
LATE_AFTER=1
ROUTE_CHANGES=3
OVERTIME=0
OUT_OF_SCOPE_MUTATIONS=0
PROTECTED_COMMITMENT_MUTATIONS=0
DUPLICATE_DELIVERY_OWNERS=0
NATIVE_STALE_REPLAY=REJECTED
LIVE_MUTATION_AFTER_REPLAY=0
CONSOLE_ERRORS=0
```

### Remaining evidence boundary

- LASSO does not provide browser-attested human identity for UI clicks.
- No public HTTPS deployment or production-scale dispatch integration is claimed.
- The local and native campaigns are practical release evidence, not a formal security certification, accessibility audit, or external penetration test.
