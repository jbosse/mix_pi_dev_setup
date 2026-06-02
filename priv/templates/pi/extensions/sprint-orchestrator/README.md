# 🧭 sprint-orchestrator extension

Deterministic spine for the sprint process defined in [`/docs/ORCHESTRATION.md`](../../../docs/ORCHESTRATION.md). Owns every `*`-marked step so agents cannot drift state.

## What it guarantees

- ✋ **Refuses to work on `main`** — warns on startup, disables sprint tools until you're on `sprint/{name}`.
- 🔒 **Only tooling may commit/merge/push** — ad-hoc `git commit|merge|push|reset|rebase|cherry-pick` from the model is blocked unless it originates from `commit_task` / `sprint_merge`.
- 🧱 **File ownership enforced** — writes to any path must be claimed by the current in-flight task (`gate !== done`). Tasks run strictly one at a time in `plan.md` order, so ownership is unambiguous. Writes to a later task's declared files are blocked with an explicit error — finish the current task first. Writes to paths no task claims are refused; route them through a polish-{n} task.
- 📒 **Single source of truth** — `sprint-state.json` is the only restart oracle. Log parsing is never used for state recovery.
- 🧪 **Verify is binary** — `verify_run` either returns green for every step in the pipeline or the task goes back to builder.
- 🎯 **One commit per task** — `commit_task` refuses unless every gate is green; message format is fixed. Also refuses if any dirty working-tree file is outside the task's declared ownership or the sprint artifact dir — no stealth edits hitch a ride.
- 📦 **Planning is committed atomically** — `/sprint:approve-planning` runs `mix precommit` against the planning tree and refuses approval on failure. On pass it auto-commits every planning artifact (docs/sprint/*, ADRs, glossary edits, test stubs, test_helper config, support fixtures) as one `[sprint/{name}] planning: approved` commit before flipping the phase.

## Tools (model-callable)

| Tool | Purpose |
|---|---|
| `sprint_start` | Create branch + sprint dir + state file. Idempotent. |
| `sprint_state_get` | Read current state. |
| `sprint_tasks_seed` | PM-time: seed a flat, ordered task list from plan.md and flip phase to `development`. Unique-id check only — no wave/overlap validation (tasks run one at a time). |
| `sprint_state_transition` | Advance a task to the next gate on PASS. Refuses illegal edges. |
| `task_log_append` | Append to `{task-id}-{agent}-{attempt}.log`. |
| `strike_record` | Record a gate FAIL. Halts sprint on strike 4. |
| `verify_run` | Run the Elixir verification pipeline (deps/compile/format/credo/sobelow/ecto/dialyzer/test/assets). Gate 4. |
| `commit_task` | Author the one commit per task. Refuses unless all green. Flips phase to `final-review` when all tasks are done. If the task was a polish task appended during final-review, restores `final-review` once no more polish tasks remain. |
| `polish_task_append` | Final-review-time: append a single polish-{n} task. Flips phase to `development` until the task commits. Refuses outside final-review (or an already-running polish phase). |
| `consolidate_logs` | Merge all `logs/*.log` files into `sprint-tasks.log`, verify each was written, delete individual files, commit. Called automatically by `/sprint:approve-close`; available standalone too. Idempotent. |
| `sprint_merge` | Merge `sprint/{name}` → `main` with `--no-ff`. |

## Commands (human-facing)

| Command | Purpose |
|---|---|
| `/sprint:status` | Summary of current state. |
| `/sprint:resume` | Rebind `ACTIVE_SPRINT` from current branch. |
| `/sprint:approve-planning` | Run `mix precommit`; on pass, commit planning artifacts and flip phase → `planning-approved`. |
| `/sprint:approve-close` | Consolidate task logs, then: default = push branch + open GitHub PR via `gh`; `--local` = merge into `main` directly. |
| `/sprint:halt` | Manual strike-4. |

## Not yet wired (next sprint)

- PM doc-update pipeline (`architecture.md`, `project_memory.md`, `README.md`) — currently proposals-only, human approves.

## Files

```
index.ts    # registers tools, commands, guards; caches ACTIVE_SPRINT
state.ts    # SprintState types + legal gate transitions + strike counter
git.ts      # branch/commit/merge helpers; AUTHORIZED flag for bash guard
verify.ts   # runs the verification pipeline, returns structured results
guards.ts   # on-main refusal, bash-git guard, ownership guard
paths.ts    # sprint dir layout (one place to rename things)
```
