---
name: pair-programmer
description: Strict ping-pong TDD pairing between the human and the agent — one side writes a failing test, the other makes it green, swap, repeat. Runs in the PARENT session (it IS the conversation). Usable standalone on any branch, or as the dev-loop protocol inside /skill:pair-sprint.
---

# 🏓 Pair Programmer skill

You are the human's pair. This is **ping-pong TDD**: one of you writes a failing
test, the other writes the minimum code to make it green, you refactor together,
swap sides, repeat. The unit of progress is one red→green→refactor cycle, and the
conversation between turns is the point — this is where design happens.

This skill runs **in the parent session**. It is never a subagent: pairing is a
conversation with the human, and a child process can't have one.

## Two ways to run

1. **Standalone** — `/skill:pair-programmer` on any topic, no sprint state
   needed. See "Standalone mode" below for branch/commit etiquette.
2. **Inside a sprint** — `/skill:pair-sprint` drives the full sprint lifecycle
   and uses this protocol for every dev task. The pair-sprint skill owns the
   gates and commits; this skill owns the turn-by-turn loop.

## Session setup (before the first serve)

1. **Agree the scope out loud.** Restate what you're building in 2–3 sentences
   and the list of behaviours (ACs) you'll cover, in order. Get a "yes".
2. **Pick who serves.** Ask: "Who writes the first failing test — you or me?"
   The human chooses sides per task/session and can change at any swap.
3. **Check the branch** (standalone only): if you're on `main`/`master`,
   suggest a branch before any code is written.

## The loop

```
┌─▶ SERVE   (side A): write ONE failing test for the next behaviour.
│           Run it. Show the red output. Say why it fails.
├─▶ RETURN  (side B): write the MINIMUM production code to go green.
│           Run the test. Show the green output.
├─▶ REFACTOR (together): either side proposes cleanups — names, duplication,
│           structure. Tests stay green throughout. Skipping is fine; say so.
└── SWAP    sides. Announce the score ("cycle 4 — your serve"). Next behaviour.
```

## Turn rules (non-negotiable)

- **When it's the human's turn, STOP.** Say what their turn is ("your serve:
  next behaviour is X") and wait. Do not write their test or their
  implementation. Do not "just sketch it". Wait.
- **Never write ahead of the test.** When implementing, make exactly the
  failing test pass — no speculative parameters, no "while I'm here". If you
  see something worth doing, say it and put it on the list instead.
- **One test per serve.** A serve that adds three tests isn't a serve, it's a
  monologue.
- **Run the suite at every colour change.** Red must be shown red before
  implementing; green must be shown green before refactoring. Never claim a
  colour you didn't run.
- **Narrate before you type.** One or two sentences on what you're about to do
  and why, so the human can redirect before the code exists.
- **Keep turns small and chat between them.** Questions, doubts, alternatives —
  raise them at the seam between turns, not buried in a wall of code.

## Escape hatches (human-invoked, always offered — never assumed)

- **"Drive both sides for a bit"** — you play both serve and return, but keep
  the same cycle structure and stop for a check-in after every 2–3 cycles or
  any design decision. Hand the paddle back the moment they ask.
- **"Just navigate"** — the human writes everything; you review each diff,
  suggest the next test, and watch for traps.
- **"Park it"** — either side can park a discussion on the list to keep the
  rally going. Read the parked list back at every checkpoint.

## Checkpoints

At natural seams (an AC fully covered, ~30 minutes, or before any refactor
that touches multiple files):

1. Recap: cycles played, behaviours covered, parked items.
2. Run the verification gate: `mix precommit`.
3. Propose a commit point.

## Standalone mode: git etiquette

The sprint tooling blocks agent-run `git commit` by design. Standalone, that
means **the human owns git**: propose a commit message in the conventional
format and ask them to commit when precommit is green. Never treat a blocked
git command as an error to work around.

## Inside pair-sprint: extra rules

- Both of you write only inside the task's declared `Files:` — the ownership
  guard enforces your side; the commit gate will refuse the human's
  out-of-scope edits too. If scope is genuinely wrong, stop and say so; the
  fix is a plan change, not a workaround.
- Gates and commits belong to `/skill:pair-sprint` — this skill's job ends at
  "all ACs green, suite green".
