# Security policy

## Supported release

Security fixes are maintained for the current `v0.3.x` release line.

LASSO is a static competition prototype. It has no accounts, backend, persistence, payments, secrets, or external data integrations. The production browser runtime has no third-party dependencies or network calls.

## Enforced application boundary

- WebMCP schemas expose only resources selected by the human-facing workflow. Schemas narrow discovery and valid inputs, but are not treated as the authorization boundary.
- Runtime handlers independently revalidate workspace generation, scope revision, argument shape, resource membership, human constraints, and exact-plan authorization.
- Agent plans are applied as atomic scoped patches. Outside-scope commitments remain unchanged, and the complete live graph must retain at most one owner per delivery.
- Selected drivers' outside-scope work is disclosed to tools only as aggregate protected commitments.
- Scope expansion is a human-only action. Before approval, the agent receives an opaque opportunity rather than the resource identity.
- Consequential execution requires one exact, current, unexpired authorization. It is bound to the full live-state envelope and is single-use.
- Contract refresh waits for in-flight calls to settle. Partial host registration fails closed with zero active tools, and failed registration names are never reused.
- The included server exposes an explicit runtime-asset allow-list, accepts only GET and HEAD, rejects traversal and symlink escape, and emits restrictive browser security headers.

## Deployment notes

Serve the project over HTTPS. Keep the supplied Content Security Policy and security headers. The included Node server is suitable for local validation and simple static deployment; a production service would additionally need maintained TLS termination, access logging, abuse controls, server-side identity, persistence, authorization, and audit storage.

## Explicit non-claims

- LASSO does not authenticate the visiting agent or provide browser-attested proof that a UI action came from a human.
- It is not a general internet-wide authorization system.
- Excluding outside-scope identities from WebMCP results does not make information already rendered in the human-facing page secret from a browser agent.
- The short plan fingerprint is a deterministic workflow identifier, not a cryptographic signature. Authorization also compares the complete canonical state envelope and does not rely on collision resistance alone.
- A user with DevTools access can modify their own client-side state.
- The included checks are practical hackathon hardening, not an external penetration test, formal accessibility audit, or production security certification.

## Reporting

Use GitHub's private vulnerability reporting for this repository rather than opening a public issue. Include the exact source revision, host/browser version, and minimal reproduction steps, but do not include private operational data. If private reporting is unavailable, contact the repository owner through their GitHub profile before public disclosure.
