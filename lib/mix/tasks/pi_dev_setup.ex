defmodule Mix.Tasks.PiDevSetup do
  use Mix.Task

  alias PiDevSetup.{MixExsPatcher, Templates}

  @shortdoc "Adds Pi.dev AI sprint tooling to a Phoenix project"

  @moduledoc """
  Scaffolds Pi.dev AI development tooling into an existing Phoenix project.

  Generates:
    - `.pi/` — Pi configuration, agents, chains, skills, and the sprint-orchestrator extension
    - `docs/` — living architecture, styleguide, glossary, orchestration, and project-memory docs
    - `SPEC.md` — product specification scaffold
    - `spawn-agent` / `remove-agent` — worktree lifecycle scripts for running parallel Pi sessions
    - `.credo.exs`, `.dialyzer_ignore.exs`, `.sobelow-conf` — static analysis config

  Patches `mix.exs`:
    - Adds `dialyzer:` config (PLT paths + flags)
    - Adds `:credo`, `:dialyxir`, `:sobelow`, `:mox` to `deps/0`
    - Expands the `precommit:` alias to the full verification pipeline

  All generated content is tailored to the current project's app module name,
  derived automatically from `Mix.Project.config()[:app]`.

  ## Usage

      mix pi_dev_setup

  Run from the root of an existing Phoenix project. Safe to re-run — existing
  files are not overwritten (Mix.Generator prints a `* already exists` notice
  instead of silently stomping on changes).

  ## After running

  1. `mix deps.get` — fetch the new tooling deps
  2. `pi install npm:pi-subagents` — install the subagents package for Pi
  3. Add `export PI_CMD="..."` to your `.env.local` (see `spawn-agent` usage)
  4. Start Pi and run `/skill:orchestrator` to kick off your first sprint
  """

  @impl Mix.Task
  def run(_args) do
    config = Mix.Project.config()

    unless config[:app] do
      Mix.raise("mix pi_dev_setup must be run from inside a Mix project (no app found in mix.exs)")
    end

    app_name = config[:app] |> Atom.to_string()
    app_module = Macro.camelize(app_name)
    substitutions = Templates.substitutions(app_name)

    Mix.shell().info("""

    Setting up Pi.dev AI sprint tooling for #{app_module} (#{app_name})…
    """)

    Enum.each(Templates.file_mappings(), fn {template_rel, dest} ->
      Mix.Generator.create_file(dest, Templates.render(template_rel, substitutions))
    end)

    Templates.make_executable(Templates.executables())
    create_plts_dir()
    Templates.patch_gitignore()
    patch_mix_exs()

    Mix.shell().info("""

    ✅  Pi.dev tooling installed for #{app_module}.

    Next steps:
      1.  mix deps.get            # fetch credo, dialyxir, sobelow, mox
      2.  pi install npm:pi-subagents   # subagents package for Pi
      3.  Review .pi/extensions/sprint-orchestrator/tsconfig.json
          and update the @mariozechner/pi-coding-agent path if needed
      4.  Add `export PI_CMD="..."` to .env.local (your full pi invocation)
      5.  pi                      # start Pi and run /skill:orchestrator
    """)
  end

  defp patch_mix_exs do
    path = "mix.exs"

    if File.exists?(path) do
      original = File.read!(path)
      patched = MixExsPatcher.patch(original)

      if patched == original do
        Mix.shell().info([
          :yellow,
          "* could not auto-patch ",
          :reset,
          "#{path} (patterns not found — see instructions below)"
        ])

        Mix.shell().info(MixExsPatcher.manual_instructions())
      else
        File.write!(path, patched)
        Mix.shell().info([:green, "* updated ", :reset, path])

        if String.contains?(original, "dialyzer:") do
          Mix.shell().info([:yellow, "  note: ", :reset, "dialyzer: config already present, skipped"])
        end

        if String.contains?(original, ":credo") do
          Mix.shell().info([:yellow, "  note: ", :reset, "tooling deps already present, skipped"])
        end
      end
    else
      Mix.shell().info([:yellow, "* skipped ", :reset, "#{path} (file not found)"])
      Mix.shell().info(MixExsPatcher.manual_instructions())
    end
  end

  defp create_plts_dir do
    dir = "priv/plts"
    Mix.Generator.create_directory(dir)
    gitkeep = Path.join(dir, ".gitkeep")
    Mix.Generator.create_file(gitkeep, "")
  end
end
