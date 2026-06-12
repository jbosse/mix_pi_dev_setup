---
name: styleguide-check
description: Shared styleguide + glossary checklist used by Builder (self-audit) and Reviewer (enforcement). Single source of truth so the two agents stay aligned without duplicating rules across skill files.
---

# 📏 Styleguide Check skill

Always load **both**:

1. `/docs/styleguide.md` — the full rulebook.
2. `/docs/glossary.md` — domain vocabulary. Synonym drift is a fail.

Also load `/AGENTS.md` for Phoenix 1.8 / LiveView / Elixir rules that this project inherits wholesale.

## Quick self-audit checklist

Use this as a fast pre-handoff pass. Anything ambiguous → defer to the full styleguide.

### Structure & SRP
- [ ] Function ≤ ~15 lines
- [ ] Module ≤ ~200 soft / ~400 hard lines
- [ ] Cyclomatic complexity ≤ 9 (Credo)
- [ ] Positional arity ≤ 4 (else keyword opts or struct)
- [ ] Nesting depth ≤ 3
- [ ] Pipe chain ≤ 7 steps before extraction
- [ ] One public function per Command (`execute/2`), one per Query (`run/2`)

### Layering & CQS
- [ ] `pi_dev_setup_web/` calls only context public APIs — no reaching into `commands/` / `queries/`
- [ ] Domain (`commands/`, `queries/`, `contracts/`, `errors/`) depends only on `ports/` behaviours — never on a concrete adapter or vendor SDK
- [ ] Vendor SDKs / `Req` calls live only in `adapters/`
- [ ] Every Command wraps its writes in exactly one `Ecto.Multi`
- [ ] Queries perform no writes
- [ ] Command threshold respected: ≥ 2 tables / crosses a port / named business operation → Command module; else plain context function is fine

### Context threading (`%Ctx{}`)
- [ ] Every Command and Query takes `%PiDevSetup.Ctx{}` as first arg (once established in the project — follow the sprint's architecture.md for guidance)
- [ ] `PiDevSetup.Ctx.stamp_metadata/1` called at the Command/Query boundary — not hand-rolled `Logger.metadata/1`

### Naming
- [ ] Files `snake_case.ex`; no role suffix in filename (path carries the role)
- [ ] Modules `PascalCase`; role in namespace (`Commands.CreateForecast`, not `CreateForecastCommand`)
- [ ] Functions `snake_case`, verb-first
- [ ] Predicates end `?`, never `is_` prefix (guards only per `AGENTS.md`)
- [ ] No abbreviations except: `id`, `url`, `db`, `ctx`, `pid`, `ref`, `opts`
- [ ] Domain terms match `/docs/glossary.md` — no banned synonyms

### Docs
- [ ] `@moduledoc` on every module (or justified `@moduledoc false`)
- [ ] `@doc` + `@spec` on every public function
- [ ] `@typedoc` on every `@type` in a public `@spec`
- [ ] Behaviour callbacks have `@callback` + `@doc` + `@spec`
- [ ] Inline comments only for decisions / non-obvious branches / workarounds (why, not what)
- [ ] No redundant comments, no commented-out code, no orphan TODOs
- [ ] No `IO.inspect`, no `dbg/1`, no `IO.puts` in committed code

### Errors
- [ ] Commands / Queries return `{:ok, _} | {:error, reason}`; no raise on expected branches
- [ ] `reason` is a struct from `<context>/errors/` (defined via `defexception`)
- [ ] Adapters catch vendor exceptions and return wrapped domain errors — vendor exceptions never leak to `/lib`
- [ ] No `rescue _ in _ ->` wildcards — specific exception types only
- [ ] `Logger.error` (or equivalent) called before returning `{:error, _}` at context boundaries
- [ ] No `raise "string"` in domain code

### Logging
- [ ] All logs via `Logger` (no `IO.puts`, no `IO.inspect` outside `iex`/tests)
- [ ] No PII, no secrets, no session tokens, no raw API response bodies in any log line

### DB & Migrations
- [ ] All writes inside Commands, inside one `Ecto.Multi`
- [ ] Queries perform no writes
- [ ] No raw SQL (`Repo.query/2`, string-interpolated fragments) without ADR
- [ ] Unique constraints on natural keys; upserts use `on_conflict` + `conflict_target`
- [ ] `Ecto.Changeset.get_field/2` used — no map access on changesets/structs
- [ ] Programmatic fields (`user_id`) set explicitly, not via `cast/3`
- [ ] Associations preloaded for template-rendered queries

### Boundary validation
- [ ] Every external input (LiveView event, controller params, job args, vendor response) validated via a Contract (embedded-schema changeset)
- [ ] Domain functions take validated structs — never raw `params` maps
- [ ] `Ecto.Schema`-derived types used — no hand-rolled duplicates

### Config & Secrets
- [ ] `System.get_env/1` only in `config/runtime.exs`
- [ ] `Application.get_env/2` only in the app's config module (per sprint architecture.md)
- [ ] No secret literals in `lib/` or `test/`
- [ ] `.env.local` gitignored; `.env.example` has placeholders only

### Patterns
- [ ] No GoF pattern without ADR or Architect design justification
- [ ] No Singleton beyond natural named-process registry use
- [ ] Composition over `use`-macro inheritance; any new `use` macro has a named reason

### Testing
- [ ] Outer `describe "function_name/arity"` — idiomatic ExUnit
- [ ] Test names are BDD sentences: outcome-first, `when`/`if`/`for` clause
- [ ] No `"it should"`, no `"test "` prefix in test names
- [ ] One AC → one `test`
- [ ] Happy + sad path per Command
- [ ] Integration test present for every Command
- [ ] Fakes in `test/support/fakes/` or Mox — no `:meck` / `Mimic` without ADR
- [ ] No `@tag :skip` / `@tag :focus` committed

### Hygiene
- [ ] No debug artifacts (`IO.inspect`, `dbg/1`, `@tag :skip`, commented-out code)
- [ ] Builder stayed inside declared file ownership
- [ ] Commit message matches the `/docs/ORCHESTRATION.md` format
