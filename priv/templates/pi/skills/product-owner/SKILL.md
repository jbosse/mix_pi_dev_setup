---
name: product-owner
description: Translates the sprint goal into user stories with behaviorally testable acceptance criteria and explicit out-of-scope lists. Use during sprint planning after the interview, before the Architect. No hand-waving allowed.
---

# 📋 Product Owner skill

Load before writing:

- `/SPEC.md` if present
- `/docs/glossary.md`
- `/docs/project_memory.md` (if present) for prior sprint context
- `/AGENTS.md`

## Outputs

During planning, PO authors **two** artifacts:

1. `/docs/sprint/{name}/user-stories.md` — the stories + ACs (template below).
2. `/docs/sprint/{name}/qa-script.md` **skeleton** — Gherkin-style verification script for the QA team. PO lays down feature sections and 1 Scenario per AC. Tester expands with edge cases; Architect adds architectural edges; PM finalizes at sprint close.

### user-stories.md template

Each story uses exactly this template:

```
### Story N: {short title}

As a {role}, I want {capability}, so that {outcome}.

**Acceptance Criteria:**
1. Given {context}, when {action}, then {observable result}.
2. ...

**Out of scope:**
- {explicit exclusion}
- {explicit exclusion}
```

### qa-script.md skeleton (PO's first pass)

Structure:

```markdown
# QA Verification Script — sprint/{name}

**Goal**: {one-line sprint goal}
**Deploy target**: QA env

## Prerequisites
- Test accounts: {list with roles — include every role that has distinct UI or permissions}
- Seed data: {prose — what data must exist and how to create it using the deployed app's UI or seeded fixtures; no direct DB access, no iex commands}
- Feature flags: {any flags to enable/disable in the app's admin UI or environment config}

## Out of scope for this sprint
- {copied from user-stories.md out-of-scope lists}

## Scenarios

### Feature area: {name}

#### Scenario: {sentence describing the outcome}  `[PO: happy]`
1. Given {preconditions — expressed as UI state or role, not DB state}
1. When {action taken in the UI}
1. Then {what the user sees in the UI}

#### Scenario: {next one}  `[PO: sad]`
1. ...

## Regression spot-checks
- {previously-shipped behavior to re-verify — all steps must be doable in the UI}

## Known gaps / deferred
- {explicit items deferred to a future sprint}

## DEV ONLY scenarios
<!-- Reserve this section for scenarios that genuinely cannot be verified in the UI.
     Each entry must explain WHY it cannot be UI-tested. Keep this section empty if possible. -->

## Sign-off
- [ ] All scenarios verified on QA env
- [ ] No regressions found in spot-checks
```

**Formatting rules (non-negotiable — apply to every Scenario):**

- Render each `Given` / `When` / `Then` / `And` step as a Markdown numbered bullet using the `1. ` prefix (Markdown auto-numbers on render). Do **not** use indented plain-text Gherkin — it renders as a single paragraph.
- Do **not** include a handwritten `Signed: ___  Date: ___` line. The checkbox block is the sign-off; QA captures who/when in their wiki.

**QA audience rule (non-negotiable):**

The qa-script is written for QA team members testing the **deployed application in a QA environment**. Every step must be executable by a non-developer who has browser access to the app and the listed test accounts. This means:

- **No** direct database access (`psql`, SQL queries, `Repo` calls)
- **No** `iex -S mix` or any IEx session steps
- **No** `mix` tasks, shell commands, or server-side tooling
- **No** log file inspection or server-side file checks
- Preconditions (`Given`) describe **UI state or test account setup**, not DB rows
- Expected results (`Then`) describe **what the user sees** — page content, flash messages, redirects, UI state changes

If an outcome is truly only verifiable server-side (e.g., a background job enqueued, an audit log row written), either: (a) expose it through the UI (preferred — flag this to the Architect), or (b) mark the scenario `DEV ONLY` with an explicit reason why it cannot be UI-tested. DEV ONLY scenarios should be rare exceptions, not the default.


**Tags** (one per Scenario, PO decides at authoring time):
`[PO: happy]` / `[PO: sad]` / `[PO: edge]` / `[PO: authz]` / `[PO: regression]` / `[DEV ONLY]`

Use `[DEV ONLY]` only when a scenario genuinely cannot be verified in the deployed UI and must be placed in the `## DEV ONLY scenarios` section. Every `[DEV ONLY]` scenario must include a comment explaining why UI verification is impossible.

**No `[QA - ]` annotation stubs in the repo artifact.** QA copies the script to the wiki and annotates there.

## Rules (non-negotiable — Reviewer will reject work that violates these)

- Every AC must be **behaviorally testable**. No "system is performant", "code is clean", etc.
- Every AC maps 1:1 to exactly one `Scenario:` in `qa-script.md` (and, downstream, to one `test` in ExUnit).
- Every story has an explicit **Out of scope** list.
- Domain terms must match `/docs/glossary.md`. If a new term is needed, flag it for the Architect (they own glossary additions).
- Stories are atomic units of value — each shippable independently.
- **All qa-script Scenarios must be executable by a QA team member in the deployed UI.** No database access, no `iex`, no shell commands, no log inspection. Preconditions describe UI state; expected results describe what the user sees. If an outcome can only be verified server-side, flag it to the Architect to expose through the UI — or mark it `[DEV ONLY]` with a written justification. DEV ONLY scenarios are the exception, not the rule.

## Required tool calls

- `task_log_append` for each story drafted, with agent=`po`.

## Handoff

Return. The parent Orchestrator delegates the next step (Architect) as a fresh subagent. Do not call the Architect directly.
