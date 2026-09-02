# Smaller-Model Build Handoff

## Recommended model usage

Use GPT-5.6 Terra with medium reasoning for the initial implementation milestone. It is the smaller GPT-5.6 tier intended to balance intelligence and cost, making it a safer default for repository setup and multi-file coding than the most cost-optimized tier.

GPT-5.6 Luna can be used for tightly bounded follow-up tickets with explicit tests and little architectural judgment. Use a stronger review pass for cryptography, OAuth, synchronization conflict rules, native bridge security, and release security review.

Official OpenAI model guidance:

<https://developers.openai.com/api/docs/guides/latest-model>

## How to use the handoff

1. Start a new Codex task rooted at the PostKeeper workspace.
2. Select GPT-5.6 Terra and medium reasoning, if those controls are available.
3. Paste the prompt below without adding a request to build the whole product at once.
4. Let the model complete and verify only the next incomplete milestone.
5. Review its changes and `docs/STATUS.md` before starting another task.

## Copy-ready prompt for the first build task

```text
Build the next planned milestone of PostKeeper in the current workspace.

Before changing anything, read these files completely and treat them as the source of truth:
- README.md
- docs/PRODUCT_PLAN.md
- docs/TECHNICAL_ARCHITECTURE.md
- docs/IMPLEMENTATION_ROADMAP.md
- docs/DECISIONS.md
- docs/STATUS.md

Your scope for this task is only the first incomplete milestone in docs/STATUS.md. At present that should be Milestone 0 — Foundation and feasibility. Do not implement later product milestones such as the production capture extension, Google Drive synchronization, the Android wrapper, or polished product features.

Work autonomously within that milestone:
- Inspect the workspace and preserve any existing user changes.
- Mark the milestone In progress in docs/STATUS.md.
- Implement every item in the milestone scope and its tests or feasibility evidence.
- Prefer TypeScript, React, Vite, npm workspaces, and the proposed package boundaries unless a feasibility result gives a concrete reason to differ.
- Keep the build compatible with static hosting under both a project subpath and a custom-domain root.
- Keep dependencies minimal; document the license, maintenance status, and reason for each important dependency.
- Do not introduce a backend service, external database, analytics, article upload service, or embedded secret.
- Stay within the authorized workspace and obey all applicable repository and filesystem access restrictions.
- Do not publish, deploy, push, purchase, or create external cloud resources.
- Run all relevant non-destructive validation, fix failures that are within scope, and record the exact commands and outcomes.
- If an architectural change is necessary, add a concise decision to docs/DECISIONS.md before implementing it.
- When all completion criteria pass, mark the milestone Complete in docs/STATUS.md with evidence and state the next milestone. Otherwise leave it In progress and clearly record what remains.

Stop after this milestone. In your final response, summarize the outcome, tests run, important decisions, known limitations, and the next milestone. Do not begin the next milestone without a new request.
```

## Reusable prompt for later milestones

After reviewing and accepting a completed milestone, use:

```text
Continue building PostKeeper in the current workspace.

Read README.md and every Markdown file in docs/ completely before making changes. Treat docs/STATUS.md as the canonical record of progress and docs/IMPLEMENTATION_ROADMAP.md as the scope contract.

Implement only the first incomplete milestone, or the single named sub-ticket below if that milestone is explicitly split:

[OPTIONAL SUB-TICKET: insert one bounded sub-ticket here]

Mark the work In progress, implement it with relevant tests, run non-destructive validation, and update docs/STATUS.md with exact evidence. Preserve user changes and existing architectural decisions. Do not publish, deploy, push, purchase, create cloud resources, or start a later milestone. Stay within the authorized workspace and obey all applicable repository and filesystem access restrictions.

If the milestone touches cryptography, OAuth, sync conflict resolution, or a native/web security bridge, implement the bounded work but explicitly flag it for a stronger security review before release.

Stop when the milestone or named sub-ticket is complete or when a genuine blocker requires user input. Report changed files, test results, decisions, limitations, and the next planned step.
```
