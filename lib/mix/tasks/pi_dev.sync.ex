defmodule Mix.Tasks.PiDev.Sync do
  use Mix.Task

  alias PiDevSetup.Templates

  @shortdoc "Regenerates this repo's live .pi/, docs/, and root files from priv/templates/"

  @moduledoc """
  Development task for this repository only.

  `priv/templates/` is the single source of truth. The live copies at the
  repo root (`.pi/`, `docs/`, `SPEC.md`, `spawn-agent`, …) exist so the
  tooling can be inspected and dogfooded, but they are generated artifacts —
  never edit them directly. Edit the template, then run:

      mix pi_dev.sync

  CI runs the check mode and fails when the live copies have drifted from
  the templates:

      mix pi_dev.sync --check

  Rendering uses this project's own app name (`pi_dev_setup`) and keeps the
  `__GENERATED_DATE__` token unexpanded so output is date-independent —
  otherwise the drift check would fail the day after every sync.
  """

  @impl Mix.Task
  def run(args) do
    {opts, _, _} = OptionParser.parse(args, strict: [check: :boolean])
    check? = Keyword.get(opts, :check, false)

    app_name = Mix.Project.config()[:app] |> Atom.to_string()
    substitutions = Templates.substitutions(app_name, date: "__GENERATED_DATE__")

    results =
      Enum.map(Templates.file_mappings(), fn {template_rel, dest} ->
        new_content = Templates.render(template_rel, substitutions)

        cond do
          File.exists?(dest) and File.read!(dest) == new_content ->
            {:unchanged, dest}

          check? ->
            {:drifted, dest}

          true ->
            File.mkdir_p!(Path.dirname(dest))
            File.write!(dest, new_content)
            {:written, dest}
        end
      end)

    drifted = for {:drifted, f} <- results, do: f
    written = for {:written, f} <- results, do: f
    unchanged = for {:unchanged, f} <- results, do: f

    cond do
      check? and drifted != [] ->
        Mix.shell().error("Live copies have drifted from priv/templates/ (#{length(drifted)} files):")
        Enum.each(drifted, &Mix.shell().error("  ✗ #{&1}"))
        Mix.shell().error("\nRun `mix pi_dev.sync` and commit the result.")
        exit({:shutdown, 1})

      check? ->
        Mix.shell().info("✅ live copies match priv/templates/ (#{length(unchanged)} files)")

      true ->
        Enum.each(written, &Mix.shell().info([:green, "* synced   ", :reset, &1]))
        Templates.make_executable(Templates.executables())

        Mix.shell().info(
          "\n✅ sync complete: #{length(written)} written, #{length(unchanged)} unchanged."
        )
    end
  end
end
