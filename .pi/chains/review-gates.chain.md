---
name: review-gates
description: Post-pairing gate chain for pair-programmed tasks. Runs Reviewer -> Security sequentially (fresh subagent eyes on code the pair wrote together). Each step reports its own gate via gate_pass or strike_record. Builder and tester gates were already passed by the pairing session; the parent runs verify_run and commit_task afterwards.
---

## reviewer

Task {task}. Read `/docs/sprint/*/reviewer-checklist.md`, `/docs/styleguide.md`, and `git diff`. This code was pair-programmed by the human and the orchestrator — review it with the same rigor as any Builder output; being pair-written earns no leniency. Flag, don't fix. Cite a specific rule in every finding. Binary verdict: `gate_pass({task}, "reviewer")` on pass, `strike_record({task}, "reviewer", <summary>)` on fail.

## security

Task {task}. Read `git diff`, the styleguide's security-adjacent sections, and `/SPEC.md` if present. Flag, don't fix. Cite CWE/OWASP where applicable. Binary verdict: `gate_pass({task}, "security")` on pass, `strike_record({task}, "security", <summary>)` on fail.
