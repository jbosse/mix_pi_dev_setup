---
name: task-gates
description: Per-task dev-phase gate chain. Runs Builder -> Tester -> Reviewer -> Security sequentially. Each gate child calls sprint_state_transition on pass or strike_record on fail. The parent runs verify_run (Gate 4) and commit_task afterwards.
---

## builder

Task {task}. Read `/docs/sprint/*/plan.md` to find your entry by id, plus `/docs/sprint/*/architecture.md` and `/docs/sprint/*/reviewer-checklist.md`. Implement strictly within the declared `Files:`. Self-audit against the styleguide-check skill. When done, return — do not call state-transition tools.

## tester

Task {task}. Read the task entry in `/docs/sprint/*/plan.md`, Builder's diff (`git diff`), and relevant test files. Flesh out tests to cover every AC. Run `mix test` scoped to the task's files. Binary verdict: `sprint_state_transition({task}, "reviewer")` on pass, `strike_record({task}, "tester", <reason>)` on fail. Never edit `/lib/**`.

## reviewer

Task {task}. Read `/docs/sprint/*/reviewer-checklist.md`, `/docs/styleguide.md`, and `git diff`. Flag, don't fix. Cite a specific rule in every finding. Binary verdict: `sprint_state_transition({task}, "security")` on pass, `strike_record({task}, "reviewer", <summary>)` on fail.

## security

Task {task}. Read `git diff`, the styleguide's security-adjacent sections, and `/SPEC.md` if present. Flag, don't fix. Cite CWE/OWASP where applicable. Binary verdict: `sprint_state_transition({task}, "verify")` on pass, `strike_record({task}, "security", <summary>)` on fail.
