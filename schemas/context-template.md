---
name: <repo-name>
path: ./<repo-name>
languages: []
frameworks: []
owns: []
endpoints: []
emits: []
consumes: []
dependsOn: []
providesTo: []
# ── Extended contract fields (fill in what applies; delete what doesn't) ──────
owner:
  team: ""          # e.g. "Platform", "Payments"
  contact: ""       # e.g. Slack channel, email alias, or GitHub team
  oncall: ""        # e.g. PagerDuty rotation name
apiVersion: ""      # e.g. "v2" — the current public API version
deprecates: []      # older versions this release supersedes, e.g. ["v1"]
authContracts:
  # JWT claims this service expects on inbound requests
  requires: []      # e.g. ["sub (userId UUID)", "role (admin|user)", "email"]
  # JWT claims this service adds to tokens it issues (auth services only)
  issues: []        # e.g. ["sub", "role", "email", "iat", "exp"]
  # Scopes or RBAC roles required to call each endpoint group
  scopes: []        # e.g. ["read:orders", "write:payments"]
errorContracts:
  # HTTP status codes this service deliberately returns and their semantics
  codes: []         # e.g. ["400 validation failure", "401 invalid/expired token", "422 business rule violation", "503 dependency down"]
  # Are mutating endpoints idempotent? (safe to retry on timeout?)
  idempotent: null  # true | false | "partial — see Known issues"
  # Retry semantics callers should use
  retryOn: []       # e.g. ["503", "429"] — status codes safe to retry
  retryStrategy: "" # e.g. "exponential backoff, max 3 attempts"
configContracts:
  # Environment variables this service shares with or depends on from other services
  envVars: []       # e.g. ["JWT_SECRET (shared with auth-service)", "PAYMENTS_BASE_URL"]
  featureFlags: []  # e.g. ["ENABLE_NEW_CHECKOUT (LaunchDarkly)", "USE_V2_PRICING"]
dataContracts:
  # DB tables or cache keys that other services read or write directly
  sharedTables: []  # e.g. ["users.id (read by notifications)", "orders.status (polled by shipping)"]
  sharedCacheKeys: [] # e.g. ["session:<userId> (read by api-gateway)"]
serviceLevel:
  latencyTarget: "" # e.g. "p95 < 200ms"
  throughput: ""    # e.g. "500 RPS sustained, burst to 2000"
  availability: ""  # e.g. "99.9% (allows ~8.7h downtime/year)"
  degradedMode: ""  # e.g. "returns cached data when DB is unreachable"
testContracts:
  # Test suites other teams should run before changing shared contracts
  integrationSuite: "" # e.g. "npm run test:integration in auth-service"
  contractTests: []    # e.g. ["pact/auth-payments.json"] — Pact or CDC test files
  e2eScenarios: []     # e.g. ["checkout happy path", "401 on expired token"]
# fingerprint and lastIndexed are managed by /repo-orch-sync — do not edit manually
---

# `<repo-name>` — context

## Purpose

<!-- What is this service's single responsibility? What business capability does it own?
     One paragraph. Avoid "it does X and Y and Z" — if you need more than one sentence, the service may own too much. -->

## Architecture and key modules

<!-- Entry points, layering, important directories and what lives there.
     Example:
       src/
         controllers/   HTTP handlers — thin, delegate to services
         services/      Business logic — where rules live
         repositories/  DB access — never called from controllers directly
         events/        Event publishers and handlers
     List the 3–5 files a new engineer would read first. -->

## Public contracts

### Endpoints

<!-- List each endpoint with its purpose and the shape of request/response.
     Example:
       POST /login — accepts { email, password }, returns { accessToken, refreshToken }
       GET  /users/:id — requires Bearer token, returns UserDTO -->

### Events

<!-- What events does this service emit, and what payload do they carry?
     What events does it consume, and what does it do with them?
     Example:
       Emits: payment.succeeded { orderId, amount, currency, timestamp }
       Consumes: order.created → reserves inventory -->

### Shared contracts

<!-- JWT claims, RBAC roles, shared DB fields, cache keys, env vars that other services depend on.
     Be specific — if auth-service issues a `sub` claim that payments reads, say so here.
     This section is what specialists use to flag breaking changes. -->

## Data stores

<!-- Databases, schemas, migrations of note.
     Include: DB type, schema name, tables owned, migration tooling.
     Flag tables that other services read directly (those are shared data contracts). -->

## Error handling and failure modes

<!-- How does this service fail? What does a caller experience when it is degraded?
     Include: circuit breaker behavior, fallback responses, retry guidance.
     Example: "Returns 503 with Retry-After header when DB pool exhausted.
               Callers should back off 5s and retry up to 3 times." -->

## Cross-repo dependencies

<!-- What does this service need from which repos, and what does it provide?
     Be directional: "calls payments-service POST /charge — if payments is down, orders fail open (returns 202 pending)"
     This drives the dependency ordering in triage plans. -->

## Versioning and migration

<!-- Current API version, deprecated versions still in service, and planned breaking changes.
     Example: "v1 deprecated — sunset 2026-Q3. v2 adds required `idempotencyKey` field on POST /charge." -->

## Known issues and gotchas

<!-- Sharp edges a specialist must know before proposing changes.
     Example: "Migrations run on startup — a bad migration will crash ALL instances on deploy."
              "The /health endpoint bypasses auth — do not put sensitive data in it."
              "Event order is not guaranteed — consumers must be idempotent." -->

## Glossary

<!-- Domain terms specific to this service that a generalist might not know.
     Example: "Settlement — the process of transferring funds from escrow to merchant, runs nightly." -->
