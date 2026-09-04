# Native WebMCP host promotion checklist — LASSO v0.3

Run this against the exact public HTTPS release in ChatGPT's supported browser environment or a WebMCP-enabled Chrome build.

## Completed native validation

The full mission passed on 2026-09-04 in the Codex In-app Browser using a WebMCP-supported model. The host exposed `document.modelContext`; its exact model identifier was not exposed. The validated local source produced a real non-empty human scope, native schema refresh, agent-authored plan repair, human-only expansion and exact authorization, native apply, and fail-closed stale replay.

```text
NATIVE_WEBMCP_FULL_MISSION=PASS
LATE_BEFORE=6
LATE_AFTER=1
CHANGED_ROUTES=3
OVERTIME=0
CONTRACT_REFRESH=R2/C4 -> R3/C5
OUT_OF_SCOPE_MUTATIONS=0
PROTECTED_COMMITMENT_MUTATIONS=0
DUPLICATE_DELIVERY_OWNERS=0
STALE_REPLAY=REJECTED
CONSOLE_ERRORS=0
```

The checklist below remains the reproducible procedure for a future public deployment replay; this repository publication task does not create or claim a deployed URL.

## Preconditions

```text
DEPLOYED_SOURCE_HASHES_RECORDED=YES
CLEAN_BROWSER_PROFILE=YES
DEV_QUERY_PARAMETER_ABSENT=YES
CONSOLE_ERRORS=0
```

## Native discovery

1. Open the deployed URL as a top-level page.
2. Confirm the header says **WebMCP · native**.
3. Confirm the UI reports `1/1 tools confirmed by host`.
4. Ask the agent to describe the board.
5. Verify it receives aggregate counts but no list of late-delivery IDs.

Promotion gates:

```text
NATIVE_MODEL_CONTEXT_PRESENT=PASS
INITIAL_DESCRIBE_TOOL_DISCOVERED=PASS
COARSE_RESULT_BOUNDARY=PASS
```

## Scope compilation

1. Draw a freehand boundary around D04, D07, D09, D12, D15, D18, Aino, and Leo.
2. Wait for the contract health indicator to return to ready.
3. Expand **Technical proof**.
4. Confirm the evaluate schema's `driverId` enum contains only `AINO-02`, `LEO-05`.
5. Confirm its delivery enum contains only the six selected IDs.
6. Confirm the previous contract names disappear from native discovery.

```text
NATIVE_FREEHAND_SCOPE=PASS
NATIVE_SCHEMA_ENUMS=PASS
OLD_CONTRACT_RETIRED=PASS
```

## Real-agent repair and scope negotiation

Use this user instruction:

> Recover as many late deliveries as possible without overtime. Stay within my selected scope. Author the assignments yourself, use validator feedback, and request more scope only when necessary.

Expected sequence:

1. Agent inspects the scope.
2. Its first plan should exercise or encounter the D15 refrigerated/capacity constraint. If it independently avoids the seeded invalid plan, explicitly ask it to explain why D15 cannot be assigned to Aino, then continue.
3. The validator returns structured violations and an opaque boundary opportunity.
4. Agent invokes the expansion-request tool using the opaque opportunity ID.
5. Confirm the tool response itself does not contain `MIKA-03`.
6. Confirm no authority changes before the human clicks **Include resource**.
7. Click **Include resource**.
8. Confirm a new contract appears and its driver enum now includes `MIKA-03`.

```text
REAL_AGENT_REASONING=PASS
OPAQUE_TOOL_RESULT=PASS
AGENT_CANNOT_SELF_EXPAND=PASS
HUMAN_EXPANSION_RECOMPILES_CONTRACT=PASS
```

## Exact-plan execution

Expected verified result:

```text
LATE_BEFORE=6
LATE_AFTER=1
CHANGED_ROUTES=3
NET_DISTANCE=+4.0 km
OVERTIME=0 min
D18_REMAINS_LATE=YES
```

1. Confirm no apply tool exists before human authorization.
2. Click **Authorize this exact verified plan**.
3. Confirm one consequential apply tool appears with exactly one `planId` and actuation epoch in its schema.
4. Ask the agent to apply it.
5. Confirm Aino=`D04,D07`; Leo=`D09,D12`; Mika=`D06,D15`.
6. Confirm Sara and Oskari are bit-for-bit unchanged.
7. Confirm each delivery has at most one owner.
8. Confirm the old apply capability disappears.
9. Attempt to reuse the old tool/call and verify rejection.

```text
EXACT_WRITE_APPEARS_ONLY_AFTER_HUMAN_ACTION=PASS
NATIVE_APPLY=PASS
PROTECTED_ASSIGNMENTS_UNCHANGED=PASS
GLOBAL_SINGLE_OWNER=PASS
SINGLE_USE_REPLAY=REJECTED
```

## Lifecycle stress check

Repeat one scope change immediately after an agent tool returns. Confirm:

- the tool result reaches the agent;
- the host does not report an invocation abort caused by LASSO retiring its registration;
- the next contract becomes ready;
- a deliberately induced registration failure, where feasible, is displayed as degraded rather than falsely ready.

```text
IN_FLIGHT_RESULT_SURVIVES_REFRESH=PASS
CONTRACT_REFRESH_RECOVERS=PASS
HOST_STATUS_IS_TRUTHFUL=PASS
```

## Final native verdict

Observed result:

```text
ALL_NATIVE_GATES=PASS
CONSOLE_ERRORS=0
```

Future deployment replays should also verify the public URL and capture the real-agent workflow. Do not silently replace native evidence with the local bridge.
