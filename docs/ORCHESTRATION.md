# 🎯 Our Process

An AI-tweaked version of Scrum. The single goal of this process is **NO CRAP CODE**.

All sprint artifacts live in `/docs/sprint/{sprint-name}/` unless stated otherwise.
All logs are `.log` format (timestamped), committed to the repo — they are the audit trail.

Deterministic steps are marked with `*`. These are **NEVER** performed by an agent — only by tooling.

---

## 🧠 Runtime model

The Orchestrator runs in the **parent Pi session**. Every other role runs as a **child subagent** spawned by [`pi-subagents`](https://github.com/nicobailon/pi-subagents) — a fresh Pi process with its own context window, loaded only with that role's skill and the small slice of files it needs.

**Documents are the handoff protocol.** Each subagent reads a known set of files from disk, writes exactly one, returns. The parent never loads role outputs into its own context; it only holds routing state (sprint name, phase, current task id, strike count). Everything else is on disk.

This means:

- Each role sees a narrow, predictable context (fits comfortably in a local-LLM ~100K window).
- The parent context stays tiny and grows linearly with task count, not with artifact size.
- "Context reset between steps" happens automatically at every subagent boundary.

---

## 👥 The Agent Team

| Agent              | Runtime    | Phase            | Owns Gate                   |
|--------------------|------------|------------------|-----------------------------|
| 🧭 Orchestrator     | parent     | All              | — (runs the gate sequence)  |
| 📋 Product Owner    | subagent   | Planning         | —                           |
| 🏛 Architect        | subagent   | Planning         | —                           |
| 🏛 Architect (final)| subagent   | Final review     | Final architectural review  |
| 📐 PM               | subagent   | Planning + Close | —                           |
| 🧪 Tester (planning)| subagent   | Planning         | —                           |
| 🧪 Tester           | subagent   | Dev              | Tests pass                  |
| 🔨 Builder          | subagent   | Dev              | —                           |
| 🔍 Reviewer         | subagent   | Dev              | Code review                 |
| 🛡 Security         | subagent   | Dev              | Security review             |

Each skill file in `/.pi/skills/{name}/SKILL.md` is self-contained and authoritative for that agent. Subagent shims live in `/.pi/agents/{name}.md` and inject the relevant skill(s).

---

## 🗂 Sprint Directory Layout

```
/docs/sprint/{sprint-name}/
  sprint-review.md          # ✅ COMMITTED — consolidated record of all six planning docs
                            #    (user-stories, architecture, reviewer-checklist, spec, plan,
                            #     planning-summary). Written by PM at sprint close.
  qa-script.md              # ✅ COMMITTED — co-authored verification script for the QA team
                            #   — PO seeds, Tester expands, Architect edges,
                            #     PM finalizes at close. Gherkin-style. QA
                            #     annotations happen on the wiki, not here.
  planning-summary.md       # ⛔ gitignored (captured in sprint-review.md)
  user-stories.md           # ⛔ gitignored (captured in sprint-review.md)
  architecture.md           # ⛔ gitignored (captured in sprint-review.md)
  reviewer-checklist.md     # ⛔ gitignored (captured in sprint-review.md)
  spec.md                   # ⛔ gitignored (captured in sprint-review.md)
  plan.md                   # ⛔ gitignored (captured in sprint-review.md)
  sprint-state.json         # ⛔ gitignored (tooling-managed state machine)
  sprint.log                # ⛔ gitignored (orchestrator narrative)
  logs/                     # ⛔ gitignored (per-task agent logs)
    {task-id}-{agent}-{attempt}.log  # One log per agent invocation per task
```

> **Note:** `mix pi_dev_setup` and `mix pi_dev_update` append the wildcard patterns for the ⛔ entries to the project's `.gitignore` automatically. Only `sprint-review.md` and `qa-script.md` are ever committed.

---

## 🌱 Branching

- Sprint branch `sprint/{sprint-name}` is created by tooling at the **start of planning**.
- ALL sprint artifacts and code commits live on the sprint branch.
- At sprint close (after human approval), a **merge commit** (no squash) brings history back to `main`. Per-task audit trail is preserved.
- No PR gate for now — local merge after human approval.

---

## 📝 Commit Policy

- **One commit per task**, authored by tooling after all gates pass.
- Builder drafts the message; Orchestrator finalizes it.
- Format:

```
[sprint/{name}] task-{id}: {short title}

{user story ref}
Builder: ✅  Tester: ✅  Reviewer: ✅  Security: ✅  Verify: ✅
```

- Post-final-review polish fixes are **new tasks** through the full gate loop, prefixed `polish-{n}:`.

---

## 🧭 Planning Phase

Interactive. Orchestrator runs a collaborative discovery session with the human — exploring context, asking adaptive questions one at a time, proposing scope options when ambiguous, and confirming understanding before proceeding. The interview scales to the complexity of the idea: brief for simple sprints, thorough for complex ones.

```
Human idea
  → 🧭 Orchestrator interview           (parent: adaptive Q&A — goal, name, scope, constraints, success criteria)
  → tooling: sprint_start*              (creates branch + scaffold; REFUSES unless interviewConfirmed=true)
  → subagent(product-owner, mode 1)     → writes user-stories.md ONLY (no qa-script yet)
  → ✋ Human approval of user stories   (Orchestrator shows user-stories.md, waits for approval/feedback)
  → subagent(product-owner, mode 2)     → writes qa-script.md skeleton (from approved stories)
  → subagent(architect)                 → writes architecture.md + reviewer-checklist.md;
                                          appends architectural-edge Scenarios to qa-script.md
  → subagent(tester-planning)           → writes test stubs (1:1 with AC) into /test/;
                                          expands qa-script.md with edge cases
  → subagent(pm)                        → assembles planning-summary.md + finalizes qa-script.md for planning
  → ✋ Human approval (single consolidated approval via planning-summary.md)
  → /sprint:approve-planning*           (verify pipeline must be green; commits planning artifacts)
  → subagent(pm)                        → writes spec.md + plan.md;
                                          calls sprint_tasks_seed* to flip phase → development
```

**User story approval**: PO runs in two modes. Mode 1 writes only `user-stories.md`. Orchestrator then reads it and presents to the human. On rejection, PO mode 1 is re-run with feedback. On approval, PO mode 2 writes the `qa-script.md` skeleton from the approved stories. This prevents invalid stories from propagating into qa-script, architecture, or test stubs.

Each subagent call is a file-to-file handoff: "read these N files, write this one, log via `task_log_append`, return."

**Verification steps** (bare minimum — wired as `mix precommit`):

1. `mix deps.get --check-locked` — no `mix.lock` drift
2. `mix compile --warnings-as-errors`
3. `mix format --check-formatted`
6. `MIX_ENV=test mix ecto.create --quiet && mix ecto.migrate --quiet`
8. `mix test --warnings-as-errors`
9. `mix assets.build`

Full rationale in [`/docs/styleguide.md` § Verification Gate](./styleguide.md#-verification-gate). Any verification failure hard-fails the task → Builder retry → counts toward the 4-strike counter.

**Human approval**: single consolidated sign-off on `planning-summary.md` (goals, stories/AC, architecture, test stubs list). Rejection routes feedback to the specific agent(s) named in the comments — not a full restart.

---

## 🔨 Development Phase

Non-interactive loop. **Strictly single-process, strictly sequential.** No parallelism, no waves, no concurrent tasks, ever.

PM produces a flat ordered task list in `plan.md`. The Orchestrator runs each task end-to-end through the gate chain below, in list order, until all tasks are done.

Per-task gate sequence (runs as a pi-subagents chain):

```
🧭 Orchestrator: assign task
  → tooling: task_log_append*                          ("assigned")
  → subagent(builder)     writes production code
  → subagent(tester)      Gate 1: tests pass
  → subagent(reviewer)    Gate 2: code review
  → subagent(security)    Gate 3: security review
  → tooling: verify_run*                               Gate 4 (build/test/lint/types)
  → tooling: commit_task*                              single commit, format above
  → 📐 Orchestrator moves to next task
```

Each subagent receives the minimum prompt needed: the task id, pointers to the files it must read, and its job. The subagent reads the relevant sprint artifacts itself (plan.md entry, architecture.md, reviewer-checklist.md, prior gate logs). The parent never re-sends file contents.

**File ownership**: each task declares the files it may touch (`Files:` in `plan.md`). The ownership guard in `sprint-orchestrator` blocks Builder writes outside that list. This is a per-task scope discipline, not a contention mechanism — tasks never run concurrently, so there is no cross-task contention to manage.

---

## ♻️ Failure & Retry

**4-strike, any-kind counter per task.** Any gate failure (review, security, verification) counts toward the same counter.

| Strike | Action                                                                  |
|--------|-------------------------------------------------------------------------|
| 1–2    | Orchestrator relaunches the failed step as a fresh subagent with the specific feedback. Task restarts from `builder` via the state machine. |
| 3      | Orchestrator runs `subagent(architect)` in **escalation mode** before Builder retries. Architect inspects the diff + feedback, returns a short directive. |
| 4      | **Halt the entire sprint run.** `strike_record` auto-sets `state.halted`. Orchestrator notifies human with logs + diff. |

**Other failure modes:**
- **Architectural review failure (final)**: not auto-retried. Reported to human during polish; any fix becomes a new `polish-{n}` task.
- **System/run crash**: Orchestrator uses `sprint-state.json` (not log-parsing) to determine restart point. In-flight tasks always restart from scratch — no partial recovery. Logs note "hard restart".

---

## ♻️ Idempotency of the Pipeline

- `sprint-state.json` is tooling-managed and updated on every gate transition. It is the source of truth for restart.
- In-flight tasks on crash: **always restart from scratch**. Partial recovery is where crap code lives.
- The app pipeline itself must also be idempotent (per `AGENTS.md` and `SPEC.md`), but that is an application concern, not an orchestration concern.

---

## 🏁 Final Review (when all tasks complete)

Interactive. Orchestrator walks the human through the sprint for sign-off, then collaboratively triages any polish work.

```
🧭 Orchestrator
  → subagent(architect-final)                       → read-only pass/fail verdict + triage list
  → 💬 Orchestrator chats with human                 (parent, interactive):
       "Architect flagged A, B, C. Which do you want to polish now?"
  → For each agreed-upon fix:
       → subagent(pm)                                → appends polish-{n} to plan.md;
                                                        calls polish_task_append* (phase → development)
       → Run polish-{n} through the full gate chain (same as a normal task)
       → On commit, extension flips phase back → final-review if no more polish tasks pending
  → When human is satisfied:
       → subagent(pm) in doc-update mode             → proposes updates to
                                                        /docs/architecture.md (targeted sections, living doc),
                                                        /docs/project_memory.md (newest sprint on top),
                                                        /CHANGELOG.md (append under "Not yet released"),
                                                        /README.md,
                                                        /docs/sprint/{name}/sprint-review.md (consolidates the 6 planning docs),
                                                        /docs/sprint/{name}/qa-script.md (final QA form)
  → ✋ Human approves doc updates
  → tooling: close the sprint*
       /sprint:approve-close          — pushes branch, opens a GitHub PR via `gh` (default)
       /sprint:approve-close --local  — merges sprint/{name} → main directly (no remote needed)
  → ✅ Done
```

Polish tasks are **ordinary tasks** — same gate chain, same subagents, same commit policy. The only special machinery is `polish_task_append`, which lets PM append to `plan.md` while the sprint is in `final-review` phase and flips the phase back to `development` for the duration.

---

## 🚨 Escalation

If the Builder cannot produce acceptable code after strike 3:

1. Orchestrator runs `subagent(architect)` in escalation mode to resolve.
2. If unresolved after one more retry (strike 4), **halt the entire sprint** and surface to human with full logs and current diff.

Escalation is always logged in `sprint.log` with the reason and the state of the failing task.
