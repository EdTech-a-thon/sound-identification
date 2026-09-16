# Simple Agent Coordinator Specification

**Status:** Proposed  
**Date:** September 4, 2026

## Purpose

Build one small, deterministic Node.js script that implements a list of GitHub tickets sequentially using this loop:

```text
implementation agent -> deterministic verification -> fresh review agent
          ^                                      |
          |------------ blocking feedback -------|
```

Once a review accepts a ticket, the script saves the work and moves to the next ticket. The script—not another language model—owns waiting, state transitions, verification, commits, and ticket progression.

## Goals

- Use one implementation agent at a time.
- Use a fresh review agent for every review pass.
- Resume the same implementation session when review finds blockers.
- Run project checks deterministically before review.
- Keep full agent logs on disk without injecting them into another model context.
- Bound repair loops so a ticket cannot consume tokens indefinitely.
- Save accepted work before starting the next ticket.
- Remain understandable as a single small script with no new npm dependencies.

## Non-goals

Version 1 will not include:

- Gondolin or other VM isolation.
- Read-only or hidden tests.
- Parallel ticket implementation.
- Automatic dependency-graph planning.
- Multiple specialist review agents.
- Continuous LLM progress monitoring.
- Automatic debate over proposed test changes.
- A web dashboard, database, or general-purpose workflow engine.

## Files

```text
scripts/coordinate-tickets.mjs
coordinator.config.json
.coordinator/                 # ignored runtime state and logs
```

Target the coordinator script at fewer than 400 readable lines. Use built-in Node.js modules only.

## Command line

Start an explicit ticket queue:

```bash
node scripts/coordinate-tickets.mjs --tickets 6,7,8,9,10
```

Resume the most recent interrupted run:

```bash
node scripts/coordinate-tickets.mjs --resume
```

Push accepted commits and close their GitHub issues:

```bash
node scripts/coordinate-tickets.mjs --tickets 6,7 --push
```

Without `--push`, accepted tickets are committed locally but their issues remain open. The script always operates on `dev` and refuses to run on another branch.

## Configuration

`coordinator.config.json` contains stable project settings:

```json
{
  "verify": [
    "npm test",
    "npm run build",
    "git diff --check"
  ],
  "maxRepairCycles": 2,
  "implementation": {
    "provider": "edtechathon",
    "model": "gpt-5.6-terra",
    "thinking": "high"
  },
  "review": {
    "provider": "edtechathon",
    "model": "gpt-5.6-terra",
    "thinking": "high"
  }
}
```

Models and thinking levels can be overridden through command-line options later, but version 1 does not require those options.

## Preconditions

Before starting a run, the script must verify:

1. The current branch is `dev`.
2. No tracked files are modified.
3. `git`, `gh`, `node`, and `pi` are available.
4. GitHub authentication works.
5. Every requested issue exists and is open.
6. The verification commands exist and can be invoked.

If a precondition fails, stop without changing the repository.

Untracked files are allowed, but `.coordinator/` must be ignored. Because the run starts with no tracked changes, all later tracked changes can safely be attributed to the active ticket.

## State machine

Each ticket moves through these states:

```text
queued
  -> implementing
  -> verifying
  -> reviewing
  -> repairing       # only after failed verification or rejected review
  -> accepted

Any state may move to blocked when human input is required.
```

The run state is persisted after every transition:

```json
{
  "runId": "2026-09-04T12-00-00Z",
  "tickets": [6, 7, 8],
  "currentTicket": 6,
  "state": "reviewing",
  "baseCommit": "abc1234",
  "implementationSession": ".coordinator/runs/.../implementation/session.jsonl",
  "repairCycles": 0,
  "push": true
}
```

Writing state must be atomic: write a temporary file and rename it into place.

## Ticket workflow

### 1. Prepare

For the active issue, the coordinator:

- Records the current commit as `baseCommit`.
- Fetches the complete issue title, body, and comments with `gh`.
- Saves the issue text in the run directory.
- Generates a short implementation prompt containing file paths rather than prior conversation history.

The implementation prompt instructs the agent to:

- Read `AGENTS.md`, `CONTEXT.md` when present, the issue text, and linked parent specification.
- Implement only the active ticket.
- Work directly in the current repository.
- Add or improve tests where useful.
- Avoid weakening or deleting existing tests unless essential.
- Never commit, push, close issues, or start subagents.
- Run focused checks while working.
- Stop only when blocked or settled.

### 2. Implement

Start one fresh Pi RPC session for the ticket. The coordinator owns the process directly and waits for `agent_settled`; it does not return control to an LLM or poll through an LLM.

Persist:

- Pi session transcript.
- Raw RPC event log.
- Final assistant message.
- Process exit status.

If Pi exits without `agent_settled`, mark the ticket `blocked`.

### 3. Verify

Run every configured verification command sequentially and save combined output.

If verification fails:

- Increment `repairCycles`.
- Send a concise message containing the failed command and relevant output to the existing implementation session.
- Return to `repairing`, then `verifying`.
- Do not start a review agent until all deterministic checks pass.

Long logs must be truncated in feedback while the complete logs remain on disk.

### 4. Review

Capture:

- The issue text.
- `git diff --stat`.
- The complete ticket diff from `baseCommit`.
- Verification results.
- A separate diff of existing test-file modifications.

Start a **fresh** review session with no inherited implementation conversation. The reviewer may inspect the repository but must not edit it.

The reviewer is instructed to report only blocking findings involving:

- Unmet acceptance criteria.
- Incorrect behavior or regressions.
- Missing meaningful coverage for risky behavior.
- Tests weakened merely to obtain a passing result.
- Material maintainability problems likely to cause defects.

Style preferences and optional improvements are not blockers.

The final review response must be exactly one JSON object:

```json
{
  "verdict": "accept",
  "findings": []
}
```

or:

```json
{
  "verdict": "reject",
  "findings": [
    {
      "title": "Saved state can be reported before commit",
      "evidence": "src/environment-storage.js:42 resolves on request success",
      "requiredChange": "Resolve only after the transaction completes"
    }
  ]
}
```

Invalid JSON or an unknown verdict blocks the ticket rather than guessing.

The coordinator hashes the working diff immediately before and after review. If the reviewer changes tracked files, mark the ticket `blocked`; do not automatically discard those changes.

### 5. Repair

When review rejects the ticket:

- Increment `repairCycles`.
- Generate concise feedback from the structured findings.
- Resume the existing implementation session.
- Return to deterministic verification.
- Start a new, fresh reviewer after verification passes again.

When `repairCycles` exceeds `maxRepairCycles`, stop the run with the ticket marked `blocked` and print the relevant artifact paths.

### 6. Accept and advance

After an `accept` verdict:

1. Confirm verification still passes or that the working diff is unchanged since verification.
2. Stage all tracked ticket changes and newly added product/test files.
3. Commit with `Implement #<number>: <issue title>`.
4. When `--push` is enabled, push `dev` and close the issue with a short verification summary.
5. Mark the ticket accepted in state.
6. Move to the next explicit ticket number.

If commit, push, or issue closure fails, stop instead of advancing.

## Test-change policy

The implementation agent is allowed to write tests. Existing test modifications are not automatically rejected, but they are highlighted for the reviewer.

If the implementation agent believes an existing acceptance test conflicts with the specification, it should write a request to:

```text
.coordinator/test-change-request.json
```

The coordinator marks the ticket `blocked` for human review. It does not launch another automatic agent debate.

## Logging and terminal output

The terminal shows only stage-level events:

```text
[#6] implementation started
[#6] implementation settled
[#6] verification passed
[#6] review rejected with 2 blockers
[#6] repair 1/2 started
[#6] review accepted
[#6] committed as abc1234
[#7] implementation started
```

Do not stream model reasoning or RPC message updates by default. Complete logs remain under `.coordinator/runs/<run-id>/`.

## Failure and interruption behavior

- `Ctrl-C` terminates the active child process cleanly and preserves state.
- `--resume` continues the recorded ticket from the last safe transition.
- A ticket recorded as `implementing`, `repairing`, or `reviewing` during an unclean shutdown is marked `blocked` unless its saved Pi session can be resumed safely.
- The coordinator never skips a failed ticket and silently proceeds.
- Authentication, ambiguous requirements, exhausted repair cycles, test-change requests, and reviewer edits all require human intervention.

## Acceptance criteria for the coordinator

1. Given two stub tickets and stub agents that accept immediately, the coordinator implements, verifies, reviews, commits, and advances sequentially.
2. Failed verification returns feedback to the same implementation session without launching a reviewer.
3. A rejected review resumes the implementation session and uses a fresh reviewer for the next pass.
4. An accepted review advances to the next ticket.
5. More than two repair cycles blocks the run.
6. Invalid reviewer JSON blocks the run.
7. Reviewer edits are detected and block the run.
8. No language model is invoked while waiting for another model or a shell command.
9. Full RPC logs are stored on disk but not copied into another agent prompt.
10. An interrupted run preserves enough state to explain what happened and resume from a safe boundary.

## Testing approach

Use Node's built-in `node:test` module. Make process execution injectable so tests can replace `pi`, `git`, `gh`, and verification commands with deterministic fakes.

Tests should cover the state machine and generated prompts without making real model calls, modifying GitHub issues, or pushing commits.

## Deliberate simplifications

The first version should prefer stopping over clever recovery. It should not infer dependencies, adjudicate ambiguous requirements, merge concurrent work, rewrite tests automatically, or select models dynamically. Those capabilities should be added only after repeated real runs demonstrate a concrete need.
