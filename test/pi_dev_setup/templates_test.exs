defmodule PiDevSetup.TemplatesTest do
  use ExUnit.Case, async: true

  alias PiDevSetup.Templates

  test "substitutions render all placeholder tokens" do
    subs = Templates.substitutions("my_shop", date: "2026-07-16")

    content = """
    defmodule __APP_WEB_MODULE__.PageController do
      alias __APP_MODULE__.Accounts
    end
    # lib/__APP_WEB_NAME__/ and lib/__APP_NAME__/
    # Recorded: __GENERATED_DATE__
    """

    rendered = Templates.apply_substitutions(content, subs)

    assert rendered =~ "MyShopWeb.PageController"
    assert rendered =~ "alias MyShop.Accounts"
    assert rendered =~ "lib/my_shop_web/ and lib/my_shop/"
    assert rendered =~ "Recorded: 2026-07-16"
    refute rendered =~ "__APP_"
    refute rendered =~ "__GENERATED_DATE__"
  end

  test "file mappings are derived from disk and cover the known layout" do
    mappings = Map.new(Templates.file_mappings())

    # pi/ templates land under .pi/
    assert mappings["pi/skills/orchestrator/SKILL.md"] == ".pi/skills/orchestrator/SKILL.md"
    assert mappings["pi/extensions/sprint-orchestrator/index.ts"] ==
             ".pi/extensions/sprint-orchestrator/index.ts"

    # root configs gain their leading dot
    assert mappings["credo.exs"] == ".credo.exs"
    assert mappings["dialyzer_ignore.exs"] == ".dialyzer_ignore.exs"
    assert mappings["sobelow-conf"] == ".sobelow-conf"

    # everything else maps 1:1
    assert mappings["SPEC.md"] == "SPEC.md"
    assert mappings["docs/ORCHESTRATION.md"] == "docs/ORCHESTRATION.md"
    assert mappings["spawn-agent"] == "spawn-agent"
  end

  test "updatable mappings include tooling but exclude user-owned files" do
    dests = Templates.updatable_file_mappings() |> Enum.map(&elem(&1, 1))

    assert ".pi/agents/builder.md" in dests
    assert ".pi/chains/task-gates.chain.md" in dests
    assert ".pi/skills/orchestrator/SKILL.md" in dests
    assert ".pi/extensions/sprint-orchestrator/guards.ts" in dests
    assert "spawn-agent" in dests
    assert "remove-agent" in dests

    refute ".pi/settings.json" in dests
    refute ".pi/README.md" in dests
    refute "SPEC.md" in dests
    refute Enum.any?(dests, &String.starts_with?(&1, "docs/"))
  end

  test "no template contains project-specific names instead of placeholder tokens" do
    for {template_rel, _dest} <- Templates.file_mappings() do
      content = File.read!(Path.join(Templates.template_dir(), template_rel))

      refute content =~ "StaffForecast", "#{template_rel} contains StaffForecast"
      refute content =~ "staff_forecast", "#{template_rel} contains staff_forecast"
    end
  end

  test "rendering leaves no unexpanded placeholder tokens in any template" do
    subs = Templates.substitutions("my_shop", date: "2026-07-16")

    for {template_rel, _dest} <- Templates.file_mappings() do
      rendered = Templates.render(template_rel, subs)

      refute rendered =~ "__APP_", "#{template_rel} has unexpanded __APP_ token"
      refute rendered =~ "__GENERATED_DATE__", "#{template_rel} has unexpanded date token"
    end
  end
end
