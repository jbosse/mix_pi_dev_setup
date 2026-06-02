# 📖 Glossary

The canonical vocabulary of this codebase. Names in code, tests, docs, and commits **must** use these terms. No synonym drift.

New terms require the Architect to extend this glossary during sprint planning.

---

## 🏷 Domain Terms

_Domain terms are defined sprint by sprint as the product takes shape. When the Architect introduces a new concept during planning, it is added here. Until then, this section intentionally has no entries — a fresh project has no domain yet._

_The Architect owns this section. If PO or Builder uses a term that isn't here, flag it during planning and add the canonical definition._

---

## 🧱 Architectural Terms

### Context
A Phoenix context module (`StaffForecast.Forecasts`, `StaffForecast.Accounts`, …) — the public API boundary for a bounded-context slice. Owns its `commands/`, `queries/`, `ports/`, `adapters/`, `contracts/`, and `errors/` subdirectories.

### Command
A module under `lib/staff_forecast/<context>/commands/` exposing a single public `execute/2`. One Command = one business write operation. All writes wrapped in exactly one `Ecto.Multi`. Required when an operation touches ≥ 2 tables, crosses a port/adapter, or has a named business meaning (see styleguide § Command/Query Separation).

### Query
A module under `lib/staff_forecast/<context>/queries/` exposing a single public `run/2`. Reads only — never writes.

### Port
A behaviour under `lib/staff_forecast/<context>/ports/`. The capability the domain needs, vendor-agnostic.

### Adapter
A concrete implementation of a Port under `lib/staff_forecast/<context>/adapters/`. The **only** layer allowed to `alias` a vendor SDK or call `Req` directly.

### Contract
An `Ecto` embedded-schema module under `lib/staff_forecast/<context>/contracts/` validating an external boundary (inbound LiveView event, controller params, background job args, vendor response, outbound vendor request). See styleguide § Boundary Validation.

### Domain Error
A struct (`defexception` so it's also raisable) under `lib/staff_forecast/<context>/errors/`, returned in `{:error, struct}` tuples from Commands / Queries / Adapters. See styleguide § Error Handling.

### Ctx
The `%StaffForecast.Ctx{}` struct threaded as the **first argument** to every Command and Query. Carries `correlation_id`, `user_id`. Mirrored into `Logger.metadata/1` at the Command boundary via `StaffForecast.Ctx.stamp_metadata/1`. Established in the first sprint that introduces Commands.

### Correlation ID
A UUID generated at request entry (or inherited from an upstream trace) carried in `%Ctx{}`. Stamped on every log line for the lifetime of the request.

### Config
`StaffForecast.Config` — the single module permitted to call `Application.get_env/2`. Established when the first sprint needs centralized config access. See styleguide § Config & Secrets.

---

## 🚫 Banned Synonyms

Do not use the terms on the left in code, tests, or docs — use the canonical term on the right.

| Banned                               | Use instead       |
|--------------------------------------|-------------------|
| Repository (as a code noun)          | **Context** (public API), **Command**, or **Query** — no generic repositories |
| Service (generic)                    | Use role suffix: **Command / Query / Adapter** |
| Interactor, UseCase                  | **Command** or **Query** |
| DAO, Mapper                          | Use `Ecto.Schema` directly — no extra indirection |
| Provider (generic, outside a named port) | Name the role specifically |

_Additional banned synonyms are added here as the domain is defined and incorrect alternatives emerge in practice._
