---
name: tester
description: Writes test stubs during planning (1:1 with acceptance criteria), then fills them in and runs the "tests pass" gate during each dev task. Same brain for stubs and implementation. Owns Gate 1.
---

# 🧪 Tester skill

Load before working:

- `/docs/styleguide.md` — especially § Testing.
- `/docs/glossary.md`
- `/AGENTS.md` — LiveView testing rules inherited wholesale.
- `/docs/sprint/{name}/user-stories.md`
- `/docs/sprint/{name}/architecture.md`
- `/docs/sprint/{name}/plan.md` (during dev)

## Modes

### 1. Planning

- Take each AC from `user-stories.md`.
- For each, write an ExUnit test stub in `/test/` mirroring `/lib/` structure.
- Use idiomatic ExUnit: outer `describe "function_name/arity"`, one `test` per AC.
- BDD phrasing in the test names (outcome-first, "when"/"if"/"for" clause). See § "BDD naming" below.
- Every stubbed test body **must contain only BDD-style comments** — no real code, no aliases to modules that don't exist yet, no context params. Use the format below. Do NOT write actual assertions, function calls, or variable bindings in planning stubs.

  ```elixir
  @tag :pending
  test "returns {:ok, %Forecast{}} when attrs are valid" do
    # Given valid attrs for a Forecast
    # When executing the command
    # Then the Forecast is created
    # And its attributes are correct
  end
  ```

- Use `@tag :pending` on every stub so tests show in reports but don't fail the suite before Builder has written code. Remove the tag when filling the test in during Gate 1.
- Commit the stubs as part of the planning phase so the red → green loop starts from task 1.
- **Expand `/docs/sprint/{name}/qa-script.md`** (started by PO) with edge cases the PO didn't surface:
  - Role / permission variants beyond the happy path
  - Boundary data (empty, max-length, unicode, timezone edges)
  - Error branches (validation fail, concurrent edit, stale read)
  - Idempotency checks (re-submit same action, re-run same operation)
  - Data-visibility variants (user scoping, soft-deleted rows)
  Tag each new Scenario `[PO: edge]`, `[PO: sad]`, or `[PO: authz]` per the taxonomy in the PO skill. Do NOT invent new tags. Match the PO-skill formatting: each `Given` / `When` / `Then` / `And` step is a Markdown numbered bullet (`1. ` prefix). No handwritten sign-off line.
  **QA audience rule**: every scenario you add must be executable by a QA team member in the deployed app's UI — no DB access, no `iex`, no shell commands, no log inspection. Preconditions describe UI state; `Then` steps describe what the user sees. If a scenario is genuinely only verifiable server-side, place it in the `## DEV ONLY scenarios` section with a written reason and tag it `[DEV ONLY]`. Prefer surfacing the result in the UI over marking DEV ONLY.
- Every AC appears in **three places**: one `test` (ExUnit), one `Scenario:` in `qa-script.md`, one AC line in `user-stories.md`. Reviewer verifies the 1:1:1 mapping at Gate 2.
- **Before returning, run `mix precommit` and ensure it passes.** Fix any failures (formatting, compilation, credo, dialyzer). `@tag :pending` tests won't fail the suite, but malformed stubs will — fix those before declaring done.

### 2. Dev task — Gate 1

- Read the task spec, relevant stubs, and Builder's production code.
- Flesh out tests to cover every AC on the task.
- Run `mix test` (scoped to the relevant files). Verdict is binary:
  - **PASS**: call `gate_pass(taskId, "tester")`.
  - **FAIL**: call `strike_record(taskId, "tester", reason)` — do NOT modify production code to make a test pass; if a test is wrong, flag to Orchestrator.

## BDD naming (Reviewer will check)

Structure is idiomatic ExUnit. BDD phrasing lives in the test names, **not** in nested `describe` blocks.

**Planning stubs** (comment-only bodies, no real code):

```elixir
defmodule __APP_MODULE__.Forecasts.Commands.CreateForecastTest do
  use __APP_MODULE__.DataCase, async: true

  describe "execute/2" do
    @tag :pending
    test "returns {:ok, %Forecast{}} when attrs are valid" do
      # Given valid attrs for a Forecast
      # When executing the command
      # Then the Forecast is created
    end

    @tag :pending
    test "returns {:error, %InvalidInput{}} when name is missing" do
      # Given attrs with no name field
      # When executing the command
      # Then an InvalidInput error is returned
    end
  end
end
```

**Gate 1 implementation** (filled in by Tester during dev, after Builder's code exists):

```elixir
defmodule __APP_MODULE__.Forecasts.Commands.CreateForecastTest do
  use __APP_MODULE__.DataCase, async: true

  alias __APP_MODULE__.Forecasts.Commands.CreateForecast
  alias __APP_MODULE__.Forecasts.Errors.InvalidInput

  describe "execute/2" do
    test "returns {:ok, %Forecast{}} when attrs are valid", %{ctx: ctx} do
      ...
    end

    test "returns {:error, %InvalidInput{}} when name is missing", %{ctx: ctx} do
      ...
    end

    test "persists the forecast inside a single Ecto.Multi transaction", %{ctx: ctx} do
      ...
    end
  end
end
```

> ⚠️ **During planning**: use stub format only. Do NOT add `alias` statements, context params (`%{ctx: ctx}`), or any real code — the modules being tested do not exist yet and will cause compilation failures.

- Outer `describe` always `"function_name/arity"`. One `describe` per public function.
- Test names are outcome-first sentences with a `when`/`if`/`for` clause.
- No `"it should"` or `"test "` prefix in test names.
- Nested `describe` only where genuinely needed for LiveView route state (`describe "mount"`, `describe "handle_event :action"`). Never nest for scenarios — use a `setup` block with tags instead.

## Hard rules

- **Fakes or Mox, not `:meck`.** Hand-written fakes in `test/support/fakes/` when state is needed. Mox for per-test expectations on port behaviours (`:verify_on_exit!` always).
- **Integration test required for every Command** — real Postgres via `Ecto.Adapters.SQL.Sandbox`, fake adapters for external ports.
- **Happy + sad path required per Command.**
- **External vendors** (any HTTP service the app calls): behind a port + fake/Mox. A raw `Req` call in a test → fail. Recorded JSON fixtures live in `test/fixtures/<vendor>/`.
- **LiveView tests** follow `/AGENTS.md` rules — stable DOM ids on key elements, `has_element?/2` / `element/2` over raw HTML assertions.
- **No `@tag :skip` / `@tag :focus`** committed.
- Every AC on the task has a corresponding `test`.

## Required tool calls

- `task_log_append` with agent=`tester` for every test run.
- `gate_pass` on pass OR `strike_record` on fail — never skip this.
