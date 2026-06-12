# 🧭 Pi wiring for PiDevSetup

Auto-discovered by [pi](https://pi.dev) from `cwd`. Nothing here needs to be installed — pi picks it up on startup.

## 🧩 Extension

- **[`extensions/sprint-orchestrator/`](./extensions/sprint-orchestrator/)** — deterministic spine for the sprint process in [`/docs/ORCHESTRATION.md`](../docs/ORCHESTRATION.md). Owns git, state machine, verification pipeline, commit/merge, strike counter, file-ownership enforcement, polish-task append.

See its [README](./extensions/sprint-orchestrator/README.md) for tools and commands.

## 🛰 Agents (pi-subagents)

Each non-parent role runs as a fresh child Pi process via [`pi-subagents`](https://github.com/nicobailon/pi-subagents). Agent shims live in [`agents/`](./agents/) and inject the corresponding skill. One-time setup:

```bash
pi install npm:pi-subagents
```

Chains live in [`chains/`](./chains/). The dev loop uses [`task-gates.chain.md`](./chains/task-gates.chain.md) (builder → tester → reviewer → security).

| Agent | Runtime | Phase | Writes? |
|---|---|---|---|
| `product-owner` | subagent | Planning | yes |
| `architect` | subagent | Planning | yes |
| `architect-final` | subagent | Final review | no |
| `pm` | subagent | Planning + Close | yes |
| `tester-planning` | subagent | Planning | yes |
| `tester` | subagent | Dev gate 1 | tests only |
| `builder` | subagent | Dev | yes (declared ownership) |
| `reviewer` | subagent | Dev gate 2 | no |
| `security` | subagent | Dev gate 3 | no |
| Orchestrator | **parent** | All | no (routes only) |

## 🧠 Skills

Skill files remain the source of truth for each role's rules. Agent shims inject them. The Orchestrator still runs as a parent-level skill, not a subagent.

| Skill | Phase | Owns gate |
|---|---|---|
| [`orchestrator`](./skills/orchestrator/SKILL.md) | All (parent) | — |
| [`planning-interview`](./skills/planning-interview/SKILL.md) | Planning kickoff (parent) | — |
| [`product-owner`](./skills/product-owner/SKILL.md) | Planning | — |
| [`architect`](./skills/architect/SKILL.md) | Planning + Final | Final architectural review |
| [`pm`](./skills/pm/SKILL.md) | Planning + Close | — |
| [`tester`](./skills/tester/SKILL.md) | Planning + Dev | Tests pass (Gate 1) |
| [`builder`](./skills/builder/SKILL.md) | Dev | — |
| [`reviewer`](./skills/reviewer/SKILL.md) | Dev | Code review (Gate 2) |
| [`security`](./skills/security/SKILL.md) | Dev | Security review (Gate 3) |
| [`styleguide-check`](./skills/styleguide-check/SKILL.md) | Shared | — |

## 🔁 The split

> **Deterministic = extension. Judgement = skill (in a subagent). Routing = Orchestrator (parent).**

- Anything marked `*` in `ORCHESTRATION.md` (branch, commit, verify, merge, state writes, strike counter, polish append) lives in the extension. Skills cannot bypass it — the extension's guards block ad-hoc `git commit|merge|push`, refuse writes outside declared file ownership, and refuse to work on `main`.
- Everything else (user stories, architecture, code, tests, reviews) lives in a skill, executed inside a fresh child subagent. Subagents call the extension's tools to persist state and advance gates.
- The Orchestrator lives in the parent session. It never holds role artifact bodies in its context — subagents read those files directly from disk.

## 🗂 Flow at a glance

```
parent (Orchestrator)
  └─ /skill:planning-interview           (parent, interactive)
  └─ sprint_start*                       (tool)
  └─ subagent(product-owner)             → user-stories.md, qa-script.md
  └─ subagent(architect)                 → architecture.md, reviewer-checklist.md
  └─ subagent(tester-planning)           → test stubs, qa-script.md edges
  └─ subagent(pm)                        → planning-summary.md
  └─ /sprint:approve-planning*           (human)
  └─ subagent(pm)                        → spec.md, plan.md, sprint_tasks_seed*
  └─ for each task in plan.md order:
       subagent(chain: task-gates)       → builder → tester → reviewer → security
       verify_run*                       (Gate 4)
       commit_task*
  └─ subagent(architect-final)           → verdict + triage
  └─ human polish chat (parent):
       subagent(pm) → polish_task_append*
       subagent(chain: task-gates) + verify_run* + commit_task*
  └─ subagent(pm)                        → doc updates
  └─ /sprint:approve-close*              (human)
```

## ⚙ Model config

Single source of truth: **Pi's global default model** (set at the user level). All agent shims omit the `model:` field and inherit.

To pin a specific role to a different model, add it to `.pi/settings.json` under `subagents.agentOverrides.<name>.model`. No agent file edits needed.

## 🧪 Trying it out

```bash
cd /path/to/repo
pi
```

On startup you should see the extension loaded and agents auto-discovered. If you're on `main`, it will warn per `/AGENTS.md` rule. Switch to a sprint branch (or call `sprint_start`) to proceed.

```
/sprint:status        # show current state
/skill:orchestrator   # drive the sprint
```
