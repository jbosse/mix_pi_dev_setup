# 📐 Code Policies & Styleguide

The rules below are **enforceable**. Reviewer applies them per-task; `mix credo --strict`, `mix dialyzer`, `mix format`, and `mix sobelow` enforce what they can at the verification gate.

The single goal: **NO CRAP CODE**.

---

## 🧰 Tooling Baseline

- **Language**: Elixir `~> 1.15` on OTP 26+.
- **Framework**: Phoenix `~> 1.8` + LiveView.
- **Database**: PostgreSQL via Ecto.
- **HTTP**: `Req` only (per `AGENTS.md`). `:httpoison`, `:tesla`, `:httpc` are banned.
- **Formatter**: `mix format`. Law. No debate.
- **Linter**: `mix credo --strict`. Config tuned to the limits in this document.
- **Static analysis**: `mix dialyzer` on every gate. Behaviours must have `@spec`s.
- **Security static analysis**: `mix sobelow --config` on every gate.
- **Styling**: Tailwind v4 per `AGENTS.md` (`@import "tailwindcss" source(none);` etc.). `app.js` + `app.css` only — no extra bundles, no external CDN scripts.

Everything above runs through `mix precommit`. If a rule is not machine-enforceable, the Reviewer enforces it. See the full list under [Verification Gate](#-verification-gate).

---

## 📏 Size & Complexity Limits

| Rule                         | Limit                     | Enforced by            |
|------------------------------|---------------------------|------------------------|
| Function length              | ~15 lines                 | Reviewer               |
| Module length (soft)         | ~200 lines                | Reviewer               |
| Module length (hard)         | ~400 lines → must split   | Reviewer               |
| Cyclomatic complexity        | ≤ 9 per function          | Credo                  |
| Function arity               | ≤ 4 positional args       | Reviewer               |
| Nesting depth                | ≤ 3 (`if`/`case`/`cond`/`with`) | Credo            |
| Pipe chain length            | ≤ 7 steps                 | Credo + Reviewer       |

Arities above 4 must take an options `keyword` or a struct. Over-limit code requires an inline justification comment **and** a Reviewer decision, otherwise → fail.

---

## 🏛 Architecture

**Phoenix contexts as bounded-context boundaries, with a disciplined internal shape.** Contexts own the public API. Inside each context, structure is fixed:

```
lib/__APP_WEB_NAME__/               ← Controllers, LiveViews, components. Thin.
                                        Parse, authorize, dispatch. No business logic.
lib/__APP_NAME__/                   ← Domain. One directory per context.
lib/__APP_NAME__/<context>/
  ├── commands/                       ← Write operations. One module, one `execute/2`.
  ├── queries/                        ← Read operations. One module, one `run/2`.
  ├── ports/                          ← Behaviours. The capabilities the domain needs.
  ├── adapters/                       ← Concrete port implementations. ONLY layer
                                        allowed to import vendor SDKs or call `Req`.
  ├── contracts/                      ← `Ecto` embedded-schema modules for boundary
                                        validation (inbound + outbound).
  ├── errors/                         ← Domain error structs (`defexception`).
  └── <context>.ex                    ← Public API façade. Re-exports / thin delegations.
```

**Layering rules (Reviewer fails any violation):**

- `__APP_WEB_NAME__/` may only call the public API of contexts in `__APP_NAME__/`.
- Contexts may only call *other* contexts via their public API façade — never reach into another context's `commands/` / `queries/` directly.
- Domain code (`commands/`, `queries/`, `contracts/`, `errors/`) may only depend on `ports/` (behaviours). Never on a concrete module from `adapters/`. Never on a vendor SDK directly.
- `adapters/` is the only layer that may `alias` a vendor lib or `Req`.

### Command/Query Separation (CQS) — pragmatic

**Commands** are required when a write operation:

1. Touches ≥ 2 tables, OR
2. Crosses a port/adapter (external HTTP, email, file storage, etc.), OR
3. Has a named business meaning.

For trivial single-table CRUD, a plain context function is fine. Queries follow the same threshold.

**Command rules:**
- One public function: `execute(ctx, input)`.
- All writes wrapped in exactly one `Ecto.Multi`.
- Returns `{:ok, result} | {:error, reason}`. Never raises for expected branches.
- Input is a validated struct from `contracts/` — never a raw `params` map.

**Query rules:**
- One public function: `run(ctx, input)`.
- Reads only. No `updated_at` touches. No `Repo.insert/1` anywhere.
- Returns `{:ok, data} | {:error, :not_found}` (or a structured error for richer cases).

### Dependency injection

- Ports are Elixir behaviours. Adapters `@behaviour`-implement them.
- Wiring happens in `config/runtime.exs` via the app's config module. No DI framework.
- Adapters are selected by config key, not `Code.ensure_loaded?/1` trickery.

---

## 🧵 Request context (`%Ctx{}`)

Every Command and Query should take a `%__APP_MODULE__.Ctx{}` struct as its first argument, carrying:

- `correlation_id` (UUID, generated at request entry)
- `user_id` / `current_scope` slice

The **first action** of every Command/Query is `__APP_MODULE__.Ctx.stamp_metadata(ctx)`, which mirrors the context into `Logger.metadata/1`. Builders never touch `Logger.metadata` by hand — the helper is the single call site.

`%Ctx{}` threading is established during the first sprint that introduces Commands. Until then, follow the sprint's architecture.md for how context is threaded. Missing `%Ctx{}` threading after it's established → Reviewer fail.

---

## ❗ Error Handling

1. **Expected failures return tagged tuples.** Commands and Queries return `{:ok, result} | {:error, reason}`. `reason` is a **domain error struct** under `lib/__APP_NAME__/<context>/errors/` — defined via `defexception` so it's *both* pattern-matchable as `{:error, struct}` **and** raisable when exceptional.
   ```elixir
   defmodule __APP_MODULE__.Forecasts.Errors.InvalidPeriod do
     @moduledoc "Raised when a forecast is created with an invalid period."
     defexception [:period, :reason]

     @impl true
     def message(%__MODULE__{period: p}), do: "invalid period: #{inspect(p)}"
   end
   ```
2. **Exceptions are for exceptional cases only** — programmer error, contract violation, infra down. Raising on expected business branches → fail.
3. **Adapters never leak vendor exceptions.** Every adapter catches vendor errors, wraps in a domain error struct, and returns `{:error, %<Context>.Errors.<Name>{cause: original}}`. A vendor exception leaking into `/lib/__APP_NAME__/<context>/commands/` → fail.
4. **No `rescue _ in _ ->` wildcards.** Always pattern-match specific exception types, then wrap-and-rethrow or wrap-and-return.
5. **Log before returning `{:error, _}`** at context boundaries. Silent error swallowing → fail.
6. **`with` chains** are the preferred composition. Bare `try/rescue` in domain code requires an inline justification comment referencing an ADR.
7. **Never `raise "string"`** in domain code — always a specific exception struct.

---

## 🪵 Logging

- **`Logger`** is the only logging API. `IO.puts`, `IO.inspect` (outside tests/`iex`), and `dbg/1` in committed code → Reviewer fail.
- **Levels**: `:debug` / `:info` / `:warning` / `:error`. No `:warn` (deprecated).
- **Never log** (Security fails hard):
  - Secrets, API keys, session tokens
  - User PII beyond what's necessary for diagnostics
  - Raw request/response bodies from external services

---

## 🧪 Testing (ExUnit + BDD phrasing)

- Tests live in `/test/` and **mirror `/lib/`** structure: `test/__APP_NAME__/forecasts/commands/create_forecast_test.exs` ↔ `lib/__APP_NAME__/forecasts/commands/create_forecast.ex`.
- **Structural convention is idiomatic ExUnit** — outer `describe` names the function under test: `describe "execute/2"`. One `describe` per public function.
- **BDD phrasing lives in the test names**: outcome-first, followed by a `when` / `if` / `for` clause.
  ```elixir
  describe "execute/2" do
    test "returns {:ok, %Forecast{}} when attrs are valid", %{ctx: ctx} do
      ...
    end

    test "returns {:error, %InvalidPeriod{}} when period format is wrong", %{ctx: ctx} do
      ...
    end
  end
  ```
- **One acceptance criterion → one `test` → one `Scenario:` in `qa-script.md`.** Every AC from the PO story appears in exactly three places.
- **Banned in test names**: `"it should "`, `"test "` prefixes.

### Doubles

- **Mox** for port behaviours — per-test expectations, `:verify_on_exit!` everywhere.
- **Hand-written fakes** under `test/support/fakes/` when state is needed.
- **Meck / Mimic / etc.** require an ADR. Bare `:meck.expect` calls → Reviewer fail.

### Test substrate

- `Ecto.Adapters.SQL.Sandbox` against real Postgres (`MIX_ENV=test`).
- **Integration test required for every Command.**
- **Happy + sad path required per Command.**
- **External services**: behind a port + fake/Mox. A raw `Req` call outside `adapters/` → Reviewer fail. Recorded JSON fixtures live in `test/fixtures/<service>/`.

### LiveView tests

Follow the `AGENTS.md` rules verbatim — stable DOM ids on key elements, `has_element?/2` and `element/2` over raw HTML assertions, `render_change/2` + `render_submit/2` for form interactions.

---

## 💬 Comments & Documentation

- **Every module**: `@moduledoc` — one-line purpose + why it exists.
- **Every public function**: `@doc` describing purpose; `@spec` for Dialyzer.
- **Behaviour callbacks**: `@callback` + `@doc` + `@spec`.
- **Inline comments** are reserved for decisions, non-obvious branches, and workarounds — why, not what.
- **Banned:**
  - Redundant comments
  - Commented-out code (delete it — git remembers)
  - `# TODO` without owner / ticket / ADR reference
- **ADRs**: every cross-file or cross-sprint decision goes in `/docs/adr/NNN-title.md`.

---

## 🏷 Naming Conventions

- **Files**: `snake_case.ex` / `snake_case_test.exs`. One module per file. **No role suffix in the filename** — the path carries the role (`commands/create_forecast.ex`, not `commands/create_forecast_command.ex`).
- **Modules**: `PascalCase`, role carried in the namespace:
  - `__APP_MODULE__.Forecasts.Commands.CreateForecast`
  - `__APP_MODULE__.Forecasts.Queries.ListForecasts`
  - `__APP_MODULE__.Forecasts.Ports.ScheduleProvider`
  - `__APP_MODULE__.Forecasts.Adapters.HRSystem`
  - `__APP_MODULE__.Forecasts.Contracts.CreateForecastInput`
  - `__APP_MODULE__.Forecasts.Errors.InvalidPeriod`
- **Functions**: `snake_case` verbs first — `create_forecast/2`, `list_forecasts/1`.
- **Commands**: single public function `execute/1` or `execute/2`.
- **Queries**: single public function `run/1` or `run/2`.
- **Predicates**: end with `?`, never start with `is_` — `valid?/1`, `published?/1`.
- **No abbreviations** except universally known: `id`, `url`, `db`, `ctx`, `pid`, `ref`, `opts`.
- **Domain vocabulary** must match `/docs/glossary.md`. No synonym drift.

---

## 🧱 SOLID & GoF

- **SRP** is the north star — enforced by size limits, CQS, and one-public-function-per-Command/Query.
- **GoF patterns are opt-in, never speculative.** No pattern without a named reason in an ADR or the sprint Architect design.
- **Pre-blessed patterns** for this codebase:
  - **Command** — baked in.
  - **Adapter** — every port implementation.
- **Banned**: Singleton (beyond Elixir's natural `GenServer`-with-fixed-name registry). Service Locator.

---

## 🗄 Database & Transactions

1. **All writes live inside Commands.** All Commands wrap their writes in exactly one `Ecto.Multi`. Writes outside a `Multi` (or outside a Command) → fail.
2. **Queries never write.** Not even `updated_at` touches.
3. **Schema** lives in `lib/__APP_NAME__/<context>/schema/`, one file per table. `Ecto.Schema` fields always use `:string` for text columns (per `AGENTS.md`).
4. **Migrations** via `mix ecto.gen.migration migration_name_using_underscores`.
5. **No raw SQL** (`Repo.query/2`, SQL fragments with user input) without an ADR.
6. **Changeset discipline**: `Ecto.Changeset.get_field/2`, never map access on changesets. Programmatic fields (`user_id`) never appear in `cast/3`; set them explicitly.
7. **Idempotency at the DB level**: unique constraints on natural keys; upserts use `on_conflict` + `conflict_target`.
8. **Preload associations** in queries that feed templates (per `AGENTS.md`).

---

## 🔐 Config & Secrets

1. **Single module — `__APP_MODULE__.Config`** under `lib/__APP_NAME__/config.ex`. The *only* module in the app permitted to call `Application.get_env/2`. (Establish this module in the first sprint that needs config access.)
2. **`config/runtime.exs`** is the *only* place `System.get_env/1` / `System.fetch_env!/1` may appear.
3. **Validation**: `__APP_MODULE__.Config` should validate required config at boot. `NimbleOptions` is available if needed.
4. **Secrets in dev**: `source .env.local` (gitignored). `.env.example` committed with placeholder values + per-key docs.
5. **Any secret string literal** in `lib/` or `test/` → Security fail.

---

## 🚧 Boundary Validation

Every external input — inbound and outbound — is validated via an `Ecto.Changeset` against an embedded schema under `lib/__APP_NAME__/<context>/contracts/`.

**Rules:**
- `/lib/__APP_NAME__/<context>/` functions **never** accept raw `params` maps. They take a validated struct.
- On contract violation in domain code, raise a `*.Errors.ContractViolation{}`. On contract violation from a vendor response in an adapter, wrap it into a domain error struct.

---

## ✅ Verification Gate

Wired as `mix precommit`. Every step runs fail-fast. All green or the task goes back to Builder.

1. `mix deps.get --check-locked` — `mix.lock` drift fails the gate.
2. `mix compile --warnings-as-errors` — no warnings in committed code.
3. `mix format --check-formatted` — formatter is law.
4. `mix credo --strict` — style / consistency lints tuned to this document.
5. `mix sobelow --config` — security static analysis for Phoenix.
6. `MIX_ENV=test mix ecto.create --quiet && mix ecto.migrate --quiet` — broken migrations fail the gate.
7. `mix dialyzer` — static type checks; PLTs cached between runs.
8. `mix test --warnings-as-errors` — full suite.
9. `mix assets.build` — broken Tailwind / esbuild configs fail here, not at runtime.

---

## 🧹 Git Hygiene (Code Level)

- **No WIP/debug artifacts** in commits: no `IO.inspect`, no `dbg/1`, no `@tag :skip` / `@tag :focus`, no commented-out code, no untracked `TODO`s.
- **`.gitignore`**: `_build/`, `deps/`, `.elixir_ls/`, `.env.local`, `.env*` (except `.env.example`), `*.beam`, `erl_crash.dump`, `cover/`, `doc/`, `priv/static/assets/`, `.DS_Store`.
- **Sprint logs ARE committed** under `/docs/sprint/{name}/logs/` — they are the audit trail.
- **Generated files committed**: `mix.lock` ✅, `priv/repo/migrations/` ✅, `.env.example` ✅. Build artifacts (`_build/`, `priv/static/assets/`) ❌.
