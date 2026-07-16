defmodule PiDevSetup.Templates do
  @moduledoc """
  Shared template machinery for the `pi_dev_*` Mix tasks.

  The single source of truth for what ships is `priv/templates/` — file
  mappings are derived by globbing it, so a template file added there can
  never be silently forgotten by setup, update, or sync.

  Templates use explicit placeholder tokens:

    * `__APP_MODULE__`     — e.g. `MyShop`
    * `__APP_WEB_MODULE__` — e.g. `MyShopWeb`
    * `__APP_NAME__`       — e.g. `my_shop`
    * `__APP_WEB_NAME__`   — e.g. `my_shop_web`
    * `__GENERATED_DATE__` — ISO8601 date of generation
  """

  import Bitwise, only: [bor: 2]

  # Root config files are stored without the leading dot so they aren't
  # hidden inside priv/templates/.
  @root_dotfiles %{
    "credo.exs" => ".credo.exs",
    "dialyzer_ignore.exs" => ".dialyzer_ignore.exs",
    "sobelow-conf" => ".sobelow-conf"
  }

  @executables ["spawn-agent", "remove-agent"]

  def template_dir do
    :code.priv_dir(:pi_dev_setup) |> List.to_string() |> Path.join("templates")
  end

  @doc """
  Placeholder substitutions for the target app.

  Options:
    * `:date` — value for `__GENERATED_DATE__` (defaults to today). Pass the
      literal token to keep output date-independent (used by `pi_dev.sync` so
      the CI drift check is deterministic).
  """
  def substitutions(app_name, opts \\ []) do
    app_module = Macro.camelize(app_name)
    date = Keyword.get(opts, :date, Date.utc_today() |> Date.to_iso8601())

    [
      {"__APP_WEB_MODULE__", "#{app_module}Web"},
      {"__APP_MODULE__", app_module},
      {"__APP_WEB_NAME__", "#{app_name}_web"},
      {"__APP_NAME__", app_name},
      {"__GENERATED_DATE__", date}
    ]
  end

  @doc "Render one template (path relative to `template_dir/0`) with substitutions applied."
  def render(template_rel, substitutions) do
    template_dir()
    |> Path.join(template_rel)
    |> File.read!()
    |> apply_substitutions(substitutions)
  end

  def apply_substitutions(content, substitutions) do
    Enum.reduce(substitutions, content, fn {from, to}, acc ->
      String.replace(acc, from, to)
    end)
  end

  @doc """
  Every template → destination mapping, derived from the files on disk.
  Sorted for stable output.
  """
  def file_mappings do
    dir = template_dir()

    dir
    |> Path.join("**")
    |> Path.wildcard(match_dot: true)
    |> Enum.filter(&File.regular?/1)
    |> Enum.map(&Path.relative_to(&1, dir))
    |> Enum.reject(&(Path.basename(&1) == ".DS_Store"))
    |> Enum.sort()
    |> Enum.map(&{&1, destination(&1)})
  end

  @doc """
  The subset of mappings `mix pi_dev_update` may overwrite: pi tooling only
  (agents, chains, skills, extension source, worktree scripts). Files the
  user owns after setup (docs/, SPEC.md, .pi/settings.json, .pi/README.md,
  static-analysis configs) are excluded.
  """
  def updatable_file_mappings do
    Enum.filter(file_mappings(), fn {_template, dest} -> updatable?(dest) end)
  end

  defp updatable?(".pi/agents/" <> _), do: true
  defp updatable?(".pi/chains/" <> _), do: true
  defp updatable?(".pi/skills/" <> _), do: true
  defp updatable?(".pi/extensions/" <> _), do: true
  defp updatable?(dest) when dest in @executables, do: true
  defp updatable?(_), do: false

  defp destination("pi/" <> rest), do: ".pi/" <> rest
  defp destination(rel), do: Map.get(@root_dotfiles, rel, rel)

  def executables, do: @executables

  def make_executable(paths) do
    Enum.each(paths, fn path ->
      if File.exists?(path) do
        current = File.stat!(path).mode
        # Add owner+group+other execute bits (0o111)
        File.chmod!(path, bor(current, 0o111))
      end
    end)
  end

  @sprint_gitignore_patterns """
  # Sprint planning working docs (intermediate — not committed to the repo)
  # Only sprint-review.md and qa-script.md are committed; everything else is ephemeral.
  docs/sprint/*/logs/
  docs/sprint/*/sprint-state.json
  docs/sprint/*/sprint.log
  docs/sprint/*/planning-summary.md
  docs/sprint/*/architecture.md
  docs/sprint/*/plan.md
  docs/sprint/*/spec.md
  docs/sprint/*/user-stories.md
  docs/sprint/*/reviewer-checklist.md
  """

  # Sentinel: first data line of the block above.
  @sprint_gitignore_sentinel "docs/sprint/*/logs/"

  def patch_gitignore do
    path = ".gitignore"
    existing = if File.exists?(path), do: File.read!(path), else: ""

    if String.contains?(existing, @sprint_gitignore_sentinel) do
      Mix.shell().info([
        :light_black,
        "* no change",
        :reset,
        " #{path} (sprint patterns already present)"
      ])
    else
      separator = if String.ends_with?(existing, "\n") or existing == "", do: "", else: "\n"
      File.write!(path, existing <> separator <> "\n" <> @sprint_gitignore_patterns)
      Mix.shell().info([:green, "* updated  ", :reset, "#{path} (sprint artifact patterns added)"])
    end
  end
end
