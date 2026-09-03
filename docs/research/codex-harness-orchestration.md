# Codex harness orchestration research

Research date: 2026-09-03

## Recommendation

For a parent agent supervising one implementation ticket at a time, prefer this order:

1. Use the current Codex session's built-in subagent controls when the worker can be a Codex agent.
2. Use a long-lived process plus its native event stream when the worker must be a different harness such as Pi.
3. Use the Codex SDK for a purpose-built Codex automation script.
4. Use `codex app-server` directly only when the orchestrator needs low-level JSON-RPC control over thread lifecycle, live events, approvals, steering, and interruption.

This project should keep implementation sequential because its tickets have blocking edges and all workers would otherwise share one working tree. OpenAI's guidance recommends parallel agents first for read-heavy work and warns that parallel write-heavy work creates conflicts and coordination overhead. [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)

## Built-in Codex subagents

Current Codex releases support subagent workflows in the desktop app, CLI, and IDE. The parent can spawn workers, route follow-up instructions, wait for results, interrupt work, and collect summaries. In the CLI, `/agent` lets a person inspect or switch among agent threads. Workers inherit the parent sandbox and live permission overrides unless a custom agent narrows them. [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)

Custom agents can be defined in project-scoped `.codex/agents/*.toml` files with a name, description, and developer instructions. They can also select their own model, reasoning effort, sandbox, MCP servers, and skills. Unspecified model and reasoning settings inherit from the parent or `[agents]` defaults. [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)

For this orchestration session specifically, the exposed collaboration controls support:

- starting a bounded subagent task;
- sending feedback to a running worker;
- triggering a follow-up turn on an idle worker;
- interrupting a worker;
- listing worker status;
- waiting for mailbox/status updates.

The current session allows four active agents total, including the parent. A wait returns notice that an update exists; the parent then reads the delivered result/message. These are current-session capabilities, not promises about every Codex surface.

### Good fit

Built-in subagents are the simplest option for isolated exploration, review, and tests. They can also implement a ticket when only one write-capable worker is active and the parent retains ownership of acceptance, commit, push, and issue status.

### Limitation

The built-in controls do not turn an arbitrary external harness process into a Codex subagent. A Pi process needs its own process/session protocol and completion signal. Codex can supervise that process, but the integration boundary is the shell process or Pi's RPC transport rather than Codex's subagent mailbox.

## Shelling out with `codex exec`

`codex exec` is Codex's supported non-interactive interface for scripts and CI. It streams progress to stderr and prints the final response to stdout. `--json` changes stdout to JSONL events including `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, item events, and errors. A past run can be continued with `codex exec resume <SESSION_ID>`. [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)

This is useful for a one-shot worker, but it is less convenient than an RPC client for an interactive review loop. A supervisor can launch it in a persistent PTY, retain the session identifier, consume JSONL, and send a later follow-up through `resume`. The parent still must monitor the child process or event stream; the command does not independently wake a suspended parent agent.

In this current Codex environment, a long-running shell command returns a session identifier. The parent can poll or write to it and can wait on yielded execution, but no generic shell process can push a collaboration mailbox event by itself. Consequently, an external Pi worker needs one of these arrangements:

- keep its RPC process attached and read events until completion;
- poll its retained process/session at short intervals;
- have a small supervisor translate Pi completion events into a state the parent checks.

## Codex SDK

OpenAI recommends the Codex SDK for automated jobs and CI. The TypeScript SDK can start, continue, and resume local Codex threads. The Python SDK controls the local app-server over JSON-RPC and supports per-turn sandbox changes, which is useful for switching an implementation thread from workspace-write to read-only review. [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)

Use the SDK when building a durable orchestration program rather than manually supervising a handful of tickets. It is a better abstraction than raw JSON-RPC when the required operations are simply start thread, run prompt, continue thread, and retrieve the final response.

## Codex app-server JSON-RPC

`codex app-server` is intended for deep client integrations that manage authentication, history, approvals, and streamed events. It uses bidirectional JSON-RPC 2.0 over newline-delimited stdio by default; WebSocket and Unix-socket transports are also described, although WebSocket transport is experimental and unsupported for production. OpenAI says to use the SDK instead for ordinary job automation. [Codex App Server](https://learn.chatgpt.com/docs/app-server)

The app-server exposes the lifecycle an orchestrator would need:

- `thread/start`, `thread/resume`, `thread/read`, and `thread/list` for persistent workers;
- `turn/start` to assign or continue work;
- `turn/steer` to append feedback while a turn is active;
- `turn/interrupt` to stop an active turn;
- `review/start` for an explicit review pass;
- `turn/diff/updated`, item events, and `turn/completed` for live monitoring and completion detection.

After starting or resuming a thread, the client must keep reading the active transport. `turn/completed` reports `completed`, `interrupted`, or `failed`, and failures carry error details. This event stream is the closest documented Codex equivalent to a worker "waking" its orchestrator: the orchestrator remains alive and awaits an incoming completion event. [Codex App Server](https://learn.chatgpt.com/docs/app-server)

App-server can also send approval requests back to the client. If a non-interactive run cannot surface a new approval, the action fails instead. An unattended worker should therefore run with an explicit least-privilege sandbox and an approval policy that cannot deadlock on unavailable human input. [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) [Codex App Server](https://learn.chatgpt.com/docs/app-server)

## Notifications and wake-ups

Desktop and web notifications are user-facing alerts, not a process-to-agent orchestration API. The CLI can run an external notification program when a turn completes, but this is best treated as a human notification or an integration hook, not as proof that the parent model will automatically resume reasoning. [Notifications](https://learn.chatgpt.com/docs/notifications)

For programmatic orchestration, completion should come from the harness's event stream or child-process exit. The parent should persist at least the ticket identifier, worker thread/session identifier, starting commit, current status, and latest review outcome so it can safely recover after interruption.

## Recommended ticket loop

For each ticket whose blockers are complete:

1. Record a clean starting commit and assign exactly one write-capable worker.
2. Give the worker the issue body, repository instructions, acceptance criteria, required tests, and a prohibition on committing or pushing.
3. Monitor its native event stream or retained process until completion, failure, timeout, or a request for input.
4. Inspect the diff and run the project's checks independently of the worker's claim.
5. Run a separate read-only review against the ticket specification. OpenAI documents both specialized review subagents and app-server's `review/start`; either keeps review distinct from implementation. [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) [Codex App Server](https://learn.chatgpt.com/docs/app-server)
6. If acceptance fails, send concrete findings back into the same worker thread/session and repeat the verification step. Interrupt and replace the worker only when it is stuck, unsafe, or repeatedly fails the same criterion.
7. Once accepted, have the parent make the commit, push `dev`, and update the tracker. Then start the next unblocked ticket from the new clean commit.

This loop avoids concurrent writes, preserves context for revisions, and keeps the trust boundary clear: the worker proposes code; the orchestrator verifies and publishes it.

## Operational limits

- Multiple agents cost more tokens than a comparable single-agent run. [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- Concurrent write-heavy agents sharing a checkout can conflict; use one writer or isolated worktrees. [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- Subagents inherit permissions, so select the parent permission mode before delegation and narrow custom reviewers to read-only. [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- Non-interactive work cannot depend on approvals that no client can answer. [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- Raw app-server integration is more work than SDK use and its WebSocket transport is experimental. [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- A worker's final message is not sufficient acceptance evidence; verification should use the diff, automated checks, and the issue's visible behaviors.

## Bottom line for a Pi-based implementation

Codex's own subagent machinery is useful for independent review and repository inspection, but it should not be confused with Pi RPC. For Pi implementation workers, the clean design is a single long-lived Pi RPC process (or one process per ticket) whose event stream the parent monitors. Codex should retain the worker/session identifier, await Pi's terminal event, verify the resulting diff, send feedback through the same Pi session when needed, and only then commit and push. If Pi lacks a reliable terminal event, use child-process exit or bounded polling; desktop notifications are not an orchestration primitive.
