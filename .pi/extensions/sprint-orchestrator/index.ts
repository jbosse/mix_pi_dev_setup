/**
 * Sprint Orchestrator extension.
 *
 * Owns every deterministic step in ORCHESTRATION.md (the ones marked `*`).
 * Agents/skills call these tools to move state forward; they cannot mutate
 * sprint-state.json, git history, or the verification pipeline by any other
 * means (guards in ./guards.ts block the common side-doors).
 *
 * Design rule: no business judgement lives here. Every decision this module
 * makes is mechanical (legal transition? gate green? branch clean?). All
 * prose, design, code review etc. lives in skills.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { appendFileSync, existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Type } from "typebox";
import { commitLogsConsolidation, commitPlanning, commitTask, createPullRequest, currentBranch, mergeSprint, pushBranch, startSprintBranch } from "./git.js";
import { installBashGitGuard, installOwnershipGuard, installStartupGuard, readStateIfAny } from "./guards.js";
import { ensureSprintDirs, SPRINT_ROOT_REL, sprintPaths, taskLogPath, type SprintPaths } from "./paths.js";
import {
	appendPolishTask,
	findTask,
	loadState,
	maybeCompletePhase,
	readyToCommit,
	recordStrike,
	saveState,
	seedTasks,
	transition,
	type Gate,
	type SprintState,
	type TaskSeedInput,
} from "./state.js";
import { DEFAULT_STEPS, runVerify } from "./verify.js";

// A pi session only works on one sprint at a time. We cache its name so tools
// don't each have to rediscover it. `/sprint:new` and `/sprint:resume` set it.
// Persists across tool calls within a session; reset on shutdown.
let ACTIVE_SPRINT: string | undefined;

function requireActive(cwd: string): { state: SprintState; paths: SprintPaths } {
	if (!ACTIVE_SPRINT) throw new Error("no active sprint — call sprint_start or /sprint:resume first");
	const paths = sprintPaths(cwd, ACTIVE_SPRINT);
	const state = loadState(paths);
	if (!state) throw new Error(`sprint ${ACTIVE_SPRINT} has no state file at ${paths.state}`);
	return { state, paths };
}

function appendSprintLog(paths: SprintPaths, line: string): void {
	const ts = new Date().toISOString();
	appendFileSync(paths.sprintLog, `[${ts}] ${line}\n`);
}

// Exposed to guards so writes get constrained to the in-flight task's files.
// The guard itself does the per-path owner lookup — we only need to hand it
// the current sprint state and paths.
function getActiveSprint(ctx: ExtensionContext): { state: SprintState; paths: SprintPaths } | undefined {
	if (!ACTIVE_SPRINT) return undefined;
	const paths = sprintPaths(ctx.cwd, ACTIVE_SPRINT);
	const state = readStateIfAny(paths);
	if (!state) return undefined;
	return { state, paths };
}

/**
 * Read all *.log files from logsDir (sorted lexically — zero-padded attempt
 * numbers mean lexical ≈ chronological), write them as headed sections into
 * sprint-tasks.log, verify every section was written, delete individual
 * files from disk, and commit.
 *
 * Idempotent: returns early with no-op if logsDir is empty or missing.
 * Safe to call multiple times; the `commitLogsConsolidation` git helper
 * returns null (no commit) if nothing is staged on a second call.
 */
async function runConsolidateLogs(
	pi: ExtensionAPI,
	paths: SprintPaths,
	state: SprintState,
): Promise<{ message: string; sha: string | null; fileCount: number }> {
	if (!existsSync(paths.logsDir)) {
		return { message: "logs dir does not exist — nothing to consolidate", sha: null, fileCount: 0 };
	}

	const logFiles = readdirSync(paths.logsDir)
		.filter((f) => f.endsWith(".log"))
		.sort();

	if (logFiles.length === 0) {
		return { message: "no task log files found — already consolidated or no tasks ran", sha: null, fileCount: 0 };
	}

	// Build consolidated content: header + one labelled section per file.
	const sep = "─".repeat(80);
	const lines: string[] = [
		`# Sprint Task Logs — ${state.name}`,
		`# Consolidated ${logFiles.length} log file${logFiles.length === 1 ? "" : "s"} on ${new Date().toISOString()}`,
		"",
	];
	for (const file of logFiles) {
		const content = readFileSync(join(paths.logsDir, file), "utf8");
		lines.push(sep, `## ${file}`, sep, content.trimEnd(), "");
	}
	writeFileSync(paths.sprintTasksLog, lines.join("\n") + "\n");

	// Verify every file's section header landed in the output.
	const written = readFileSync(paths.sprintTasksLog, "utf8");
	const missing = logFiles.filter((f) => !written.includes(`## ${f}\n`));
	if (missing.length > 0) {
		throw new Error(`Consolidation verification failed — sections missing for: ${missing.join(", ")}`);
	}

	// Delete individual log files from disk. Git will see them as deletions
	// on the next `git add -A -- logsDir` in commitLogsConsolidation.
	for (const file of logFiles) {
		unlinkSync(join(paths.logsDir, file));
	}

	const logsDirRel = `${SPRINT_ROOT_REL}/${state.name}/logs`;
	const consolidatedLogRel = `${SPRINT_ROOT_REL}/${state.name}/sprint-tasks.log`;
	const sha = await commitLogsConsolidation(pi, { sprintName: state.name, logsDirRel, consolidatedLogRel });

	const plural = logFiles.length === 1 ? "" : "s";
	appendSprintLog(paths, `consolidated ${logFiles.length} task log${plural} → sprint-tasks.log${sha ? ` sha=${sha}` : " (no-op)"}`);

	const message = sha
		? `Consolidated ${logFiles.length} log file${plural} into sprint-tasks.log @ ${sha.slice(0, 7)}`
		: `sprint-tasks.log already up-to-date (nothing committed)`;
	return { message, sha, fileCount: logFiles.length };
}

export default function (pi: ExtensionAPI) {
	// --- guards (always on) -----------------------------------------------
	installStartupGuard(pi);
	installBashGitGuard(pi);
	installOwnershipGuard(pi, getActiveSprint);

	// --- footer widget ----------------------------------------------------
	// Keeps the human oriented without needing to run /sprint:status.
	pi.on("session_start", async (_event, ctx) => {
		const br = await currentBranch(pi).catch(() => "?");
		const m = br.match(/^sprint\/(.+)$/);
		if (m) {
			ACTIVE_SPRINT = m[1];
			const paths = sprintPaths(ctx.cwd, ACTIVE_SPRINT);
			const state = readStateIfAny(paths);
			if (state) {
				ctx.ui.setStatus("sprint", statusLine(state));
			}
		}
	});

	// --- tools -------------------------------------------------------------

	pi.registerTool({
		name: "sprint_start",
		label: "Sprint start",
		description:
			"Create sprint/{name} branch, scaffold /docs/sprint/{name}/, init sprint-state.json. " +
			"Requires interviewConfirmed=true — the planning interview MUST complete and receive human " +
			"confirmation before this tool is called. Refuses otherwise.",
		parameters: Type.Object({
			name: Type.String({ description: "Sprint name (kebab-case)" }),
			goal: Type.String({ description: "One-line sprint goal" }),
			interviewConfirmed: Type.Boolean({
				description:
					"MUST be true. Set only after /skill:planning-interview has run and the human confirmed the scope summary. " +
					"If you have not run the planning interview, you MUST do so before calling this tool.",
			}),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const name = params.name as string;
			const goal = params.goal as string;
			const confirmed = params.interviewConfirmed as boolean;
			if (!confirmed) {
				throw new Error(
					"sprint_start refused: interviewConfirmed is false. " +
					"You MUST run /skill:planning-interview and receive human confirmation of the scope summary before starting a sprint. " +
					"This is non-negotiable — see ORCHESTRATION.md § Planning Phase.",
				);
			}
			const paths = sprintPaths(ctx.cwd, name);
			ensureSprintDirs(paths);
			await startSprintBranch(pi, `sprint/${name}`);
			if (!existsSync(paths.state)) {
				const state: SprintState = {
					name,
					branch: `sprint/${name}`,
					phase: "planning",
					createdAt: new Date().toISOString(),
					tasks: [],
				};
				saveState(paths, state);
				writeFileSync(paths.sprintLog, `# Sprint: ${name}\nGoal: ${goal}\n`);
			}
			ACTIVE_SPRINT = name;
			appendSprintLog(paths, `sprint_start name=${name}`);
			return {
				content: [{
					type: "text",
					text:
						`Sprint ${name} ready on branch sprint/${name}. Phase: planning.\n\n` +
						`NEXT STEPS (in order — do NOT skip ahead to development):\n` +
						`1. subagent(product-owner, mode 1) → writes user-stories.md ONLY\n` +
						`2. ✋ STOP — read user-stories.md, show to human, wait for approval\n` +
						`3. subagent(product-owner, mode 2) → writes qa-script.md skeleton\n` +
						`4. subagent(architect) → writes architecture.md + reviewer-checklist.md\n` +
						`5. subagent(tester-planning) → writes test stubs + qa-script.md edges\n` +
						`6. subagent(pm) → assembles planning-summary.md\n` +
						`7. ✋ STOP — show planning-summary.md to human for approval\n` +
						`8. Human runs /sprint:approve-planning\n` +
						`9. subagent(pm) → writes spec.md + plan.md + calls sprint_tasks_seed\n` +
						`10. ONLY THEN does development begin.\n\n` +
						`Do step 1 now: spawn subagent(product-owner) in mode 1 (user stories only, NOT qa-script).`,
				}],
				details: {},
			};
		},
	});

	pi.registerTool({
		name: "sprint_state_get",
		label: "Sprint state get",
		description: "Read the current sprint-state.json. Source of truth for all restart decisions.",
		parameters: Type.Object({}),
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			const { state } = requireActive(ctx.cwd);
			return { content: [{ type: "text", text: JSON.stringify(state, null, 2) }], details: state };
		},
	});

	pi.registerTool({
		name: "sprint_tasks_seed",
		label: "Sprint tasks seed",
		description:
			"PM-time: seed tasks from plan.md into sprint-state.json and flip phase planning-approved -> development. " +
			"Tasks run strictly in list order, one at a time — no waves, no parallelism. " +
			"Validates unique IDs only. Refuses if phase is not planning-approved so it cannot clobber an in-flight sprint.",
		parameters: Type.Object({
			tasks: Type.Array(
				Type.Object({
					id: Type.String({ description: 'e.g. "task-01"' }),
					title: Type.String(),
					story: Type.String({ description: 'User story reference, e.g. "Story 2 AC 1"' }),
					files: Type.Array(Type.String(), {
						description:
							'Declared file ownership for this task. Per-task scope discipline (not wave contention) — Builder writes outside this list are refused. Entries may be exact paths ("lib/foo.ex") or directory prefixes with trailing slash ("priv/repo/migrations/").',
					}),
				}),
			),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const { state, paths } = requireActive(ctx.cwd);
			if (state.phase !== "planning-approved") {
				throw new Error(`cannot seed tasks: phase is ${state.phase}, expected planning-approved`);
			}
			const tasks = params.tasks as TaskSeedInput[];
			const count = seedTasks(state, tasks);
			saveState(paths, state);
			appendSprintLog(paths, `seeded ${count} tasks; phase -> development`);
			return {
				content: [
					{
						type: "text",
						text:
							`Seeded ${count} tasks. Phase -> development.\n\n` +
							`DEV LOOP: Run tasks in plan.md order, ONE at a time, sequentially.\n` +
							`For each task:\n` +
							`  1. task_log_append(taskId, "orchestrator", 1, "assigned")\n` +
							`  2. subagent({ chain: "task-gates", task: taskId })\n` +
							`  3. verify_run\n` +
							`  4. commit_task(taskId)\n` +
							`  5. Move to next task\n\n` +
							`Start with the first task in plan.md now.`,
					},
				],
				details: { taskCount: count },
			};
		},
	});

	pi.registerTool({
		name: "polish_task_append",
		label: "Polish task append",
		description:
			"Final-review-time: append a single polish-{n} task to plan.md-style state. Flips phase final-review -> development " +
			"for the duration; commit_task restores final-review once all polish tasks are done. " +
			"Refuses outside final-review (or an already-running polish phase). Unique id check only.",
		parameters: Type.Object({
			id: Type.String({ description: 'e.g. "polish-1"' }),
			title: Type.String(),
			story: Type.String({ description: "Reference the original story or architect finding" }),
			files: Type.Array(Type.String(), {
				description: "Declared file ownership for the polish task — same rules as sprint_tasks_seed.",
			}),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const { state, paths } = requireActive(ctx.cwd);
			const prev = state.phase;
			appendPolishTask(state, {
				id: params.id as string,
				title: params.title as string,
				story: params.story as string,
				files: params.files as string[],
			});
			saveState(paths, state);
			appendSprintLog(
				paths,
				`polish_task_append ${params.id as string}${prev !== state.phase ? ` (phase ${prev} -> ${state.phase})` : ""}`,
			);
			return {
				content: [{ type: "text", text: `Appended ${params.id as string}. Phase is now ${state.phase}.` }],
				details: {},
			};
		},
	});

	pi.registerTool({
		name: "sprint_state_transition",
		label: "Sprint state transition",
		description:
			"Advance a task to the next gate after a PASS. Refuses illegal transitions. " +
			"Refuses if phase is not 'development' — tasks cannot be advanced until the plan is approved and seeded.",
		parameters: Type.Object({
			taskId: Type.String(),
			to: Type.String({ description: "Target gate: tester|reviewer|security|verify|commit|done" }),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const { state, paths } = requireActive(ctx.cwd);
			if (state.phase !== "development") {
				throw new Error(
					`sprint_state_transition refused: phase is '${state.phase}', expected 'development'. ` +
					`Tasks cannot run until the plan is approved (/sprint:approve-planning) and seeded (sprint_tasks_seed).`,
				);
			}
			const task = findTask(state, params.taskId as string);
			transition(task, params.to as Gate);
			saveState(paths, state);
			appendSprintLog(paths, `transition ${task.id} -> ${task.gate}`);
			return { content: [{ type: "text", text: `${task.id} -> ${task.gate}` }], details: {} };
		},
	});

	pi.registerTool({
		name: "task_log_append",
		label: "Task log append",
		description: "Append a timestamped line to the per-task log. Use for every significant agent step.",
		parameters: Type.Object({
			taskId: Type.String(),
			agent: Type.String({ description: "orchestrator|po|architect|pm|tester|builder|reviewer|security" }),
			attempt: Type.Number(),
			line: Type.String(),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const { paths } = requireActive(ctx.cwd);
			const file = taskLogPath(paths, params.taskId as string, params.agent as string, params.attempt as number);
			appendFileSync(file, `[${new Date().toISOString()}] ${params.line as string}\n`);
			return { content: [{ type: "text", text: `logged to ${file}` }], details: {} };
		},
	});

	pi.registerTool({
		name: "strike_record",
		label: "Strike record",
		description: "Record a gate failure against a task. Halts sprint on strike 4. Task restarts from builder.",
		parameters: Type.Object({
			taskId: Type.String(),
			gate: Type.String({ description: "tester|reviewer|security|verify" }),
			reason: Type.String(),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const { state, paths } = requireActive(ctx.cwd);
			const task = findTask(state, params.taskId as string);
			const strikes = recordStrike(task, params.gate as Gate, params.reason as string);
			let halted = false;
			if (strikes >= 4) {
				state.halted = {
					reason: `task ${task.id} reached strike 4 at gate ${params.gate}: ${params.reason}`,
					at: new Date().toISOString(),
				};
				halted = true;
				console.error(`[sprint] HALT: ${state.halted.reason}`);
			}
			saveState(paths, state);
			appendSprintLog(paths, `strike ${strikes} ${task.id} gate=${params.gate}${halted ? " HALTED" : ""}`);
			return {
				content: [
					{
						type: "text",
						text: halted
							? `STRIKE 4 — SPRINT HALTED. Surface to human with logs + diff.`
							: strikes === 3
								? `STRIKE 3 — pull in architect before builder retry.`
								: `Strike ${strikes}/4 on ${task.id}. Restart from builder.`,
					},
				],
				details: { strikes, halted },
			};
		},
	});

	pi.registerTool({
		name: "verify_run",
		label: "Verify run",
		description:
			"Runs the deterministic verification pipeline (install/build/test/lint/types). Gate 4 — nothing commits until this is green.",
		parameters: Type.Object({}),
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			const { state, paths } = requireActive(ctx.cwd);
			const result = await runVerify(pi, DEFAULT_STEPS);
			appendSprintLog(
				paths,
				`verify ${result.ok ? "PASS" : `FAIL@${result.failedStep}`} (${result.steps.length} steps)`,
			);
			// We don't mutate state here — the caller (skill/orchestrator) decides
			// whether to transition forward or record a strike. Keeps verify pure.
			void state;
			return {
				content: [
					{
						type: "text",
						text: result.ok
							? `✅ verify green (${result.steps.map((s) => s.name).join(", ")})`
							: `❌ verify failed at "${result.failedStep}"`,
					},
				],
				details: result,
				isError: !result.ok,
			};
		},
	});

	pi.registerTool({
		name: "commit_task",
		label: "Commit task",
		description:
			"Authors the single commit for a task. Refuses unless every gate is green. Uses the ORCHESTRATION.md message format.",
		parameters: Type.Object({
			taskId: Type.String(),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const { state, paths } = requireActive(ctx.cwd);
			const task = findTask(state, params.taskId as string);
			if (!readyToCommit(task)) {
				console.error(`[sprint] commit_task refused: ${task.id} gates not all green`);
				throw new Error(`task ${task.id} is not ready to commit — gates: ${JSON.stringify(task.gates)}`);
			}
			const gateSummary = `Builder: ✅  Tester: ✅  Reviewer: ✅  Security: ✅  Verify: ✅`;
			const sha = await commitTask(pi, {
				sprintName: state.name,
				sprintRootRel: `${SPRINT_ROOT_REL}/${state.name}`,
				taskId: task.id,
				title: task.title,
				storyRef: task.story,
				gateSummary,
				files: task.files,
			});
			task.commitSha = sha;
			transition(task, "done");
			const phaseChange = maybeCompletePhase(state);
			saveState(paths, state);
			appendSprintLog(paths, `commit ${task.id} sha=${sha}`);
			if (phaseChange.restoredToFinalReview) {
				appendSprintLog(paths, `polish run complete; phase -> final-review`);
			}
			if (phaseChange.phaseFlipped) {
				appendSprintLog(paths, `all tasks done; phase -> final-review`);
			}
			return { content: [{ type: "text", text: `committed ${task.id} @ ${sha}` }], details: { sha } };
		},
	});

	pi.registerTool({
		name: "consolidate_logs",
		label: "Consolidate task logs",
		description:
			"Merge all per-task log files in logs/ into a single sprint-tasks.log, verify each file was written, " +
			"delete the individual files, and commit. Called automatically by /sprint:approve-close; " +
			"also available as a standalone tool. Idempotent: returns early if logsDir is already empty.",
		parameters: Type.Object({}),
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			const { state, paths } = requireActive(ctx.cwd);
			const result = await runConsolidateLogs(pi, paths, state);
			return {
				content: [{ type: "text", text: result.message }],
				details: { fileCount: result.fileCount, sha: result.sha },
			};
		},
	});

	pi.registerTool({
		name: "sprint_merge",
		label: "Sprint merge",
		description:
			"Close the sprint locally: merge sprint/{name} into main with --no-ff. Refuses if phase != final-review or working tree dirty. Prefer /sprint:approve-close (creates a GitHub PR) unless no remote is configured.",
		parameters: Type.Object({}),
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			const { state, paths } = requireActive(ctx.cwd);
			if (state.phase !== "final-review") {
				throw new Error(`cannot merge: phase is ${state.phase}, expected final-review`);
			}
			// Commit phase=closed to the sprint branch before merging,
			// so the sprint artifacts are complete in the branch history.
			state.phase = "closed";
			saveState(paths, state);
			const { stdout: addOut, code: addCode, stderr: addErr } = await pi.exec("git", ["add", "--", `${SPRINT_ROOT_REL}/${state.name}`]);
			void addOut;
			if (addCode !== 0) throw new Error(`git add sprint artifacts failed: ${addErr}`);
			const diffResult = await pi.exec("git", ["diff", "--cached", "--quiet"]);
			if (diffResult.code !== 0) {
				const closeCommit = await pi.exec("git", ["commit", "-m", "close: finalize sprint-state.json (phase=closed)"]);
				if (closeCommit.code !== 0) throw new Error(`close commit failed: ${closeCommit.stderr}`);
			}
			const sha = await mergeSprint(pi, state.branch);
			return { content: [{ type: "text", text: `merged ${state.branch} → main @ ${sha}` }], details: { sha } };
		},
	});

	// --- commands ----------------------------------------------------------

	pi.registerCommand("sprint:status", {
		description: "Show sprint state summary",
		handler: async (_args, ctx) => {
			try {
				const { state } = requireActive(ctx.cwd);
				ctx.ui.notify(statusLine(state), "info");
			} catch (err) {
				ctx.ui.notify(`${(err as Error).message}`, "warning");
			}
		},
	});

	pi.registerCommand("sprint:resume", {
		description: "Resume the sprint on the current branch (reads sprint-state.json)",
		handler: async (_args, ctx) => {
			const br = await currentBranch(pi).catch(() => "");
			const m = br.match(/^sprint\/(.+)$/);
			if (!m) {
				ctx.ui.notify(`Not on a sprint branch (currently ${br}).`, "error");
				return;
			}
			ACTIVE_SPRINT = m[1];
			const { state } = requireActive(ctx.cwd);
			ctx.ui.notify(`Resumed sprint ${state.name} (phase=${state.phase})`, "info");
		},
	});

	pi.registerCommand("sprint:approve-planning", {
		description:
			"Human approval gate: runs mix precommit against the planning tree, auto-commits planning artifacts, flips phase -> planning-approved. Refuses if verify fails.",
		handler: async (_args, ctx) => {
			const { state, paths } = requireActive(ctx.cwd);
			if (state.phase !== "planning") {
				ctx.ui.notify(`cannot approve planning: phase is ${state.phase}`, "error");
				return;
			}

			ctx.ui.notify("Running verify against the planning tree…", "info");
			const result = await runVerify(pi, DEFAULT_STEPS);
			if (!result.ok) {
				appendSprintLog(
					paths,
					`approve-planning BLOCKED: verify failed @ ${result.failedStep}`,
				);
				ctx.ui.notify(
					`Approval BLOCKED: verify failed at "${result.failedStep}". Fix the planning artifacts and re-run /sprint:approve-planning.`,
					"error",
				);
				return;
			}

			state.phase = "planning-approved";
			saveState(paths, state);

			const goal = readSprintGoal(paths.sprintLog);
			const sha = await commitPlanning(pi, { sprintName: state.name, goal });

			appendSprintLog(
				paths,
				`human approved planning; verify green; planning commit ${sha ?? "(no diff)"}`,
			);
			ctx.ui.notify(
				sha
					? `Planning approved. Committed planning artifacts @ ${sha.slice(0, 7)}.\n` +
					  `NEXT: subagent(pm) to write spec.md + plan.md and call sprint_tasks_seed.\n\n` +
					  `👉 Reply "continue" to the orchestrator to proceed.`
					: `Planning approved. (Nothing to commit.)\n` +
					  `NEXT: subagent(pm) to write spec.md + plan.md and call sprint_tasks_seed.\n\n` +
					  `👉 Reply "continue" to the orchestrator to proceed.`,
				"info",
			);
		},
	});

	pi.registerCommand("sprint:approve-close", {
		description:
			"Human approval gate. Default: pushes the sprint branch to origin and opens a GitHub PR via `gh`. " +
			"Pass --local to merge directly into main without a remote (no origin required).",
		handler: async (args, ctx) => {
			const isLocal = typeof args === "string" && args.trim().toLowerCase() === "--local";
			const { state, paths } = requireActive(ctx.cwd);

			if (state.phase !== "final-review") {
				ctx.ui.notify(`Cannot close: phase is ${state.phase}, expected final-review.`, "error");
				return;
			}

			if (isLocal) {
				// --- Local merge path (no remote needed) ---
				// Consolidate task logs before sealing the branch — this ensures the
				// PR / merge diff shows sprint-tasks.log instead of N individual files.
				ctx.ui.notify("Consolidating task logs…", "info");
				const localConsolResult = await runConsolidateLogs(pi, paths, state);
				ctx.ui.notify(localConsolResult.message, "info");

				ctx.ui.notify("Merging sprint branch into main locally…", "info");
				// Commit phase=closed to sprint branch before merging.
				state.phase = "closed";
				saveState(paths, state);
				const { code: ac, stderr: ae } = await pi.exec("git", ["add", "--", `${SPRINT_ROOT_REL}/${state.name}`]);
				if (ac !== 0) throw new Error(`git add failed: ${ae}`);
				const df = await pi.exec("git", ["diff", "--cached", "--quiet"]);
				if (df.code !== 0) {
					const cc = await pi.exec("git", ["commit", "-m", "close: finalize sprint-state.json (phase=closed)"]);
					if (cc.code !== 0) throw new Error(`close commit failed: ${cc.stderr}`);
				}
				const sha = await mergeSprint(pi, state.branch);
				ctx.ui.notify(`Sprint closed. Merged ${state.branch} → main @ ${sha.slice(0, 7)}.`, "info");
				return;
			}

			// --- PR path (default) ---
			// Consolidate task logs before sealing the branch so the PR diff is clean.
			ctx.ui.notify("Consolidating task logs…", "info");
			const prConsolResult = await runConsolidateLogs(pi, paths, state);
			ctx.ui.notify(prConsolResult.message, "info");

			// Check gh is available
			const ghCheck = await pi.exec("gh", ["--version"]);
			if (ghCheck.code !== 0) {
				ctx.ui.notify(
					"`gh` CLI not found. Install it (https://cli.github.com) or use /sprint:approve-close --local.",
					"error",
				);
				return;
			}

			// Commit phase=closed to sprint branch before pushing/PR.
			state.phase = "closed";
			saveState(paths, state);
			const { code: pac, stderr: pae } = await pi.exec("git", ["add", "--", `${SPRINT_ROOT_REL}/${state.name}`]);
			if (pac !== 0) throw new Error(`git add failed: ${pae}`);
			const pdf = await pi.exec("git", ["diff", "--cached", "--quiet"]);
			if (pdf.code !== 0) {
				const pcc = await pi.exec("git", ["commit", "-m", "close: finalize sprint-state.json (phase=closed)"]);
				if (pcc.code !== 0) throw new Error(`close commit failed: ${pcc.stderr}`);
			}
			ctx.ui.notify(`Pushing ${state.branch} to origin…`, "info");
			await pushBranch(pi, state.branch);

			const goal = readSprintGoal(paths.sprintLog);
			const sprintNum = state.name.match(/^(\d+)/)?.[1] ?? state.name;
			const prTitle = `${sprintNum} - ${goal}`;

			const taskLines = state.tasks
				.filter((t) => t.gate === "done")
				.map((t) => `- **${t.id}**: ${t.title}`)
				.join("\n");

			const prBody =
				`## Sprint: ${state.name}\n\n` +
				`**Goal:** ${goal}\n\n` +
				`### Tasks (${state.tasks.filter((t) => t.gate === "done").length}/${state.tasks.length} completed)\n\n` +
				`${taskLines}\n\n` +
				`### Verification\n\n` +
				`All gates green: Builder ✅ Tester ✅ Reviewer ✅ Security ✅ Verify ✅\n\n` +
				`Sprint artifacts: \`docs/sprint/${state.name}/\``;

			ctx.ui.notify("Creating GitHub PR…", "info");
			const prUrl = await createPullRequest(pi, {
				title: prTitle,
				body: prBody,
				base: "main",
				branch: state.branch,
			});

			ctx.ui.notify(`PR created: ${prUrl}`, "info");
		},
	});

	pi.registerCommand("sprint:halt", {
		description: "Manually halt the sprint (equivalent to strike 4)",
		handler: async (args, ctx) => {
			const { state, paths } = requireActive(ctx.cwd);
			state.halted = { reason: args || "manual halt", at: new Date().toISOString() };
			saveState(paths, state);
			appendSprintLog(paths, `manual HALT: ${state.halted.reason}`);
			console.error(`[sprint] HALT: ${state.halted.reason}`);
			ctx.ui.notify(`Sprint halted: ${state.halted.reason}`, "error");
		},
	});
}


// Extract the sprint goal from the first "Goal:" line of sprint.log. The log
// is the one-line-per-event narrative seeded at sprint_start with the goal
// the user supplied during the planning interview.
function readSprintGoal(sprintLog: string): string {
	try {
		const content = readFileSync(sprintLog, "utf8");
		const m = content.match(/^Goal:\s*(.+)$/m);
		return m ? m[1].trim() : "(goal not recorded)";
	} catch {
		return "(sprint.log unreadable)";
	}
}

function statusLine(state: SprintState): string {
	const parts = [
		`sprint/${state.name}`,
		state.phase,
		`${state.tasks.filter((t) => t.gate === "done").length}/${state.tasks.length} done`,
	];
	if (state.polishReturnPhase) parts.push("polish");
	if (state.halted) parts.push(`⛔ HALTED`);
	return parts.filter(Boolean).join(" · ");
}
