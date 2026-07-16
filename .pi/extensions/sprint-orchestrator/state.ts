/**
 * Sprint state machine.
 *
 * `sprint-state.json` is the single source of truth for restart — per
 * ORCHESTRATION.md we never reconstruct state by log-parsing. Every mutation
 * goes through `transition()` so illegal transitions are refused loudly
 * (no silent failure — see CLAUDE.md).
 */

import { readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import type { SprintPaths } from "./paths.js";

// Gates mirror ORCHESTRATION.md's per-task sequence exactly. `done` is a
// terminal state. `halted` is reserved for strike-4 sprint halts.
export type Gate = "builder" | "tester" | "reviewer" | "security" | "verify" | "commit" | "done";

export type GateResult = "pending" | "pass" | "fail";

export interface Strike {
	attempt: number;
	gate: Gate;
	reason: string;
	timestamp: string;
}

export interface TaskState {
	id: string; // e.g. "task-3" or "polish-1"
	title: string;
	story: string; // user story reference, e.g. "Story 2 AC 1"
	files: string[]; // declared file ownership — enforced at builder write time (scope, not contention)
	gate: Gate;
	attempts: number; // 4-strike any-kind counter
	strikes: Strike[];
	gates: Partial<Record<Gate, GateResult>>;
	startedAt?: string;
	completedAt?: string;
	commitSha?: string;
}

export type Phase =
	| "planning"
	| "planning-approved" // human signed planning-summary.md
	| "development"
	| "final-review"
	| "closed";

export interface SprintState {
	name: string;
	branch: string; // sprint/{name}
	phase: Phase;
	createdAt: string;
	caseNumber?: string; // optional case/ticket number, e.g. "64123"
	tasks: TaskState[];
	halted?: { reason: string; at: string; source?: "strike-4" | "manual" };
	// When a polish task is appended during final-review, we remember the phase
	// we came from so we can flip back once the polish task is committed.
	polishReturnPhase?: Phase;
}

// The forward gate sequence per ORCHESTRATION.md. `gate_pass` advances along
// this list mechanically — agents report which gate they ran, never where to
// go next, so a task can't be routed around a gate.
export const GATE_SEQUENCE: Gate[] = ["builder", "tester", "reviewer", "security", "verify", "commit", "done"];

/** The gate that follows `gate` in the forward sequence. Throws on `done`. */
export function nextGate(gate: Gate): Gate {
	const i = GATE_SEQUENCE.indexOf(gate);
	if (i < 0 || i === GATE_SEQUENCE.length - 1) {
		throw new Error(`no next gate after ${gate}`);
	}
	return GATE_SEQUENCE[i + 1];
}

// Legal gate transitions per ORCHESTRATION.md. Any edge not here is refused.
// Restart-from-scratch (any gate -> builder) is allowed so retries wipe partial
// work, matching "In-flight tasks on crash: always restart from scratch".
const LEGAL_EDGES: Record<Gate, Gate[]> = {
	builder: ["tester", "builder"],
	tester: ["reviewer", "builder"],
	reviewer: ["security", "builder"],
	security: ["verify", "builder"],
	verify: ["commit", "builder"],
	commit: ["done", "builder"],
	done: [], // terminal
};

export function loadState(paths: SprintPaths): SprintState | undefined {
	if (!existsSync(paths.state)) return undefined;
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(paths.state, "utf8"));
	} catch (err) {
		// Corrupt state file is a hard failure — refusing to silently recreate it
		// would hide data loss. Surface with a clear error per CLAUDE.md.
		console.error(`[sprint] failed to parse ${paths.state}:`, err);
		throw new Error(`Corrupt sprint-state.json at ${paths.state}. Repair or delete manually.`);
	}
	return migrateLegacyState(raw as Record<string, unknown>);
}

/**
 * Soft-migrate legacy state shapes. Historically we had `wave` per task and
 * `currentWave` on the root (the wave-dispatch model). The single-process
 * rework drops both. We strip them silently on load so historical sprint
 * dirs (phase=closed) stay readable without manual cleanup.
 */
function migrateLegacyState(raw: Record<string, unknown>): SprintState {
	const input = raw as unknown as SprintState & { currentWave?: number };
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { currentWave: _cw, ...rest } = input;
	const tasks = Array.isArray(rest.tasks)
		? rest.tasks.map((t) => {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { wave: _w, ...taskRest } = t as TaskState & { wave?: number };
				return taskRest as TaskState;
			})
		: [];
	return { ...rest, tasks } as SprintState;
}

export function saveState(paths: SprintPaths, state: SprintState): void {
	// Pretty-print so the file is diffable in git — the audit trail matters.
	// Write to a temp file and rename: rename is atomic on POSIX, so a crash
	// mid-write can never leave a truncated/corrupt sprint-state.json behind
	// (loadState hard-fails on corrupt state by design).
	const tmp = `${paths.state}.tmp`;
	writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
	renameSync(tmp, paths.state);
}

export function findTask(state: SprintState, taskId: string): TaskState {
	const task = state.tasks.find((t) => t.id === taskId);
	if (!task) throw new Error(`task not found: ${taskId}`);
	return task;
}

/**
 * Move a task from its current gate to `target`. Used on gate PASS.
 * Refuses illegal edges with a loud error so a skill can't route a task
 * around a gate by accident.
 */
export function transition(task: TaskState, target: Gate, result: GateResult = "pass"): void {
	const legal = LEGAL_EDGES[task.gate];
	if (!legal.includes(target)) {
		throw new Error(`illegal transition ${task.gate} -> ${target} for ${task.id}`);
	}
	task.gates[task.gate] = result;
	task.gate = target;
	if (target === "done") task.completedAt = new Date().toISOString();
}

/**
 * Record a gate failure. Any-kind counter per ORCHESTRATION.md:
 * strike 1–2 retry, strike 3 escalate to architect, strike 4 halt the sprint.
 * Returns the resulting strike number so the caller can react.
 */
export function recordStrike(task: TaskState, gate: Gate, reason: string): number {
	task.attempts += 1;
	task.strikes.push({
		attempt: task.attempts,
		gate,
		reason,
		timestamp: new Date().toISOString(),
	});
	task.gates[gate] = "fail";
	// On any failure the task restarts from scratch at the builder gate.
	// This is the "partial recovery is where crap code lives" rule.
	task.gate = "builder";
	return task.attempts;
}

/**
 * commit_task is only legal if every prior gate passed on the current attempt.
 * Encodes the invariant "commit only on all-green" in one place.
 */
export interface TaskSeedInput {
	id: string;
	title: string;
	story: string;
	files: string[];
}

export function validateTaskSeed(tasks: TaskSeedInput[]): void {
	if (!tasks || tasks.length === 0) throw new Error("no tasks to seed");
	const ids = new Set<string>();
	for (const t of tasks) {
		if (!t.id) throw new Error("task missing id");
		if (ids.has(t.id)) throw new Error(`duplicate task id: ${t.id}`);
		ids.add(t.id);
		if (!t.title) throw new Error(`task ${t.id} missing title`);
		if (!t.story) throw new Error(`task ${t.id} missing story reference`);
		if (!Array.isArray(t.files) || t.files.length === 0) {
			throw new Error(`task ${t.id} declares no files`);
		}
	}
}

export function seedTasks(state: SprintState, inputs: TaskSeedInput[]): number {
	validateTaskSeed(inputs);
	state.tasks = inputs.map((t) => ({
		id: t.id,
		title: t.title,
		story: t.story,
		files: t.files,
		gate: "builder" as Gate,
		attempts: 0,
		strikes: [],
		gates: {},
	}));
	state.phase = "development";
	return state.tasks.length;
}

/**
 * Append a single polish task during final-review. The polish task runs
 * through the full gate chain like any other task. Phase flips back to
 * `development` for the duration so normal state transitions are legal,
 * and we remember the pre-polish phase so commit_task can restore it
 * once all polish tasks are done.
 */
export function appendPolishTask(state: SprintState, input: TaskSeedInput): void {
	if (state.phase !== "final-review" && state.phase !== "development") {
		throw new Error(
			`cannot append polish task: phase is ${state.phase}, expected final-review (or development during an existing polish run)`,
		);
	}
	if (state.tasks.some((t) => t.id === input.id)) {
		throw new Error(`duplicate task id: ${input.id}`);
	}
	if (!input.title) throw new Error(`task ${input.id} missing title`);
	if (!input.story) throw new Error(`task ${input.id} missing story reference`);
	if (!Array.isArray(input.files) || input.files.length === 0) {
		throw new Error(`task ${input.id} declares no files`);
	}
	state.tasks.push({
		id: input.id,
		title: input.title,
		story: input.story,
		files: input.files,
		gate: "builder",
		attempts: 0,
		strikes: [],
		gates: {},
	});
	if (state.phase === "final-review") {
		state.polishReturnPhase = "final-review";
		state.phase = "development";
	}
}

/**
 * After a task transitions to `done`, check whether every task is done.
 * When yes:
 *   - If we're in a polish run (phase flipped by appendPolishTask), restore
 *     `final-review` so the human can keep triaging.
 *   - Otherwise flip `development` → `final-review` for the architect handoff.
 *
 * Idempotent. Single-process flow means there are no waves to advance.
 */
export function maybeCompletePhase(state: SprintState): {
	phaseFlipped?: boolean;
	restoredToFinalReview?: boolean;
} {
	if (state.phase !== "development") return {};
	const pending = state.tasks.some((t) => t.gate !== "done");
	if (pending) return {};

	if (state.polishReturnPhase === "final-review") {
		state.phase = "final-review";
		state.polishReturnPhase = undefined;
		return { restoredToFinalReview: true };
	}
	state.phase = "final-review";
	return { phaseFlipped: true };
}

export function readyToCommit(task: TaskState): boolean {
	return (
		task.gate === "commit" &&
		task.gates.builder !== "fail" &&
		task.gates.tester === "pass" &&
		task.gates.reviewer === "pass" &&
		task.gates.security === "pass" &&
		task.gates.verify === "pass"
	);
}
