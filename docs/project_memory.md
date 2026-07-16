# 📚 Project Memory

_Append-only. Newest sprint at the top._

---

## Sprint: (none yet — initial state)

**Recorded:** __GENERATED_DATE__
**Branch:** `main`

### What exists

- Phoenix 1.8 scaffold generated via `mix phx.new pi_dev_setup`.
- `phx.gen.auth` applied — basic email/password authentication with `current_scope`.
- Elixir `~> 1.15` / OTP 26+.
- Ecto + PostgreSQL configured; no domain tables yet.
- Tailwind CSS v4 + esbuild configured (vanilla Phoenix 1.8 output).
- `docker-compose.yml` present for local Postgres.
- `.pi/` process tooling and `/docs/` process artifacts ported from a prior Phoenix project and adapted for this application's domain.

### What does NOT exist yet

- Any domain code.
- `PiDevSetup.Ctx` request context module.
- `PiDevSetup.Config` centralized config module.
- Any ADRs.
- `.env.example`.
- Full `mix precommit` alias (needs credo, dialyxir, sobelow deps added).

### Key process decisions (captured in styleguide / glossary / architecture)

- **Architectural layering**: Phoenix contexts with fixed internal shape (`commands/`, `queries/`, `ports/`, `adapters/`, `contracts/`, `errors/`).
- **CQS**: pragmatic — Commands required for ≥ 2 tables, cross-port, or named business operation; trivial CRUD stays as context functions.
- **Testing**: ExUnit with idiomatic `describe "func/arity"` structure + BDD phrasing in test names (outcome-first, "when" clause). Mox + hand-written fakes. Ecto sandbox against Postgres. Integration test required per Command.
- **Verification gate**: nine-step `mix precommit` pipeline (deps → compile warnings-as-errors → format → credo strict → sobelow → ecto migrate → dialyzer → test → assets).
- **Errors**: hybrid — `{:ok, _} | {:error, struct}` tuples with `defexception` structs under `<context>/errors/`. Adapters wrap vendor exceptions; domain never sees them.
- **Config**: `PiDevSetup.Config` + `NimbleOptions` schemas, validated at boot (to be established).
- **Boundary validation**: symmetric `Ecto.Changeset` + embedded schemas inbound and outbound. One Contract module per external surface.
- **QA verification script**: every sprint emits `/docs/sprint/{name}/qa-script.md` — Gherkin-style scenarios covering happy / sad / edge / authz / regression. PO seeds, Tester expands edges, Architect adds architectural edges, PM finalizes at close.
- **Size limits**: functions ~15 lines, modules ~200 soft / ~400 hard, cyclomatic complexity ≤ 9, arity ≤ 4, nesting ≤ 3.
