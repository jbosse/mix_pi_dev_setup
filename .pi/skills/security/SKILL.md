---
name: security
description: Per-task security review for a Phoenix/Elixir web application — authz, secrets hygiene, input validation, error hygiene, PII in logs, SQL safety, external call safety, deserialization. Owns Gate 3 (pass/fail).
---

# 🛡 Security skill

Load before reviewing:

- `/docs/styleguide.md` — especially § Error Handling, § Logging, § Config & Secrets, § Boundary Validation, § Database & Transactions.
- `/docs/glossary.md`
- `/AGENTS.md`
- `/SPEC.md` if present — domain-specific compliance requirements take precedence.
- `/config/runtime.exs`

## Verdict

Binary. Independent of Reviewer — both must pass.

### On pass

Call `gate_pass(taskId, "security")`.

### On fail

Each finding includes:
- File + line
- CWE or OWASP category (e.g. *CWE-532: sensitive information in log file*)
- Risk rationale (why this matters)
- Suggested fix direction (not a rewrite)

Then call `strike_record(taskId, "security", "<summary>")`. Attach full findings to `task_log_append`.

## Checklist

### Authz / Authn
- Every LiveView / controller action asserts authenticated `current_scope` (per `AGENTS.md`). Missing → fail.
- Routes that require a specific role are guarded in `mount`/`handle_params`. Role check skipped → fail.
- No action that modifies data is accessible without authentication.

### Input validation
- Every inbound external input (LiveView event, controller params, background job args, vendor HTTP response) passes through a Contract (embedded-schema changeset) before entering `/lib`. Raw `params` reaching a domain function → fail.
- Background job args validated at the start of `perform/1` before any domain logic.

### SQL safety
- `Ecto.Query` DSL only — no `Repo.query/2` with user input, no string-interpolated fragments. Raw SQL without ADR → fail.
- Parameterized via `^` interpolation. Dynamic fragments use `fragment(...)` with positional `?` placeholders.

### Secrets & config hygiene
- No secret string literal in `lib/` or `test/`. Test fixtures carry placeholders only.
- `System.get_env/1` outside `config/runtime.exs` → fail.
- `Application.get_env/2` outside the designated config module → fail (per sprint's architecture.md).
- `.env.local` gitignored; `.env.example` has placeholders only.

### PII & logging
- No log line carries PII (names, email in full, sensitive identifiers), secrets, API keys, session tokens, or raw request bodies.
- `inspect(struct)` inside a `Logger.*` call → fail unless the struct is known to be safe.
- No sensitive data in crash reports or stacktraces unless an explicit sanitization path is in place.

### External call safety
- All outbound vendor calls go through an Adapter in `adapters/`. Direct `Req.*` in `/lib/<context>/` (outside `adapters/`) → fail.
- Timeouts declared per Adapter. Unbounded external call → fail.
- Any user-controllable URL used in an outbound request is allow-listed — SSRF surface must be explicitly closed.

### File / upload safety (if applicable)
- Uploaded files size-capped, content-type validated.
- Files never stored on the web node's local disk long-term.
- Generated CSV/spreadsheet exports sanitize leading `=`, `+`, `-`, `@` to prevent formula injection.

### Deserialization / external output safety
- Responses from external services parsed through a Contract before persistence or rendering.
- Rendered user-controlled content in LiveView escaped by Phoenix default. `Phoenix.HTML.raw/1` on user content → fail unless sanitized via an explicitly-justified path (ADR).

### Dependencies
- New security-sensitive dep (crypto, parsers, auth, serialization) → ADR required.

## Out of scope for this gate

- `mix sobelow` runs in Gate 4 deterministically — don't duplicate its checks here unless it reported a finding and Builder is trying to suppress it.
- Dependency CVE scanning — platform concern.
- Penetration testing — org-level, not per-task.
- Rate limiting / DoS — platform-level (Phoenix endpoint + upstream).

## Hard rules

- **Flag, don't fix.**
- **Cite CWE / OWASP** where applicable.
- Do not wave through a finding because Reviewer already passed — your scope is different.

## Required tool calls

- `task_log_append` with agent=`security` for verdict + findings.
- Exactly one of `gate_pass` (pass) or `strike_record` (fail).
