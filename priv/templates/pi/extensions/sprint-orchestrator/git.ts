/**
 * Git helpers for sprint lifecycle.
 *
 * All git mutations live here so we can reason about branch policy in one
 * spot. The extension's `bash` guard blocks ad-hoc `git commit|merge|push`
 * unless these helpers have set the `AUTHORIZED` flag for the duration of
 * one call — that's how we enforce "one commit per task, authored by tooling".
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// Module-level flag toggled by commitTask / mergeSprint. The `bash` tool_call
// guard reads it to decide whether to allow a git mutation originating from
// the model. Narrow window: set true, run, set false in `finally`.
let AUTHORIZED = false;

export function isGitAuthorized(): boolean {
	return AUTHORIZED;
}

async function authorized<T>(fn: () => Promise<T>): Promise<T> {
	AUTHORIZED = true;
	try {
		return await fn();
	} finally {
		AUTHORIZED = false;
	}
}

export async function currentBranch(pi: ExtensionAPI): Promise<string> {
	const { stdout, code } = await pi.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
	if (code !== 0) throw new Error("not a git repo or HEAD detached");
	return stdout.trim();
}

export async function branchExists(pi: ExtensionAPI, branch: string): Promise<boolean> {
	const { code } = await pi.exec("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
	return code === 0;
}

/**
 * Create (or switch to, if exists) the sprint branch. Idempotent so restart
 * after a crash mid-planning does the right thing.
 *
 * When Pi is launched inside a git worktree that already has the branch
 * checked out, `git checkout` would fail because the branch is already
 * current (or is checked out in another worktree). Guard against both cases
 * by checking HEAD first and returning early if we're already on it.
 */
export async function startSprintBranch(pi: ExtensionAPI, branch: string): Promise<void> {
	return authorized(async () => {
		// Already on this branch (e.g. launched inside a pre-created worktree).
		const head = await pi.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
		if (head.stdout.trim() === branch) return;

		if (await branchExists(pi, branch)) {
			const { code, stderr } = await pi.exec("git", ["checkout", branch]);
			if (code !== 0) throw new Error(`git checkout ${branch} failed: ${stderr}`);
			return;
		}
		const { code, stderr } = await pi.exec("git", ["checkout", "-b", branch]);
		if (code !== 0) throw new Error(`git checkout -b ${branch} failed: ${stderr}`);
	});
}

export interface CommitInput {
	sprintName: string;
	sprintRootRel: string; // repo-relative path to docs/sprint/{name}/
	taskId: string;
	title: string;
	storyRef: string;
	gateSummary: string; // e.g. "Builder: ✅  Tester: ✅  ..."
	files: string[]; // declared file ownership — `git add` scope
	caseNumber?: string; // optional case/ticket number appended as the last line of the body
}

/**
 * Porcelain-v1 `git status` summary. One entry per dirty path; status is the
 * two-character XY field ("A ", " M", "??", etc.).
 */
export async function workingTreeStatus(
	pi: ExtensionAPI,
): Promise<Array<{ status: string; path: string }>> {
	const { stdout, code } = await pi.exec("git", ["status", "--porcelain"]);
	if (code !== 0) throw new Error("git status --porcelain failed");
	return stdout
		.split("\n")
		.filter((l) => l.length > 0)
		.map((l) => ({ status: l.slice(0, 2), path: l.slice(3) }));
}

/**
 * Commit whatever is dirty in the working tree as the planning-approval
 * commit. Uses `git add -A` intentionally: planning produces a wide mix of
 * artifacts (docs/sprint/*, docs/adr/*, glossary edits, test stubs,
 * test_helper config, support fixtures, per-task log dirs) and they all
 * belong together as the atomic "planning: approved" state.
 *
 * Returns the new commit SHA, or null if there was nothing to commit
 * (idempotent replay).
 */
export async function commitPlanning(
	pi: ExtensionAPI,
	input: { sprintName: string; goal: string },
): Promise<string | null> {
	return authorized(async () => {
		const add = await pi.exec("git", ["add", "-A"]);
		if (add.code !== 0) throw new Error(`git add -A failed: ${add.stderr}`);

		const diff = await pi.exec("git", ["diff", "--cached", "--quiet"]);
		if (diff.code === 0) return null;

		const msg =
			`[sprint/${input.sprintName}] planning: approved\n\n` +
			`Goal: ${input.goal}\n` +
			`Agents: PO, Architect, Tester, PM\n`;

		const commit = await pi.exec("git", ["commit", "-m", msg]);
		if (commit.code !== 0) throw new Error(`git commit (planning) failed: ${commit.stderr}`);

		const sha = await pi.exec("git", ["rev-parse", "HEAD"]);
		return sha.stdout.trim();
	});
}

// Does `path` fall under an ownership entry? Duplicated from guards.ts
// deliberately — git.ts shouldn't import guards (one-way dependency).
// Bidirectional: also matches when the dirty item is a parent *directory*
// of a declared file (git reports untracked directories, not their contents,
// when an entire new subdirectory is being created for the first time).
function ownedBy(path: string, entry: string): boolean {
	if (path === entry) return true;
	// Standard: declared entry is a prefix of the dirty path.
	const entryPrefix = entry.endsWith("/") ? entry : `${entry}/`;
	if (path.startsWith(entryPrefix)) return true;
	// Reverse: dirty item is a parent directory of the declared file.
	const pathPrefix = path.endsWith("/") ? path : `${path}/`;
	if (entry.startsWith(pathPrefix)) return true;
	return false;
}

/**
 * One commit per task. Message format is fixed by ORCHESTRATION.md so
 * downstream tooling can rely on it.
 *
 * Safety belt: refuses to commit if the working tree has any dirty file
 * that is neither declared-owned by this task nor a sprint artifact under
 * `docs/sprint/{name}/`. Prevents "stealth edits" — verify-time fixes to
 * other-task files, test-harness patches, etc. — from quietly hitching a
 * ride in a task commit whose gate summary no longer matches its contents.
 */
export async function commitTask(pi: ExtensionAPI, input: CommitInput): Promise<string> {
	return authorized(async () => {
		const dirty = await workingTreeStatus(pi);
		const unowned = dirty.filter(({ path }) => {
			if (path.startsWith(`${input.sprintRootRel}/`)) return false; // sprint artifacts always OK
			return !input.files.some((f) => ownedBy(path, f));
		});

		if (unowned.length > 0) {
			const summary = unowned.map((d) => `  ${d.status} ${d.path}`).join("\n");
			throw new Error(
				`commit_task refused: working tree has changes outside task ${input.taskId}'s declared ownership:\n${summary}\n\n` +
					"Either amend this task's file ownership to cover them, route them through a polish-{n} task, " +
					"or revert the changes before retrying.",
			);
		}

		// Stage declared files plus any dirty sprint artifacts (audit trail:
		// sprint-state.json transitions, per-task logs, sprint.log appends).
		const addDeclared = await pi.exec("git", ["add", "--", ...input.files]);
		if (addDeclared.code !== 0) throw new Error(`git add (declared) failed: ${addDeclared.stderr}`);

		const addArtifacts = await pi.exec("git", ["add", "--", input.sprintRootRel]);
		if (addArtifacts.code !== 0) {
			throw new Error(`git add (sprint artifacts) failed: ${addArtifacts.stderr}`);
		}

		const msg =
			`[sprint/${input.sprintName}] ${input.taskId}: ${input.title}\n\n` +
			`${input.storyRef}\n` +
			`${input.gateSummary}\n` +
			(input.caseNumber ? `\n${input.caseNumber}\n` : "");

		const commit = await pi.exec("git", ["commit", "-m", msg]);
		if (commit.code !== 0) throw new Error(`git commit failed: ${commit.stderr}`);

		const sha = await pi.exec("git", ["rev-parse", "HEAD"]);
		return sha.stdout.trim();
	});
}

/**
 * Consolidate log commit: stages deletions of all individual task logs
 * (logs/*.log), stages the new sprint-tasks.log, and commits them together.
 * Returns the new SHA, or null if there was nothing to commit (idempotent replay).
 *
 * Uses `git add -A -- <logsDir>` so both tracked deletions and any late-added
 * untracked log files are captured in one staging call.
 */
export async function commitLogsConsolidation(
	pi: ExtensionAPI,
	input: { sprintName: string; logsDirRel: string; consolidatedLogRel: string },
): Promise<string | null> {
	return authorized(async () => {
		// Stage deletions of all individual log files. `-A` handles tracked
		// deletions; untracked files deleted from disk are simply absent.
		const addLogs = await pi.exec("git", ["add", "-A", "--", input.logsDirRel]);
		if (addLogs.code !== 0) throw new Error(`git add (log deletions) failed: ${addLogs.stderr}`);

		// Stage the consolidated log.
		const addConsolidated = await pi.exec("git", ["add", "--", input.consolidatedLogRel]);
		if (addConsolidated.code !== 0) {
			throw new Error(`git add (sprint-tasks.log) failed: ${addConsolidated.stderr}`);
		}

		// Nothing staged? Already consolidated in a previous run.
		const diff = await pi.exec("git", ["diff", "--cached", "--quiet"]);
		if (diff.code === 0) return null;

		const msg = `[sprint/${input.sprintName}] consolidate task logs → sprint-tasks.log\n`;
		const commit = await pi.exec("git", ["commit", "-m", msg]);
		if (commit.code !== 0) throw new Error(`git commit (consolidate logs) failed: ${commit.stderr}`);

		const sha = await pi.exec("git", ["rev-parse", "HEAD"]);
		return sha.stdout.trim();
	});
}

/**
 * Sprint close: merge sprint branch into main with --no-ff so per-task
 * history is preserved. Refuses if the working tree is dirty.
 * Used by sprint:approve-close --local only.
 */
export async function mergeSprint(pi: ExtensionAPI, sprintBranch: string): Promise<string> {
	return authorized(async () => {
		const dirty = await pi.exec("git", ["status", "--porcelain"]);
		if (dirty.stdout.trim().length > 0) {
			throw new Error("working tree dirty — cannot merge");
		}
		const co = await pi.exec("git", ["checkout", "main"]);
		if (co.code !== 0) throw new Error(`git checkout main failed: ${co.stderr}`);
		const merge = await pi.exec("git", ["merge", "--no-ff", sprintBranch, "-m", `Merge ${sprintBranch}`]);
		if (merge.code !== 0) throw new Error(`git merge failed: ${merge.stderr}`);
		const sha = await pi.exec("git", ["rev-parse", "HEAD"]);
		return sha.stdout.trim();
	});
}

/**
 * Push the sprint branch to origin (prerequisite for PR creation).
 */
export async function pushBranch(pi: ExtensionAPI, branch: string): Promise<void> {
	return authorized(async () => {
		const push = await pi.exec("git", ["push", "-u", "origin", branch]);
		if (push.code !== 0) throw new Error(`git push -u origin ${branch} failed: ${push.stderr}`);
	});
}

/**
 * Create a GitHub Pull Request via the `gh` CLI.
 * Requires `gh` to be installed and authenticated.
 * Returns the PR URL on success.
 */
export async function createPullRequest(
	pi: ExtensionAPI,
	opts: { title: string; body: string; base: string; branch: string },
): Promise<string> {
	const result = await pi.exec("gh", [
		"pr", "create",
		"--title", opts.title,
		"--body", opts.body,
		"--base", opts.base,
		"--head", opts.branch,
	]);
	if (result.code !== 0) throw new Error(`gh pr create failed: ${result.stderr}`);
	return result.stdout.trim(); // PR URL
}
