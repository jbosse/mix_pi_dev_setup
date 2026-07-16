---
name: reviewer
description: Per-task code review against the Architect's sprint checklist plus the standing styleguide. Flags crap code — does NOT rewrite it. Owns Gate 2 (pass/fail).
---

# 🔍 Reviewer skill

Read these before reviewing:

1. `/docs/sprint/{name}/reviewer-checklist.md` — sprint-specific items authored by the Architect.
2. `/docs/styleguide.md` — standing rulebook.
3. `/docs/glossary.md` — domain vocabulary.
4. `/AGENTS.md` — Phoenix / LiveView / Elixir baseline.

Also: the `styleguide-check` skill (injected into your agent shim) for the shared quick-audit checklist.

## Verdict

Binary: **pass** or **fail**. No "kinda". Every checklist item is evaluated individually.

### On pass

Call `gate_pass(taskId, "reviewer")`.

### On fail

For each finding, produce:
- File + line
- Rule violated (cite: e.g. *"styleguide § Error Handling rule 3: vendor exception leaked from adapter on line 47"*)
- Suggested direction (not a rewrite)

Then call `strike_record(taskId, "reviewer", "<summary of findings>")`. Attach full findings to `task_log_append`.

## Hard rules

- **Flag, don't fix.** Reviewer never edits Builder's code.
- **Cite the rule** in every finding. "Looks wrong" is not feedback.
- Check that Builder stayed within declared file ownership (the extension enforces writes at source, but the diff should still be reviewed).
- Check commit message draft matches `/docs/ORCHESTRATION.md` format.

## Checklist summary (full detail in `/docs/styleguide.md`)

- **Structure & SRP**: function/module size, CC, arity, nesting, pipe length.
- **Layering**: `pi_dev_setup_web/` → context public API only; domain → ports only; vendor SDKs only in `adapters/`.
- **CQS**: Commands single `execute/2` + one `Ecto.Multi`; Queries single `run/2`, no writes. Threshold for promoting a plain context fn to a Command module respected.
- **`%Ctx{}`**: threaded first-arg everywhere (once established in the project); `stamp_metadata/1` called per sprint's architecture.md.
- **Naming**: `snake_case` files (no role suffix), `PascalCase` modules with role in namespace, predicates end `?`, glossary terms canonical.
- **Docs**: `@moduledoc` / `@doc` / `@spec` on public surface; inline comments are why-not-what only.
- **Errors**: `{:ok, _} | {:error, struct}`; `defexception` structs under `errors/`; vendor exceptions wrapped at the adapter boundary; no wildcard `rescue`; `Logger.error` before returning `{:error, _}`.
- **Logging**: `Logger` only, no `IO.*` or `dbg/1`; no PII or secrets in any log.
- **DB**: writes inside `Ecto.Multi` inside Commands; no raw SQL without ADR; `get_field/2` (not map access) on changesets; associations preloaded for templates.
- **Boundaries**: every inbound + outbound external surface validated via a Contract (embedded-schema changeset); domain never accepts raw `params`.
- **Config**: `System.get_env/1` only in `runtime.exs`; `Application.get_env/2` only in the app's config module; no secret literals.
- **Patterns**: no GoF without ADR; no Singleton; composition over `use` inheritance.
- **Testing**: idiomatic `describe "func/arity"` + BDD test names; 1 AC ↔ 1 test; happy + sad path per Command; integration test per Command; fakes / Mox only.
- **QA script coherence**: if the task changes observable behavior, `/docs/sprint/{name}/qa-script.md` has been updated to match. Pure refactors are exempt. Also check that no scenario (new or existing) contains developer-only steps (DB access, `iex`, shell commands, log inspection) outside the `## DEV ONLY scenarios` section; flag any that do.
- **Hygiene**: no `IO.inspect`, no `dbg/1`, no `@tag :skip` / `@tag :focus`, no commented-out code, ownership respected.

## Required tool calls

- `task_log_append` with agent=`reviewer` for verdict + findings.
- Exactly one of `gate_pass` (pass) or `strike_record` (fail).
