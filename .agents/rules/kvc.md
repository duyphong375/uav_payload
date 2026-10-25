---
trigger: always_on
description: KVC per-task coder ownership and user-selected fixes after Codex review
---

Read `AGENTS.md` at the workspace root before implementing any task. It is the
single source of shared KVC workflow rules; do not duplicate or override it here.
Codex, Antigravity and Kilo can code when assigned as the task's sole owner and
the selected session has workspace access. DeepSeek can be used as the coding model
in a workspace-capable tool. In a Kilo session, Kilo remains the owner and DeepSeek
is recorded as model/provider; through another coding tool, name that tool/session
as owner. Changing models does not transfer ownership. Codex also reviews; review-only
requests do not authorize edits. After findings, the user chooses one available
workspace-capable coder as fix owner. Stop the previous writer before transferring
ownership. Codex reviewing its own code is SELF-REVIEW.
Use the task, review and fix prompts in `docs/KVC_AI_WORKFLOW.md`. Build/test
before handoff. Never automatically call another agent, commit, push, merge,
deploy or flash.
