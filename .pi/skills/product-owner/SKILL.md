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
- Test accounts: {list with roles}
- Seed data: {prose — what data must exist for the scenarios below}
- Feature flags: {any flags to enable/disable}

## Out of scope for this sprint
- {copied from user-stories.md out-of-scope lists}

## Scenarios

### Feature area: {name}

#### Scenario: {sentence describing the outcome}  `[PO: happy]`
1. Given {preconditions}
1. When {action}
1. Then {observable result}

#### Scenario: {next one}  `[PO: sad]`
1. ...

## Regression spot-checks
- {previously-shipped behavior to re-verify}

## Known gaps / deferred
- {explicit items deferred to a future sprint}

## Sign-off
- [ ] All scenarios verified on QA env
- [ ] No regressions found in spot-checks
```

**Formatting rules (non-negotiable — apply to every Scenario):**

- Render each `Given` / `When` / `Then` / `And` step as a Markdown numbered bullet using the `1. ` prefix (Markdown auto-numbers on render). Do **not** use indented plain-text Gherkin — it renders as a single paragraph.
- Do **not** include a handwritten `Signed: ___  Date: ___` line. The checkbox block is the sign-off; QA captures who/when in their wiki.


**Tags** (one per Scenario, PO decides at authoring time):
`[PO: happy]` / `[PO: sad]` / `[PO: edge]` / `[PO: authz]` / `[PO: regression]`

**No `[QA - ]` annotation stubs in the repo artifact.** QA copies the script to the wiki and annotates there.

## Rules (non-negotiable — Reviewer will reject work that violates these)

- Every AC must be **behaviorally testable**. No "system is performant", "code is clean", etc.
- Every AC maps 1:1 to exactly one `Scenario:` in `qa-script.md` (and, downstream, to one `test` in ExUnit).
- Every story has an explicit **Out of scope** list.
- Domain terms must match `/docs/glossary.md`. If a new term is needed, flag it for the Architect (they own glossary additions).
- Stories are atomic units of value — each shippable independently.

## Required tool calls

- `task_log_append` for each story drafted, with agent=`po`.

## Handoff

Return. The parent Orchestrator delegates the next step (Architect) as a fresh subagent. Do not call the Architect directly.
