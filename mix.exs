defmodule PiDevSetup.MixProject do
  use Mix.Project

  def project do
    [
      app: :pi_dev_setup,
      version: "0.1.0",
      elixir: "~> 1.15",
      deps: [],
      description: "Mix generator that adds Pi.dev AI sprint tooling to a Phoenix project",
      package: [
        licenses: ["MIT"],
        links: %{}
      ]
    ]
  end
end
