defmodule Mix.Tasks.PiDevUpdate do
  use Mix.Task

  @shortdoc "Updates Pi.dev agent/skill/chain/extension files to the latest templates"

  @moduledoc """
  Updates Pi.dev AI sprint tooling files in an existing Phoenix project.

  Only the Pi *tooling* files are updated — files you author (docs, SPEC.md,
  mix.exs, settings.json, static-analysis configs) are left untouched.

  ## Files updated

    - `.pi/agents/*.md`       — agent definitions
    - `.pi/chains/*.md`       — chain definitions
    - `.pi/skills/*/SKILL.md` — skill instructions
    - `.pi/extensions/sprint-orchestrator/**` — extension source

  ## Files intentionally skipped

    - `docs/`                      — project documentation you own
    - `SPEC.md`                    — your product spec
    - `mix.exs`                    — already patched during setup
    - `.pi/settings.json`          — your provider / model config
    - `.pi/settings-lmstudio.json.example`
    - `.pi/README.md`
    - `.credo.exs`, `.dialyzer_ignore.exs`, `.sobelow-conf`

  ## Usage

      mix pi_dev_update

  Add `--dry-run` to preview which files would change without writing anything:

      mix pi_dev_update --dry-run

  Add `--force` to skip the confirmation prompt:

      mix pi_dev_update --force
  """

  @impl Mix.Task
  def run(args) do
    {opts, _, _} = OptionParser.parse(args, strict: [dry_run: :boolean, force: :boolean])
    dry_run? = Keyword.get(opts, :dry_run, false)
    force? = Keyword.get(opts, :force, false)

    config = Mix.Project.config()

    unless config[:app] do
      Mix.raise("mix pi_dev_update must be run from inside a Mix project (no app found in mix.exs)")
    end

    app_name = config[:app] |> Atom.to_string()
    app_module = Macro.camelize(app_name)
    today = Date.utc_today() |> Date.to_iso8601()

    substitutions = [
      {"StaffForecastWeb", "#{app_module}Web"},
      {"StaffForecast", app_module},
      {"staff_forecast_web", "#{app_name}_web"},
      {"staff_forecast", app_name},
      {"__GENERATED_DATE__", today}
    ]

    template_dir = :code.priv_dir(:pi_dev_setup) |> List.to_string() |> Path.join("templates")

    mappings = updatable_file_mappings()

    if dry_run? do
      run_dry(mappings, template_dir, substitutions)
    else
      run_update(mappings, template_dir, substitutions, app_module, force?)
    end
  end

  # ── Dry-run: show what would change ─────────────────────────────────────

  defp run_dry(mappings, template_dir, substitutions) do
    Mix.shell().info("\nDry run — no files will be written.\n")

    {changed, unchanged, missing} =
      Enum.reduce(mappings, {[], [], []}, fn {template_rel, dest}, {ch, unch, miss} ->
        template_path = Path.join(template_dir, template_rel)
        new_content = File.read!(template_path) |> apply_substitutions(substitutions)

        cond do
          not File.exists?(dest) -> {ch, unch, [dest | miss]}
          File.read!(dest) == new_content -> {ch, [dest | unch], miss}
          true -> {[dest | ch], unch, miss}
        end
      end)

    if changed != [] do
      Mix.shell().info("Would update (#{length(changed)} files):")
      Enum.each(Enum.sort(changed), &Mix.shell().info("  * #{&1}"))
    end

    if missing != [] do
      Mix.shell().info("\nNot installed — would create (#{length(missing)} files):")
      Enum.each(Enum.sort(missing), &Mix.shell().info("  + #{&1}"))
    end

    if unchanged != [] do
      Mix.shell().info("\nAlready up to date (#{length(unchanged)} files): no changes needed")
    end
  end

  # ── Real update ──────────────────────────────────────────────────────────

  defp run_update(mappings, template_dir, substitutions, app_module, force?) do
    Mix.shell().info("\nUpdating Pi.dev tooling for #{app_module}…\n")

    unless force? do
      Mix.shell().info("This will overwrite all agent, skill, chain, and extension files.")
      Mix.shell().info("User files (docs/, SPEC.md, settings.json, mix.exs) are not touched.\n")

      unless Mix.shell().yes?("Continue?") do
        Mix.shell().info("Aborted.")
        exit(:normal)
      end

      Mix.shell().info("")
    end

    results =
      Enum.map(mappings, fn {template_rel, dest} ->
        template_path = Path.join(template_dir, template_rel)
        new_content = File.read!(template_path) |> apply_substitutions(substitutions)

        cond do
          not File.exists?(dest) ->
            File.mkdir_p!(Path.dirname(dest))
            File.write!(dest, new_content)
            {:created, dest}

          File.read!(dest) == new_content ->
            {:unchanged, dest}

          true ->
            File.write!(dest, new_content)
            {:updated, dest}
        end
      end)

    created = for {:created, f} <- results, do: f
    updated = for {:updated, f} <- results, do: f
    unchanged = for {:unchanged, f} <- results, do: f

    Enum.each(updated, &Mix.shell().info([:green, "* updated  ", :reset, &1]))
    Enum.each(created, &Mix.shell().info([:cyan, "* created  ", :reset, &1]))
    Enum.each(unchanged, &Mix.shell().info([:light_black, "* no change", :reset, " #{&1}"]))

    Mix.shell().info("""

    ✅  Pi.dev tooling updated for #{app_module}.
        #{length(updated)} updated, #{length(created)} created, #{length(unchanged)} unchanged.

    Restart Pi to pick up the new agent/skill/chain definitions.
    """)
  end

  # ── Substitution ─────────────────────────────────────────────────────────

  defp apply_substitutions(content, substitutions) do
    Enum.reduce(substitutions, content, fn {from, to}, acc ->
      String.replace(acc, from, to)
    end)
  end

  # ── Files to update (agents / skills / chains / extension source only) ───

  defp updatable_file_mappings do
    [
      # .pi/agents/
      {"pi/agents/architect-final.md", ".pi/agents/architect-final.md"},
      {"pi/agents/architect.md", ".pi/agents/architect.md"},
      {"pi/agents/builder.md", ".pi/agents/builder.md"},
      {"pi/agents/pm.md", ".pi/agents/pm.md"},
      {"pi/agents/product-owner.md", ".pi/agents/product-owner.md"},
      {"pi/agents/reviewer.md", ".pi/agents/reviewer.md"},
      {"pi/agents/security.md", ".pi/agents/security.md"},
      {"pi/agents/tester-planning.md", ".pi/agents/tester-planning.md"},
      {"pi/agents/tester.md", ".pi/agents/tester.md"},

      # .pi/chains/
      {"pi/chains/task-gates.chain.md", ".pi/chains/task-gates.chain.md"},

      # .pi/skills/
      {"pi/skills/architect/SKILL.md", ".pi/skills/architect/SKILL.md"},
      {"pi/skills/builder/SKILL.md", ".pi/skills/builder/SKILL.md"},
      {"pi/skills/orchestrator/SKILL.md", ".pi/skills/orchestrator/SKILL.md"},
      {"pi/skills/planning-interview/SKILL.md", ".pi/skills/planning-interview/SKILL.md"},
      {"pi/skills/pm/SKILL.md", ".pi/skills/pm/SKILL.md"},
      {"pi/skills/product-owner/SKILL.md", ".pi/skills/product-owner/SKILL.md"},
      {"pi/skills/reviewer/SKILL.md", ".pi/skills/reviewer/SKILL.md"},
      {"pi/skills/security/SKILL.md", ".pi/skills/security/SKILL.md"},
      {"pi/skills/styleguide-check/SKILL.md", ".pi/skills/styleguide-check/SKILL.md"},
      {"pi/skills/tester/SKILL.md", ".pi/skills/tester/SKILL.md"},

      # .pi/extensions/sprint-orchestrator/
      {"pi/extensions/sprint-orchestrator/README.md",
       ".pi/extensions/sprint-orchestrator/README.md"},
      {"pi/extensions/sprint-orchestrator/git.ts",
       ".pi/extensions/sprint-orchestrator/git.ts"},
      {"pi/extensions/sprint-orchestrator/guards.ts",
       ".pi/extensions/sprint-orchestrator/guards.ts"},
      {"pi/extensions/sprint-orchestrator/index.ts",
       ".pi/extensions/sprint-orchestrator/index.ts"},
      {"pi/extensions/sprint-orchestrator/paths.ts",
       ".pi/extensions/sprint-orchestrator/paths.ts"},
      {"pi/extensions/sprint-orchestrator/state.ts",
       ".pi/extensions/sprint-orchestrator/state.ts"},
      {"pi/extensions/sprint-orchestrator/tsconfig.json",
       ".pi/extensions/sprint-orchestrator/tsconfig.json"},
      {"pi/extensions/sprint-orchestrator/verify.ts",
       ".pi/extensions/sprint-orchestrator/verify.ts"}
    ]
  end
end
