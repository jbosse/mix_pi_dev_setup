/**
 * Verification gate (Gate 4 in ORCHESTRATION.md).
 *
 * These are the deterministic `*` steps the Orchestrator never performs
 * itself. Sequential (fail-fast) so a red test doesn't get masked by a
 * later typecheck error.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export interface VerifyStep {
	name: string;
	cmd: string;
	args: string[];
}

export interface VerifyStepResult {
	name: string;
	exitCode: number;
	stdoutTail: string;
	stderrTail: string;
}

export interface VerifyResult {
	ok: boolean;
	steps: VerifyStepResult[];
	failedStep?: string;
}

// Default verification steps from ORCHESTRATION.md "Verification steps"
// section. Overridable via the tool call so sprints with a different
// toolchain can swap in their own list without forking the extension.
//
// StaffForecast (Phoenix / Elixir) pipeline — keep in sync with
// /docs/styleguide.md § Verification Gate.
export const DEFAULT_STEPS: VerifyStep[] = [
	{ name: "deps", cmd: "mix", args: ["deps.get", "--check-locked"] },
	{ name: "compile", cmd: "mix", args: ["compile", "--warnings-as-errors"] },
	{ name: "format", cmd: "mix", args: ["format", "--check-formatted"] },
	{ name: "credo", cmd: "mix", args: ["credo", "--strict"] },
	{ name: "sobelow", cmd: "mix", args: ["sobelow", "--config"] },
	{ name: "ecto-migrate", cmd: "mix", args: ["do", "ecto.create,", "ecto.migrate"] },
	{ name: "dialyzer", cmd: "mix", args: ["dialyzer"] },
	{ name: "test", cmd: "mix", args: ["test", "--warnings-as-errors"] },
	{ name: "assets", cmd: "mix", args: ["assets.build"] },
];

// Keep only the tail — full output gets dumped to the per-task log elsewhere.
// Avoids bloating the state file or the model's context.
function tail(s: string, lines = 40): string {
	const arr = s.split("\n");
	return arr.slice(Math.max(0, arr.length - lines)).join("\n");
}

export async function runVerify(
	pi: ExtensionAPI,
	steps: VerifyStep[] = DEFAULT_STEPS,
): Promise<VerifyResult> {
	const results: VerifyStepResult[] = [];
	for (const step of steps) {
		const { stdout, stderr, code } = await pi.exec(step.cmd, step.args, { timeout: 10 * 60 * 1000 });
		const result: VerifyStepResult = {
			name: step.name,
			exitCode: code ?? -1,
			stdoutTail: tail(stdout),
			stderrTail: tail(stderr),
		};
		results.push(result);
		if (result.exitCode !== 0) {
			console.error(`[sprint] verify step "${step.name}" failed with exit ${result.exitCode}`);
			return { ok: false, steps: results, failedStep: step.name };
		}
	}
	return { ok: true, steps: results };
}
