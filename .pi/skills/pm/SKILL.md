---
name: pm
description: Breaks Architect's design into a flat, ordered task list, writes spec.md and plan.md during planning, appends polish-{n} tasks during final-review, and updates living docs at sprint close. Tasks run single-process, one at a time — no waves, no parallelism. Use after Architect during planning, and at sprint close for doc updates.
---

# 📐 PM skill

Load before working:

- `/docs/sprint/{name}/user-stories.md`
- `/docs/sprint/{name}/architecture.md`
- `/docs/sprint/{name}/reviewer-checklist.md`
- `/docs/styleguide.md`
- `/docs/glossary.md`
- Tester's stub list

## Modes

### 1. Planning (after Architect, before dev)

Outputs:
- `/docs/sprint/{name}/spec.md` — consolidated sprint spec.
- `/docs/sprint/{name}/plan.md` — tasks, per-task file ownership.
- `/docs/sprint/{name}/qa-script.md` — **assemble** into final planning form: merge PO's skeleton + Tester's edge cases + Architect's architectural edges into one coherent document. Verify every AC in `user-stories.md` has exactly one corresponding `Scenario:`. Include `qa-script.md` in `planning-summary.md` for human approval.

### 2. Sprint close (after final review, human-approved)

Proposals (not auto-commits):
- **Write `/docs/sprint/{name}/sprint-review.md`** — consolidate the six planning working docs into a single committed reference document. Structure:
  ```
  # Sprint Review: {name}
  > Goal: {one-line goal}

  ## User Stories
  {full content of user-stories.md}

  ## Architecture
  {full content of architecture.md}

  ## Reviewer Checklist
  {full content of reviewer-checklist.md}

  ## Spec
  {full content of spec.md}

  ## Plan
  {full content of plan.md}

  ## Planning Summary
  {full content of planning-summary.md}
  ```
  The source files (`user-stories.md`, `architecture.md`, `reviewer-checklist.md`, `spec.md`, `plan.md`, `planning-summary.md`) are gitignored by `mix pi_dev_setup` / `mix pi_dev_update`; `sprint-review.md` is the permanent committed record of all six.
- Targeted update to `/docs/architecture.md` — only sections the sprint changed. Preserve the rest.
- Append to `/docs/project_memory.md` — newest sprint on top. Fields: goal, what shipped, key decisions, gotchas, link to sprint dir.
- Update `CHANGELOG.md` — append one line inside the **version block marked "Not yet released"** under the correct section heading. Create the heading if it does not yet exist in that block; do NOT create a new version block. Format:
  - **With a case number** (read from `sprint-state.json` → `caseNumber` field): `- {caseNumber} - {short user-facing description}` (e.g. `- 64123 - Add sort-order preference to reports`).
  - **Without a case number**: `- {sprint-number} - {short user-facing description}` where `{sprint-number}` is the leading numeric portion of the sprint name, or the full sprint name if it contains no leading number.

  Either way, keep the description concise, user-facing, and in plain English — no ticket URLs, no implementation detail.

  Choose the section by the nature of the sprint's primary change:

  | Section | Use when the sprint… |
  |---|---|
  | `### Added` | introduces new features or capabilities that did not exist before |
  | `### Changed` | modifies existing behaviour, APIs, or UX in a non-breaking way |
  | `### Deprecated` | marks something as being removed in a future release |
  | `### Removed` | deletes a previously-existing feature or capability |
  | `### Fixed` | corrects a defect in existing behaviour |
  | `### Security` | closes a security vulnerability or hardens a security surface |

  A sprint may produce entries in more than one section. When in doubt, pick the section that best describes what the user will notice.
- Update `/README.md` as needed.
- **Finalize `/docs/sprint/{name}/qa-script.md`**: add Prerequisites (test accounts, seed data prose, feature flags), fill in deploy target, add Regression spot-checks, populate Known gaps / deferred, ensure the Sign-off checkbox block is present. Formatting rules (match the PO skill template): every `Given` / `When` / `Then` / `And` step is a Markdown numbered bullet (`1. ` prefix, auto-numbered on render) — never indented plain-text Gherkin. Do **not** include a handwritten `Signed: ___  Date: ___` line; the checkbox block is the sign-off. QA annotations do NOT go in this file — the QA team copies it to the wiki and annotates there.

## Task ordering

Tasks run **strictly in list order, one at a time**. There are no waves, no parallelism, and no cross-task file-overlap rule. File ownership remains declared per task as a **scope discipline** (Builder can't write outside it; the extension's ownership guard enforces this).

- Every task maps to ≥ 1 acceptance criterion from `user-stories.md`.
- Every task declares **file ownership** upfront — Builder cannot touch files outside it. Entries may be **exact paths** or **directory prefixes** (trailing `/`). Prefixes cover all files under them — use for migrations and generator output whose exact filenames aren't known at plan time.
- List tasks in `plan.md` in the order they must run. Do not include a `Depends-on:` field — ordering is implied by position.
- `plan.md` format for each task (example uses Elixir paths):

```
### task-N: {title}
Story: Story X AC Y
Files:
  - lib/pi_dev_setup/forecasts/commands/create_forecast.ex
  - test/pi_dev_setup/forecasts/commands/create_forecast_test.exs
  - lib/pi_dev_setup/forecasts/contracts/create_forecast_input.ex
```

Example including a migration (directory prefix covers the timestamped filename `mix ecto.gen.migration` will produce):

```
### task-M: add forecasts table
Story: Story Y AC 1
Files:
  - priv/repo/migrations/
  - lib/pi_dev_setup/forecasts/schema/forecast.ex
  - test/pi_dev_setup/forecasts/schema/forecast_test.exs
```

## Hard rules

- `project_memory.md` is **append-only** — never rewrite history.
- `architecture.md` is a **living doc** — update only changed sections.
- Close-mode doc updates are proposals — human approves before commit.
- Test files live in `/test/` mirroring `/lib/` structure (ExUnit convention).

## Required tool calls

- `task_log_append` with agent=`pm` for each task drafted and each doc proposal.
- **After human runs `/sprint:approve-planning`**, call `sprint_tasks_seed` with the full `plan.md` task list (flat, ordered, no `wave` field). This validates unique IDs, seeds `sprint-state.json`, and flips phase `planning-approved` → `development`. The tool refuses if phase is anything other than `planning-approved`. Once seeded, the dev flow begins at the first task in list order.
- **Polish mode** (called during final-review when the human agrees to a fix): call `polish_task_append` with `{ id, title, story, files }`. The tool refuses unless phase is `final-review` (or already `development` inside a polish run). It flips phase → `development` for the duration; the extension restores `final-review` on `commit_task` of the last polish task.
