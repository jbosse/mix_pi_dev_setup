/**
 * Deterministic guardrails enforced regardless of what any skill asks for.
 *
 * These are the invariants from CLAUDE.md + ORCHESTRATION.md that must
 * never be silently bypassed:
 *   - Never run the sprint flow on `main`.
 *   - Only tooling (this extension) may git commit / merge / push.
 *   - Writes outside a running task's declared file ownership are refused.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { isGitAuthorized } from "./git.js";
import { loadState, type SprintState } from "./state.js";
import { SPRINT_ROOT_REL, type SprintPaths } from "./paths.js";

// Commands that mutate history — allowed only when our commitTask/mergeSprint
// helpers have set the authorised flag. Everything else (status, diff, log,
// rev-parse) remains free.
const BLOCKED_GIT_SUBCOMMANDS = ["commit", "merge", "push", "reset", "rebase", "cherry-pick"];

// Git global options that consume a separate value argument. Skipped (with
// their value) when hunting for the subcommand so `git -c a=b commit` can't
// slip past the guard.
const GIT_VALUE_FLAGS = new Set(["-c", "-C", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);

function extractGitSubcommand(command: string): string | undefined {
	// Cheap parse — we only need to see the first `git <subcommand>`. Good
	// enough for guard purposes; a determined user could still shell-escape
	// around it, but the point is to catch accidental model-initiated mutations.
	const m = command.match(/\bgit\s+(.*)/s);
	if (!m) return undefined;
	const tokens = m[1].split(/\s+/);
	for (let i = 0; i < tokens.length; i++) {
		const tok = tokens[i];
		if (tok === "") continue;
		if (GIT_VALUE_FLAGS.has(tok)) {
			i++; // skip the flag's value token too
			continue;
		}
		if (tok.startsWith("-")) continue; // --flag or --flag=value forms
		return tok;
	}
	return undefined;
}

export function installStartupGuard(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		const { stdout, code } = await pi.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
		if (code !== 0) return; // not a git repo — user's problem, not ours
		const branch = stdout.trim();
		if (branch === "main" || branch === "master") {
			// Loud notification, then we set a persistent status so it can't be
			// missed. We don't hard-exit — the user may just want to inspect
			// things. Rule per CLAUDE.md: recommend a branch, offer to create.
			console.error(`[sprint] refusing to run sprint flow on ${branch}`);
			ctx.ui.notify(
				`⚠ You're on ${branch}. Per CLAUDE.md, sprint work happens on sprint/{name}. Use /sprint:new or checkout a sprint branch.`,
				"warning",
			);
			ctx.ui.setStatus("sprint", `⚠ on ${branch} — sprint tools disabled`);
		}
	});
}

export function installBashGitGuard(pi: ExtensionAPI): void {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return;
		const command = (event.input as { command?: string }).command ?? "";
		const sub = extractGitSubcommand(command);
		if (!sub || !BLOCKED_GIT_SUBCOMMANDS.includes(sub)) return;
		if (isGitAuthorized()) return; // called from our own helpers
		console.error(`[sprint] blocked ad-hoc 'git ${sub}' — only commit_task/sprint_merge may mutate history`);
		ctx.ui.notify(`Blocked 'git ${sub}'. Use commit_task / sprint_merge tooling.`, "error");
		return { block: true, reason: `git ${sub} must go through sprint tooling (commit_task / sprint_merge)` };
	});
}

/**
 * Does `path` fall under the ownership entry `entry`?
 *
 * Supports three declaration styles:
 *   - Exact file:        "lib/foo.ex"
 *   - Directory (no /):  "lib/foo"        → matches lib/foo/bar
 *   - Directory prefix:  "priv/repo/migrations/" (trailing slash)
 *
 * The previous guard appended "/" unconditionally, producing "a//b" when
 * the entry already ended in "/" — so trailing-slash prefixes silently failed
 * to match. This helper normalises so PM's "priv/repo/migrations/" notation
 * (the documented convention) works.
 *
 * Also handles the reverse case: git reports an untracked *parent directory*
 * (e.g. `lib/foo/adapters/`) as the dirty item when files are newly created
 * inside a directory git hasn't seen before. In that case `path` is a
 * directory prefix of `entry` — treat it as covered so the ownership check
 * doesn't false-negative on brand-new subdirectories.
 */
export function pathOwnedBy(path: string, entry: string): boolean {
	if (path === entry) return true;
	// Standard case: declared entry is a prefix of the dirty path.
	const entryPrefix = entry.endsWith("/") ? entry : `${entry}/`;
	if (path.startsWith(entryPrefix)) return true;
	// Reverse case: the dirty item is a parent directory of a declared file.
	// git shows "lib/foo/adapters/" (with trailing slash) when all files inside
	// are untracked. Normalise the dirty path to a directory prefix and check
	// whether any declared file lives under it.
	const pathPrefix = path.endsWith("/") ? path : `${path}/`;
	if (entry.startsWith(pathPrefix)) return true;
	return false;
}

/**
 * Prevent writes outside any in-flight task's declared file ownership.
 *
 * Single-process flow: there is at most one in-flight task at a time
 * (`task.gate !== "done"`, picked up in plan order). Writes must land in
 * that task's declared `files`. Cross-task writes are refused even if a
 * later task claims the path — Builder must finish the current task first.
 */
export function installOwnershipGuard(
	pi: ExtensionAPI,
	getActive: (ctx: ExtensionContext) => { state: SprintState; paths: SprintPaths } | undefined,
): void {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "write" && event.toolName !== "edit") return;
		const active = getActive(ctx);
		if (!active) return; // no sprint loaded — stay out of the way
		const rawPath = (event.input as { path?: string }).path ?? "";
		// Normalize to repo-relative so every comparison below is in the same
		// coordinate system as task.files entries (which are always relative).
		const cwdPrefix = ctx.cwd.endsWith("/") ? ctx.cwd : `${ctx.cwd}/`;
		const path = rawPath.startsWith(cwdPrefix) ? rawPath.slice(cwdPrefix.length) : rawPath;

		// Sprint artifact writes are always allowed — skills write plan.md,
		// architecture.md, logs etc. outside their "file ownership".
		const sprintRootRel = `${SPRINT_ROOT_REL}/${active.state.name}`;
		if (path === sprintRootRel || path.startsWith(`${sprintRootRel}/`)) return;

		// The extension source (including these guards) is never writable from
		// inside the sprint flow — otherwise the model could rewrite the
		// guardrails it is subject to.
		if (path.startsWith(".pi/extensions/")) {
			console.error(`[sprint] blocked write to extension source: ${path}`);
			return {
				block: true,
				reason: `${path} is sprint-tooling source. The sprint flow may never modify .pi/extensions/ — ask the human to change tooling.`,
			};
		}

		const { state } = active;
		// Before the plan is seeded, we have no ownership map to enforce.
		// Planning-phase writes are restricted to docs, test stubs, and config —
		// NOT production code. This prevents a model from bypassing plan approval
		// and writing code directly during the planning phase.
		if (state.tasks.length === 0) {
			const PLANNING_ALLOWED_PREFIXES = [
				"docs/",
				"test/",
				"config/",
				"priv/",
			];
			const allowed = PLANNING_ALLOWED_PREFIXES.some((p) => path.startsWith(p));
			if (!allowed) {
				console.error(`[sprint] planning-phase write blocked: ${path} — only docs/test/config/priv allowed before plan approval`);
				return {
					block: true,
					reason: `${path} is outside allowed planning-phase paths (docs/, test/, config/, priv/). ` +
						`Production code cannot be written until the plan is approved and tasks are seeded.`,
				};
			}
			return;
		}

		// Single-process flow: exactly one task is in flight — the FIRST
		// not-done task in plan order. Only its declared files are writable.
		// (During final review, with every task done, nothing is writable
		// outside sprint artifacts until PM appends a polish task.)
		const current = state.tasks.find((t) => t.gate !== "done");
		if (current && current.files.some((f) => pathOwnedBy(path, f))) return;

		// Not owned by the current task. If a later task claims it, say so
		// specifically — Builder must finish the current task first.
		const futureOwners = current
			? state.tasks.filter(
					(t) => t !== current && t.gate !== "done" && t.files.some((f) => pathOwnedBy(path, f)),
				)
			: [];
		if (futureOwners.length > 0) {
			const where = futureOwners.map((t) => `${t.id} (gate ${t.gate})`).join(", ");
			console.error(`[sprint] cross-task write blocked: ${path} — ${where}`);
			return {
				block: true,
				reason: `${path} belongs to a later task (${where}). Finish the current task before touching these files.`,
			};
		}

		console.error(`[sprint] unowned write blocked: ${path}`);
		return {
			block: true,
			reason: `${path} is not claimed by any task in the sprint plan. Declare it in plan.md (and re-seed) or route the change through a polish-{n} task.`,
		};
	});
}

export function readStateIfAny(paths: SprintPaths): SprintState | undefined {
	try {
		return loadState(paths);
	} catch (err) {
		console.error("[sprint] state read failed:", err);
		return undefined;
	}
}
