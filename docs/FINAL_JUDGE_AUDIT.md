# Final judge audit — LASSO v0.3

## Decision

**Feature development is frozen for this release.** The interaction model is coherent, the previously discovered boundary and WebMCP lifecycle defects have direct regression coverage, and the full native WebMCP mission has passed.

The product is plausibly a **9.5-level competition candidate** with native WebMCP replay proven. This is an internal rubric estimate, not a prediction of the judges' score.

| Criterion | Local estimate | Evidence |
|---|---:|---|
| WebMCP leverage | **9.8/10** | A freehand human gesture and visible constraints generate revision-specific typed tools; schema enums, capabilities, and exact write authority change with page state. |
| Execution | **9.6/10** | Complete shared canvas; agent-authored plans; deterministic validation; atomic scoped reducer; fail-closed contract lifecycle; 153 core checks, deterministic fuzz and source-quality gates, plus real-Chromium E2E. |
| Potential impact | **9.2/10** | Specific dispatcher/operations audience and measurable workflow value, but no customer or production deployment evidence. |
| Creativity and ambition | **9.8/10** | Direct manipulation becomes agent programming, and authority negotiation happens through the shared application rather than prompt text alone. |
| **Weighted estimate** | **9.60/10** | Native host mission passed; presentation quality remains a judging variable. |

## Why it now survives the strongest objections

### “This is just an optimizer exposed through WebMCP.”

No internal optimizer generates the answer. The external agent submits assignments. LASSO supplies scoped truth, validates the proposal, identifies violations, and commits only an authorized patch.

### “The lasso is decorative.”

The lasso changes detailed data access, allowed IDs in JSON Schema, tool identities, revision checks, and write eligibility. The technical-proof panel renders the actual contract diff and clearly distinguishes native-host confirmation from local-bridge evidence.

### “Applying a patch can disturb work outside the boundary.”

The reducer preserves every route entry outside the selected delivery set, accounts for selected drivers' protected commitments, rejects moves whose current owner is outside the selected driver scope, and validates the complete assignment graph before mutation.

### “The same delivery can end up on two routes.”

In-scope transfer removes the selected delivery from its prior in-scope owner before adding it to the new one. A global one-owner invariant runs before commit.

### “Dynamic re-registration can abort a tool while it is returning.”

Contract replacement quiesces new calls and waits for every in-flight invocation to settle before retiring the old registration. Candidate tools remain inactive until the registration context confirms the entire desired surface. The native host mission confirmed revision replacement and stale registration rejection.

### “The UI can claim tools that failed to register.”

Any partial registration failure aborts the candidate, retires the active surface, displays a degraded state, and reports zero active tools. Failed registration names are never reused.

### “Opaque scope negotiation proves information privacy.”

The product does not make that overclaim. Outside resource IDs are excluded from the relevant WebMCP tool result until approval. The human-facing map may still render information a browser agent can perceive. This is tool-level least disclosure, not browser-level secrecy.

### “Human approval is cryptographically proven.”

No. The workflow exposes no WebMCP operation for granting scope or exact approval, but this demo does not provide browser-attested human identity. Production-grade identity and server-side authorization are explicitly out of scope.

## Completed native gates

```text
NATIVE_INITIAL_DISCOVERY=PASS
NATIVE_SCOPE_REFRESH=PASS
REAL_AGENT_INVALID_PLAN_AND_REPAIR=PASS
NATIVE_EXACT_APPLY=PASS
NATIVE_STALE_REPLAY=REJECTED
OUT_OF_SCOPE_MUTATIONS=0
PROTECTED_COMMITMENT_MUTATIONS=0
DUPLICATE_DELIVERY_OWNERS=0
```

Public deployment and final video production are separate submission activities and are not claimed by this source release.

## Freeze rule

After native compatibility corrections, permit only:

- a fix required to make the documented flow work;
- copy or layout corrections that do not alter semantics;
- release metadata and evidence updates.

Do not add another domain, backend, authentication layer, routing API, scenario, or generic workflow designer before submission.
