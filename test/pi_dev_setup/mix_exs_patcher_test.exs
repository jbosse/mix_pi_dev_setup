defmodule PiDevSetup.MixExsPatcherTest do
  use ExUnit.Case, async: true

  alias PiDevSetup.MixExsPatcher

  # Shape of a freshly generated Phoenix 1.8 mix.exs (the parts we patch).
  @phoenix_1_8 """
  defmodule MyShop.MixProject do
    use Mix.Project

    def project do
      [
        app: :my_shop,
        version: "0.1.0",
        elixir: "~> 1.15",
        elixirc_paths: elixirc_paths(Mix.env()),
        start_permanent: Mix.env() == :prod,
        aliases: aliases(),
        deps: deps(),
        listeners: [Phoenix.CodeReloader]
      ]
    end

    defp deps do
      [
        {:phoenix, "~> 1.8.0"},
        {:phoenix_ecto, "~> 4.5"},
        {:ecto_sql, "~> 3.13"},
        {:bandit, "~> 1.5"}
      ]
    end

    defp aliases do
      [
        setup: ["deps.get", "ecto.setup"],
        precommit: ["compile --warning-as-errors", "deps.unlock --unused", "format", "test"]
      ]
    end
  end
  """

  test "adds dialyzer config after the listeners entry" do
    patched = MixExsPatcher.patch(@phoenix_1_8)

    assert patched =~ "listeners: [Phoenix.CodeReloader],"
    assert patched =~ ~s(plt_file: {:no_warn, "priv/plts/dialyzer.plt"})
    assert patched =~ "flags: [:error_handling, :unknown]"
  end

  test "falls back to the deps: deps() anchor when listeners is absent (Phoenix 1.7 shape)" do
    without_listeners = String.replace(@phoenix_1_8, ",\n      listeners: [Phoenix.CodeReloader]", "")
    patched = MixExsPatcher.patch(without_listeners)

    assert patched =~ "dialyzer: ["
    assert patched =~ "deps: deps(),\n"
    assert {:ok, _ast} = Code.string_to_quoted(patched)
  end

  test "adds the tooling deps after bandit" do
    patched = MixExsPatcher.patch(@phoenix_1_8)

    assert patched =~ ~s({:bandit, "~> 1.5"},)
    assert patched =~ ~s({:credo, "~> 1.7", only: [:dev, :test], runtime: false})
    assert patched =~ ~s({:dialyxir, "~> 1.4", only: [:dev, :test], runtime: false})
    assert patched =~ ~s({:sobelow, "~> 0.13", only: [:dev, :test], runtime: false})
    assert patched =~ ~s({:mox, "~> 1.1", only: :test})
  end

  test "expands the precommit alias to the full pipeline" do
    patched = MixExsPatcher.patch(@phoenix_1_8)

    for step <- MixExsPatcher.precommit_steps() do
      assert patched =~ inspect(step)
    end

    refute patched =~ "deps.unlock --unused"
  end

  test "patched output is still valid Elixir" do
    patched = MixExsPatcher.patch(@phoenix_1_8)
    assert {:ok, _ast} = Code.string_to_quoted(patched)
  end

  test "is idempotent — patching twice equals patching once" do
    once = MixExsPatcher.patch(@phoenix_1_8)
    assert MixExsPatcher.patch(once) == once
  end

  test "returns content unchanged when no anchors match" do
    unrecognized = """
    defmodule Odd.MixProject do
      use Mix.Project
      def project, do: [app: :odd, version: "0.1.0"]
    end
    """

    assert MixExsPatcher.patch(unrecognized) == unrecognized
  end

  test "leaves an existing dialyzer config alone" do
    with_dialyzer = String.replace(@phoenix_1_8, "deps: deps(),", "deps: deps(),\n      dialyzer: [flags: []],")
    patched = MixExsPatcher.add_dialyzer_config(with_dialyzer)
    assert patched == with_dialyzer
  end
end
