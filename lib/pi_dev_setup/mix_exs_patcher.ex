defmodule PiDevSetup.MixExsPatcher do
  @moduledoc """
  Patches a Phoenix project's `mix.exs` content:

    1. Adds `dialyzer:` config to `project/0` (PLT paths + flags)
    2. Adds `:credo`, `:dialyxir`, `:sobelow`, `:mox` to `deps/0`
    3. Expands the `precommit:` alias to the full verification pipeline

  Pure string-in/string-out so it can be unit-tested against fixture
  `mix.exs` shapes. Each step is idempotent: if its marker is already
  present, the content passes through unchanged.
  """

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

  def precommit_steps, do: @precommit_steps

  @doc """
  Apply all three patches to `content`. Returns the (possibly unchanged)
  patched string — callers compare with the input to detect whether any
  anchor matched.
  """
  def patch(content) do
    content
    |> add_dialyzer_config()
    |> add_tooling_deps()
    |> update_precommit_alias()
  end

  def add_dialyzer_config(content) do
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

        # Phoenix 1.7 shape: `deps: deps()` is the last project/0 entry, no
        # trailing comma — so the injected block must not end with one either.
        String.contains?(content, "deps: deps()") ->
          String.replace(
            content,
            "deps: deps()",
            "deps: deps(),\n#{String.trim_trailing(@dialyzer_config, ",")}",
            global: false
          )

        true ->
          content
      end
    end
  end

  def add_tooling_deps(content) do
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

  def update_precommit_alias(content) do
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

  @doc "Human-readable instructions for when auto-patching finds no anchors."
  def manual_instructions do
    """

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
    #{Enum.map_join(@precommit_steps, ",\n", &"          #{inspect(&1)}")}
        ]

    ─────────────────────────────────────────────────────────────────────────
    """
  end
end
