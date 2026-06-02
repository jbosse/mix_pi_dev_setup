# 🏛 Architecture — StaffForecast

_Living document. Updated at sprint close by PM (targeted sections only). See `docs/sprint/*/architecture.md` for sprint-specific detail._

---

## Current State

Phoenix 1.8 scaffold generated via `mix phx.new`. `phx.gen.auth` applied — basic email/password authentication with `current_scope`. No domain code exists yet. All contexts, Commands, Queries, Ports, Adapters, and Contracts are TBD and will be defined sprint by sprint.

## Stack

| Concern                      | Technology |
|------------------------------|------------|
| Language                     | Elixir `~> 1.15` on OTP 26+ |
| Framework                    | Phoenix `~> 1.8` + LiveView |
| Database                     | PostgreSQL via Ecto |
| ORM                          | Ecto |
| HTTP client                  | `Req` (sole permitted client; see `AGENTS.md`) |
| Static analysis              | Credo, Dialyzer, Sobelow |
| Styling                      | Tailwind CSS v4, esbuild |

## Layering

Phoenix contexts as bounded-context boundaries, with a fixed internal shape. Full rules in [`/docs/styleguide.md` § Architecture](./styleguide.md#-architecture).

```
lib/staff_forecast_web/               ← Thin: parse, authorize, dispatch. No business logic.
lib/staff_forecast/<context>/
  ├── commands/                       ← Write ops. Single `execute/2`. Ecto.Multi.
  ├── queries/                        ← Read ops. Single `run/2`. No writes.
  ├── ports/                          ← Behaviours (capabilities the domain needs).
  ├── adapters/                       ← Only layer that may import vendor SDKs or call Req.
  ├── contracts/                      ← Embedded-schema changesets for boundary validation.
  ├── errors/                         ← Domain error structs (`defexception`).
  └── <context>.ex                    ← Public API façade.
```

Domain modules depend only on ports. Adapters are wired in via `config/runtime.exs` → `StaffForecast.Config` (to be established) → application supervision tree.

## Key Patterns

- **Command** — one class, one `execute/2`, writes wrapped in one `Ecto.Multi`. Threshold rules in the styleguide.
- **Query** — one class, one `run/2`, reads only.
- **Ports & Adapters** — all external integrations behind a behaviour.

No pattern is introduced without a named justification in an ADR or the sprint's Architect design.

## Request context (`%Ctx{}`)

Every Command and Query will take `%StaffForecast.Ctx{}` as its first argument. `StaffForecast.Ctx.stamp_metadata/1` mirrors the context into `Logger.metadata/1` at the Command boundary. This will be established in the first sprint that introduces Commands. Until then, follow the sprint architecture.md.

## Config

- `config/runtime.exs` is the **only** place `System.get_env/1` runs.
- `StaffForecast.Config` will be the **only** place `Application.get_env/2` runs — to be established when needed.
- Dev: `source .env.local` (gitignored). `.env.example` committed with placeholders.

## Boundary validation

`Ecto.Changeset` + embedded schema, symmetric inbound and outbound. Contracts live under `lib/staff_forecast/<context>/contracts/`. Domain code never accepts raw `params` maps.

## Pipeline

`mix precommit` runs the nine-step verification pipeline — see [`/docs/styleguide.md` § Verification Gate](./styleguide.md#-verification-gate).

## Authentication Architecture

Standard `phx.gen.auth` — email/password with `current_scope`. No TFA or passkeys wired yet.

## Known Gaps

- No domain code. All contexts, Commands, Queries, Ports, Adapters, Contracts TBD.
- `StaffForecast.Config` module not yet established.
- `StaffForecast.Ctx` module not yet established.
- `.env.example` not yet created.
- No ADRs.
- `mix precommit` alias needs expansion to the full nine-step pipeline (requires credo, dialyxir, sobelow deps).
