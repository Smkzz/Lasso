# Devpost submission draft — LASSO

## Title

**LASSO — Draw what your agent can touch**

## One-line description

A human draws scope on a live operations map, and the page compiles that gesture into the visiting agent's typed, revision-specific WebMCP contract.

## Tagline

**The map is the prompt. The boundary is the permission.**

## Inspiration

Humans often understand operational scope spatially: these deliveries, those drivers, this region, not the rest. Yet giving an AI the same context normally means enumerating IDs in text, synchronizing browser state with a separate service, or granting broader authority than intended.

LASSO explores a more direct agent-native web interaction: the person points, and the webpage itself turns that transient gesture into a typed capability surface.

## What it does

A dispatcher draws a freehand lasso around deliveries and drivers. LASSO generates WebMCP tools whose schemas contain only those resource IDs and the currently visible human constraints.

The external agent—not an internal optimizer—authors a driver-to-delivery recovery patch. LASSO deterministically validates scope, ownership, protected commitments, capacity, vehicle capability, timing, overtime, and the human's route-change limit.

When the current boundary is insufficient, the validator returns an opaque opportunity. The agent may request it, but cannot add it to its own contract. A human approval invalidates the previous tool revision and compiles a new one. Only after the human authorizes one exact verified plan does a consequential, expiring, single-use apply tool appear.

## Why WebMCP is fundamental

Most agent integrations expose a stable API next to a human interface. LASSO makes the **human interface generate the API**.

- The freehand selection becomes JSON Schema enums.
- Human constraints become revisioned policy.
- Scope negotiation changes native tool identities.
- Exact approval adds one narrow write capability.
- Execution removes it again.

A screenshot-based agent may see highlights, but seeing a highlight does not make it an app-authored semantic or execution contract. A traditional remote MCP server would need custom synchronization to learn what the person just selected in the browser. With WebMCP, the live page is both the shared workspace and the capability provider.

## Human and agent roles

**Human:** chooses spatial context and constraints, approves scope expansion, and authorizes one exact plan.

**Agent:** reads selected operational data, authors assignments, interprets validator feedback, repairs the plan, and requests additional scope when needed.

**LASSO:** compiles the contract, validates proposals, preserves outside commitments, and applies only a current authorized patch.

## Demonstrated result

The incident begins with six late deliveries. The final plan recovers five with three changed routes, +4.0 km, and zero overtime. D18 remains late because its recovery window is already closed.

The applied route graph preserves Aino's D04, Leo's D12, Mika's outside-scope D06, and every route belonging to unselected drivers. The complete graph retains one owner per delivery.

## Safety and engineering

- Runtime enforcement is independent of tool-discovery schemas.
- Contract names include workspace generation, scope revision, and a non-reused registration serial.
- Contract swaps wait for in-flight calls to settle.
- Partial host registration fails closed and is visible to the human.
- Exact authorization is bound to the current plan and live state, expires after five minutes, and is single-use.
- The production runtime has no external dependencies or network calls.
- A hardened allow-list static server, deterministic CI gate, and explicit security non-claims are included.

Final evidence includes 153 deterministic invariants, a 5,000-case deterministic fuzz campaign, 59 source-quality checks, 82 package/static checks, 25 HTTP-security checks, a bounded performance gate, and a real-Chromium pointer-driven E2E campaign with zero page errors. The native WebMCP mission also passed in the Codex In-app Browser: six late deliveries became one with three route changes, zero overtime, no out-of-scope or protected-commitment mutations, no duplicate owners, and stale replay rejected.

## Challenges

The hardest part was making the boundary real rather than decorative. Our first reducer replaced whole driver routes, which could disturb outside-scope work or create duplicate delivery ownership. We rebuilt it as an atomic scoped patch with protected commitments and global assignment validation.

We also found that retiring a WebMCP registration while its invocation was returning could create a lifecycle race. The final bridge quiesces the contract, waits for all in-flight calls to settle, and activates a new surface only after the host confirms every desired tool.

## What is next

The interaction primitive can generalize to CAD, network topology, warehouses, schedules, incident maps, analytics canvases, and other interfaces where people communicate context by pointing rather than enumerating objects.

A production version would add server-side identity, persistence, authorization, cryptographic audit records, real dispatch integrations, and customer validation. The current build intentionally makes no claim to provide those controls.

## Built with

JavaScript, HTML, CSS, SVG, WebMCP imperative registration, Node.js, Python test tooling, Chrome DevTools Protocol, and GitHub Actions.
