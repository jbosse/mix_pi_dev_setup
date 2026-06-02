defmodule Mix.Tasks.PiDevSetup do
  use Mix.Task

  @shortdoc "Adds Pi.dev AI sprint tooling to a Phoenix project"

  @moduledoc """
  Scaffolds Pi.dev AI development tooling into an existing Phoenix project.

  Generates:
    - `.pi/` — Pi configuration, agents, chains, skills, and the sprint-orchestrator extension
    - `docs/` — living architecture, styleguide, glossary, orchestration, and project-memory docs
    - `SPEC.md` — product specification scaffold
    - `.credo.exs`, `.dialyzer_ignore.exs`, `.sobelow-conf` — static analysis config

  Patches `mix.exs`:
    - Adds `dialyzer:` config (PLT paths + flags)
    - Adds `:credo`, `:dialyxir`, `:sobelow`, `:mox` to `deps/0`
    - Expands the `precommit:` alias to the full 9-step verification pipeline

  All generated content is tailored to the current project's app module name,
  derived automatically from `Mix.Project.config()[:app]`.

  ## Usage

      mix pi_dev_setup

  Run from the root of an existing Phoenix project. Safe to re-run — existing
  files are not overwritten (Mix.Generator prints a `* already exists` notice
  instead of silently stomping on changes).

  ## After running

  1. `mix deps.get` — fetch the new tooling deps
  2. `mkdir -p priv/plts` — create the Dialyzer PLT cache directory
  3. `pi install npm:pi-subagents` — install the subagents package for Pi
  4. Start Pi and run `/skill:orchestrator` to kick off your first sprint
  """

  @impl Mix.Task
  def run(_args) do
    # ── 1. Derive app identifiers ─────────────────────────────────────────
    config = Mix.Project.config()

    unless config[:app] do
      Mix.raise("mix pi_dev_setup must be run from inside a Mix project (no app found in mix.exs)")
    end

    app_name = config[:app] |> Atom.to_string()
    app_module = Macro.camelize(app_name)
    today = Date.utc_today() |> Date.to_iso8601()

    substitutions = [
      # Order matters: Web variant before bare module, _web variant before bare name
      {"StaffForecastWeb", "#{app_module}Web"},
      {"StaffForecast", app_module},
      {"staff_forecast_web", "#{app_name}_web"},
      {"staff_forecast", app_name},
      {"__GENERATED_DATE__", today}
    ]

    Mix.shell().info("""

    Setting up Pi.dev AI sprint tooling for #{app_module} (#{app_name})…
    """)

    # ── 2. Create directories ─────────────────────────────────────────────
    dirs = [
      ".pi/agents",
      ".pi/chains",
      ".pi/extensions/sprint-orchestrator",
      ".pi/skills/architect",
      ".pi/skills/builder",
      ".pi/skills/orchestrator",
      ".pi/skills/planning-interview",
      ".pi/skills/pm",
      ".pi/skills/product-owner",
      ".pi/skills/reviewer",
      ".pi/skills/security",
      ".pi/skills/styleguide-check",
      ".pi/skills/tester",
      "docs"
    ]

    Enum.each(dirs, &Mix.Generator.create_directory/1)

    # ── 3. Generate files from templates ──────────────────────────────────
    template_dir = :code.priv_dir(:pi_dev_setup) |> List.to_string() |> Path.join("templates")

    file_mappings()
    |> Enum.each(fn {template_rel, dest} ->
      template_path = Path.join(template_dir, template_rel)

      content =
        File.read!(template_path)
        |> apply_substitutions(substitutions)

      Mix.Generator.create_file(dest, content)
    end)

    # ── 4. Create Dialyzer PLT directory ─────────────────────────────────
    create_plts_dir()

    # ── 5. Patch mix.exs ──────────────────────────────────────────────────
    patch_mix_exs(app_name)

    Mix.shell().info("""

    ✅  Pi.dev tooling installed for #{app_module}.

    Next steps:
      1.  mix deps.get            # fetch credo, dialyxir, sobelow, mox
      2.  pi install npm:pi-subagents   # subagents package for Pi
      3.  Review .pi/extensions/sprint-orchestrator/tsconfig.json
          and update the @mariozechner/pi-coding-agent path if needed
      4.  Add priv/plts/ to .gitignore (or commit the .gitkeep)
      5.  pi                      # start Pi and run /skill:orchestrator
    """)
  end

  # ── Template → destination mapping ──────────────────────────────────────

  defp file_mappings do
    [
      # Root config files (stored without leading dot in templates/)
      {"credo.exs", ".credo.exs"},
      {"dialyzer_ignore.exs", ".dialyzer_ignore.exs"},
      {"sobelow-conf", ".sobelow-conf"},
      {"SPEC.md", "SPEC.md"},

      # .pi/ root
      {"pi/README.md", ".pi/README.md"},
      {"pi/settings.json", ".pi/settings.json"},
      {"pi/settings-lmstudio.json.example", ".pi/settings-lmstudio.json.example"},

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
       ".pi/extensions/sprint-orchestrator/verify.ts"},

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

      # docs/
      {"docs/ORCHESTRATION.md", "docs/ORCHESTRATION.md"},
      {"docs/architecture.md", "docs/architecture.md"},
      {"docs/glossary.md", "docs/glossary.md"},
      {"docs/project_memory.md", "docs/project_memory.md"},
      {"docs/styleguide.md", "docs/styleguide.md"}
    ]
  end

  # ── String substitution ──────────────────────────────────────────────────

  defp apply_substitutions(content, substitutions) do
    Enum.reduce(substitutions, content, fn {from, to}, acc ->
      String.replace(acc, from, to)
    end)
  end

  # ── mix.exs patching ─────────────────────────────────────────────────────

  @dialyzer_config """
        dialyzer: [
          plt_add_apps: [:ex_unit, :mix],
          plt_file: {:no_warn, "priv/plts/dialyzer.plt"},
          plt_core_path: "priv/plts",
          ignore_warnings: ".dialyzer_ignore.exs",
          flags: [:error_handling, :unknown]
        ],\
  """

  @tooling_deps """

        # --- Tooling / verification gate ---
        {:credo, "~> 1.7", only: [:dev, :test], runtime: false},
        {:dialyxir, "~> 1.4", only: [:dev, :test], runtime: false},
        {:sobelow, "~> 0.13", only: [:dev, :test], runtime: false},
        {:mox, "~> 1.1", only: :test}\
  """

  @precommit_steps [
    "deps.get --check-locked",
    "compile --warnings-as-errors",
    "format --check-formatted",
    "credo --strict",
    "sobelow --config",
    "ecto.create --quiet",
    "ecto.migrate --quiet",
    "dialyzer",
    "test --warnings-as-errors",
    "assets.build"
  ]

  defp patch_mix_exs(app_name) do
    path = "mix.exs"

    if File.exists?(path) do
      original = File.read!(path)
      patched = original |> add_dialyzer_config() |> add_tooling_deps() |> update_precommit_alias()

      if patched == original do
        Mix.shell().info([
          :yellow,
          "* could not auto-patch ",
          :reset,
          "#{path} (patterns not found — see instructions below)"
        ])

        print_mix_exs_instructions(app_name)
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
      print_mix_exs_instructions(app_name)
    end
  end

  defp add_dialyzer_config(content) do
    if String.contains?(content, "dialyzer:") do
      content
    else
      # Inject after the last keyword before the closing `]` of project/0.
      # Phoenix 1.8 always has `listeners: [Phoenix.CodeReloader]` as the last entry.
      # Fall back to `deps: deps(),` as an anchor if listeners is absent.
      cond do
        String.contains?(content, "listeners: [Phoenix.CodeReloader]") ->
          String.replace(
            content,
            "listeners: [Phoenix.CodeReloader]",
            "listeners: [Phoenix.CodeReloader],\n#{@dialyzer_config}",
            global: false
          )

        String.contains?(content, "deps: deps(),") ->
          String.replace(
            content,
            "deps: deps(),",
            "deps: deps(),\n#{@dialyzer_config}",
            global: false
          )

        true ->
          content
      end
    end
  end

  defp add_tooling_deps(content) do
    if String.contains?(content, ":credo") do
      content
    else
      # Phoenix 1.8 ends deps/0 with {:bandit, "~> 1.5"} (no trailing comma).
      # We add a comma to bandit and append our deps before the closing `]`.
      bandit_pattern = ~r/(\{:bandit,[^}]+\})(\s*\n\s*\])/

      if Regex.match?(bandit_pattern, content) do
        Regex.replace(bandit_pattern, content, "\\1,#{@tooling_deps}\n\\2", global: false)
      else
        content
      end
    end
  end

  defp update_precommit_alias(content) do
    if String.contains?(content, "credo --strict") do
      content
    else
      # Match both single-line and multi-line precommit: [...] blocks.
      precommit_pattern = ~r/([ \t]*)precommit:\s*\[.*?\]/s

      if Regex.match?(precommit_pattern, content) do
        # Use a function replacement to capture the existing indent so we
        # don't double up the whitespace that precedes the keyword in the file.
        Regex.replace(
          precommit_pattern,
          content,
          fn _, indent ->
            items = Enum.map_join(@precommit_steps, ",\n", &"#{indent}  #{inspect(&1)}")
            "#{indent}precommit: [\n#{items}\n#{indent}]"
          end,
          global: false
        )
      else
        content
      end
    end
  end

  defp create_plts_dir do
    dir = "priv/plts"
    Mix.Generator.create_directory(dir)
    gitkeep = Path.join(dir, ".gitkeep")
    Mix.Generator.create_file(gitkeep, "")
  end

  defp print_mix_exs_instructions(app_name) do
    Mix.shell().info("""

    ── Manual mix.exs changes needed ────────────────────────────────────────

    1. Add to the project/0 keyword list:

        dialyzer: [
          plt_add_apps: [:ex_unit, :mix],
          plt_file: {:no_warn, "priv/plts/dialyzer.plt"},
          plt_core_path: "priv/plts",
          ignore_warnings: ".dialyzer_ignore.exs",
          flags: [:error_handling, :unknown]
        ],

    2. Add to defp deps do ... end:

        # --- Tooling / verification gate ---
        {:credo, "~> 1.7", only: [:dev, :test], runtime: false},
        {:dialyxir, "~> 1.4", only: [:dev, :test], runtime: false},
        {:sobelow, "~> 0.13", only: [:dev, :test], runtime: false},
        {:mox, "~> 1.1", only: :test}

    3. Replace the precommit: alias in defp aliases do ... end:

        precommit: [
          "deps.get --check-locked",
          "compile --warnings-as-errors",
          "format --check-formatted",
          "credo --strict",
          "sobelow --config",
          "ecto.create --quiet",
          "ecto.migrate --quiet",
          "dialyzer",
          "test --warnings-as-errors",
          "assets.build"
        ]

    ─────────────────────────────────────────────────────────────────────────
    """)

    _ = app_name
    :ok
  end
end
