---
name: planning-interview
description: Collaborative discovery session the Orchestrator runs with the human at sprint start. Explores intent, constraints, and success criteria through adaptive questioning — enough for Product Owner to write user stories without follow-up.
---

# 🎤 Planning Interview skill

Help the human turn a rough idea into a well-understood sprint scope through natural collaborative dialogue. Your goal is to extract enough context, constraints, and success criteria that the Product Owner can write user stories without needing to ask the human anything else.

<HARD-GATE>
## ONE QUESTION PER MESSAGE — NO EXCEPTIONS

Every message you send to the human contains EXACTLY ONE question. Not two. Not "a quick follow-up." Not "and also." ONE.

If you catch yourself writing a second question mark in the same message, DELETE everything after the first question and STOP.

This is the single most important rule in this skill. Violating it makes the interview feel like a form to fill out rather than a conversation.
</HARD-GATE>

<HARD-GATE>
Do NOT hand off to any downstream agent until you have summarized the sprint scope back to the human and they have confirmed it. This applies regardless of how simple the sprint seems.
</HARD-GATE>

## Anti-Pattern: "This Is Too Simple To Need Exploration"

Every sprint goes through this process. A one-file change, a config tweak, a small feature — all of them. "Simple" sprints are where unexamined assumptions cause the most rework. The interview can be brief for truly simple work, but you MUST confirm understanding before wrapping up.

## Process

### 1. Explore project context (silent — no message to human yet)

Before asking anything, look at:

- Recent git commits (last ~10) to understand current momentum
- Any open TODOs, FIXMEs, or relevant docs
- The area of the codebase the human's idea likely touches

This grounds your questions in reality rather than abstraction.

### 2. Open with context, then ask ONE question

Show the human you've oriented yourself ("I see we just landed X and the codebase currently Y..."), then ask your first question. ONE question. End the message.

### 3. Ask clarifying questions — ONE AT A TIME, adaptive

**THE RULE: One question per message. Period.**

- Send your question. Stop. Wait for the answer. Then ask the next one.
- Prefer multiple choice when possible — easier to answer than open-ended.
- Adapt based on answers. Don't follow a rigid script. If an answer reveals complexity, dig deeper. If the scope is clear, move on.
- Focus on: purpose, constraints, success criteria, edge cases, what's explicitly out of scope.

**Bad (NEVER do this):**
> "What's the sprint goal? Also, do you have a name in mind? And is anything out of scope?"

**Good:**
> "In one sentence, what should this sprint ship when it's done?"

Then wait. Then ask the next question in a new message.

**Topics to cover** (not necessarily in this order — adapt to the conversation):

| Topic | Why it matters |
|-------|---------------|
| Sprint goal | One sentence — what does this sprint ship? |
| Sprint name | Kebab-case, becomes `sprint/{name}` |
| User-facing behavior | What does the human/end-user actually experience when this works? |
| Scope guardrails | What is explicitly out of scope? |
| Success criteria | How do we know it's done? What would "wrong" look like? |
| Known risks / prior art | Related sprints, ADRs, pain points? |
| Technical constraints | Performance budgets, compatibility, migration concerns? |
| Verification pipeline | Default is `mix precommit` — add or remove steps? |

You don't need to ask about every topic. Some will be obvious from context or from earlier answers. Stop when you're confident PO has enough to work with.

### 4. Propose scope options (when ambiguous)

If the idea is ambiguous or could be scoped multiple ways, propose 2-3 approaches with trade-offs and your recommendation. Let the human pick before continuing.

Example:
> "I can see two ways to scope this:
> A) Minimal — just the happy path, ship in ~3 tasks
> B) Full — happy path + error handling + edge cases, ~6 tasks
> I'd recommend A because [reason]. Which feels right?"

Skip this step if scope is already clear from the conversation.

### 5. Summarize and confirm

Once you believe you understand the sprint scope, present a brief summary:

- Sprint goal (one sentence)
- Sprint name
- Key behaviors / acceptance themes (bullet points — NOT user stories)
- Out of scope
- Verification pipeline (only mention if changed from default)
- Any risks or constraints flagged

Ask: "Does this capture what you want? Anything to add or change?"

Do NOT proceed until the human confirms.

### 6. Hand off

- Write the confirmed summary to `/docs/sprint/{name}/planning-summary.md` under a `## Interview` section.
- Return control to the parent Orchestrator. The parent runs `sprint_start(name, goal)` next.

## Do not

- Propose user stories (that's PO).
- Propose architecture (that's Architect).
- Edit `sprint-state.json` — `sprint_start` does that.
- Ask more than one question per message. EVER.
- Proceed to hand-off without human confirming the summary.
