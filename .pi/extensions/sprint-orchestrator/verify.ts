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
	timeoutMs?: number;
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

// The verification gate is `mix precommit` — the alias that `mix pi_dev_setup`
// writes into the project's mix.exs (deps.get → compile → format → credo →
// sobelow → ecto → dialyzer → test → assets). Running the alias, instead of
// duplicating its steps here, keeps a single source of truth: customize the
// pipeline by editing the `precommit:` alias in mix.exs and both the human
// gate and this tool pick it up.
//
// Generous timeout: the first dialyzer run builds the PLT from scratch, which
// on a real Phoenix app routinely takes longer than 10 minutes.
export const DEFAULT_STEPS: VerifyStep[] = [
	{ name: "precommit", cmd: "mix", args: ["precommit"], timeoutMs: 30 * 60 * 1000 },
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
		const { stdout, stderr, code } = await pi.exec(step.cmd, step.args, { timeout: step.timeoutMs ?? 10 * 60 * 1000 });
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
