# mix_pi_dev_setup

A Mix generator that adds [Pi.dev](https://pi.dev) AI sprint tooling to an existing Phoenix project.

## What it does

Running `mix pi_dev_setup` in your Phoenix project will:

- Scaffold **`.pi/`** — Pi configuration, agents, chains, skills, and the `sprint-orchestrator` extension
- Scaffold **`docs/`** — living architecture, styleguide, glossary, orchestration process, and project memory docs
- Create **`SPEC.md`** — product specification scaffold
- Create **`spawn-agent`** / **`remove-agent`** — worktree lifecycle scripts for parallel Pi sessions
- Create **`.credo.exs`**, **`.dialyzer_ignore.exs`**, **`.sobelow-conf`** — static analysis config
- Create **`priv/plts/.gitkeep`** — Dialyzer PLT cache directory
- Patch **`mix.exs`**:
  - Adds `dialyzer:` config (PLT paths + flags)
  - Adds `:credo`, `:dialyxir`, `:sobelow`, `:mox` to `deps/0`
  - Expands the `precommit:` alias to the full verification pipeline (the sprint
    orchestrator's `verify_run` gate executes `mix precommit`, so the alias is
    the single source of truth for verification)

All generated content is automatically tailored to your app — module names like `MyApp` and `MyAppWeb` are derived from your project's `mix.exs`, no arguments needed.

Re-running is safe: existing files are never overwritten.

## Install

```bash
mix archive.install github jbosse/mix_pi_dev_setup
```

To pin to a specific version:

```bash
mix archive.install github jbosse/mix_pi_dev_setup tag:v0.1.0
```

To upgrade later:

```bash
mix archive.install github jbosse/mix_pi_dev_setup --force
```

## Usage

From the root of an existing Phoenix project:

```bash
mix pi_dev_setup
```

Then follow the printed next steps:

```
1. mix deps.get            # fetch credo, dialyxir, sobelow, mox
2. pi install npm:pi-subagents   # subagents package for Pi
3. Review .pi/extensions/sprint-orchestrator/tsconfig.json
   and update the @mariozechner/pi-coding-agent path if needed
4. Add priv/plts/ to .gitignore (or commit the .gitkeep)
5. pi                      # start Pi and run /skill:orchestrator
```

## Updating tooling in an existing project

If you've already run `mix pi_dev_setup` and want to pull in updated agent,
skill, chain, or extension files from a newer version of this archive:

```bash
# 1. upgrade the archive itself
mix archive.install github jbosse/mix_pi_dev_setup --force

# 2. update tooling files in your project
mix pi_dev_update
```

Preview what would change without writing anything:

```bash
mix pi_dev_update --dry-run
```

Skip the confirmation prompt (useful in CI):

```bash
mix pi_dev_update --force
```

**Only pi tooling files are touched** — agents, skills, chains, and extension
source. Your `docs/`, `SPEC.md`, `mix.exs`, `.pi/settings.json`, and static
analysis configs are never modified.

## What gets generated

```
.credo.exs
.dialyzer_ignore.exs
.sobelow-conf
SPEC.md
priv/plts/.gitkeep

.pi/
  README.md
  settings.json
  settings-lmstudio.json.example
  agents/          architect, architect-final, builder, pm, product-owner,
                   reviewer, security, tester, tester-planning
  chains/          task-gates.chain.md, review-gates.chain.md
  extensions/      sprint-orchestrator/ (TypeScript — git, guards, state machine,
                   verify pipeline, tools, commands)
  skills/          architect, builder, orchestrator, pair-programmer, pair-sprint,
                   planning-interview, pm, product-owner, reviewer, security,
                   styleguide-check, tester

docs/
  ORCHESTRATION.md
  architecture.md
  glossary.md
  project_memory.md
  styleguide.md
```

## The sprint process

The tooling implements an AI-assisted Scrum-style sprint workflow:

```
/skill:orchestrator   ← start here in Pi
  → planning interview (you + Orchestrator)
  → sprint_start
  → subagents: Product Owner → Architect → Tester → PM
  → human approval
  → dev loop: Builder → Tester → Reviewer → Security → Verify → Commit
  → final review + polish
  → sprint close (PR or local merge)
```

See `docs/ORCHESTRATION.md` in your project after running the generator for the full process.

### Pair-programming modes

When you'd rather build alongside the agent than watch it go:

- **`/skill:pair-sprint`** — the same sprint lifecycle, but every dev task is
  ping-pong pair-programmed with you in the parent session (one side writes a
  failing test, the other makes it green, swap). Reviewer and Security still
  run as fresh subagents, and verify + single-commit-per-task are unchanged.
- **`/skill:pair-programmer`** — the ping-pong protocol standalone, on any
  branch, with no sprint ceremony. You own git; the agent proposes commit
  points after `mix precommit` is green.

## Requirements

- Elixir ~> 1.15
- An existing Phoenix 1.8 project
- [Pi.dev](https://pi.dev) installed
- `pi-subagents` (`pi install npm:pi-subagents`)

## Development (this repo)

**`priv/templates/` is the single source of truth.** The live copies at the
repo root (`.pi/`, `docs/`, `SPEC.md`, `spawn-agent`, …) are generated
artifacts kept around for inspection and dogfooding — never edit them
directly. The workflow is:

```bash
# 1. edit files under priv/templates/
# 2. regenerate the live copies
mix pi_dev.sync
# 3. commit both
```

Templates use explicit placeholder tokens that the generator substitutes with
the target app's names: `__APP_MODULE__`, `__APP_WEB_MODULE__`,
`__APP_NAME__`, `__APP_WEB_NAME__`, `__GENERATED_DATE__`.

CI enforces all of this:

- `mix test` — unit tests for the mix.exs patcher and template machinery
- `mix pi_dev.sync --check` — fails if live copies drift from templates
- `tsc --noEmit` (via `.github/ts-check/`) — typechecks the sprint-orchestrator
  extension against the published `@mariozechner/pi-coding-agent` types
