# Pi harness orchestration research

Research date: 2026-09-03

## What “Pi” means here

The requested tool is **Pi**, the minimal terminal coding harness currently maintained as
[`earendil-works/pi`](https://github.com/earendil-works/pi), not Raspberry Pi and not a Python tool. Its coding-agent package is `@earendil-works/pi-coding-agent`. Pi deliberately does not ship a built-in subagent system; process integration is one of its supported uses, through RPC mode or its TypeScript SDK. ([Pi coding-agent README](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md))

This VM has a standalone Pi executable at `/home/exedev/.local/bin/pi`, version **0.80.10**.

## Available execution modes

- Interactive mode is intended for a person in a terminal.
- Print mode (`-p`) handles a prompt and exits. It is simple but cannot support a review-and-feedback conversation with the same live worker.
- JSON mode streams events but is not an interactive control protocol.
- RPC mode (`--mode rpc`) is the supported subprocess-integration mode. It accepts commands as LF-delimited JSON on stdin and emits responses and lifecycle events as LF-delimited JSON on stdout. The SDK is preferred for an in-process TypeScript host; RPC is preferred for process isolation or a language-neutral host. ([official RPC documentation](https://pi.dev/docs/latest/rpc), [official SDK documentation](https://pi.dev/docs/latest/sdk))

For a Codex orchestrator shelling out to Pi, **RPC mode is the right fit**. It preserves a worker conversation for feedback, exposes unambiguous lifecycle events, and permits cancellation.

## RPC lifecycle and completion signaling

Start a worker from the repository working directory with a command shaped like:

```text
pi --mode rpc --provider edtechathon --model gpt-5.6-terra --thinking high --name ticket-3 --session-dir <dedicated-session-dir> --approve
```

`--approve` matters only after the repository and its project-local instructions have been reviewed and trusted. Non-interactive Pi modes cannot display the trust prompt; without a saved trust decision, the default behavior may ignore project settings, project extensions, and project skills. ([official settings documentation](https://pi.dev/docs/latest/settings#project-trust))

The supervisor then keeps stdin open and sends commands such as:

```json
{"id":"ticket-3-initial","type":"prompt","message":"<ticket implementation prompt>"}
```

The immediate `response` only means the prompt was accepted or queued. It does **not** mean the work succeeded. Failures after acceptance arrive through the event stream. ([official RPC prompting documentation](https://pi.dev/docs/latest/rpc#prompt))

The correct completion event for waking/checking the orchestrator is **`agent_settled`**, not `agent_end`. `agent_end` is a low-level run boundary and can still be followed by automatic retry, compaction recovery, or a queued continuation. `agent_settled` means no automatic retry, compaction retry, or queued continuation remains. ([official RPC event documentation](https://pi.dev/docs/latest/rpc#event-types))

Therefore, the supervisor should continuously drain stdout, write the JSONL stream to a per-ticket log, and notify/return control to the orchestrator on one of:

1. `agent_settled` — inspect results and repository state;
2. unexpected child-process exit or broken pipe — infrastructure failure;
3. an orchestrator deadline — inspect progress, then steer, abort, or replace the worker.

Pi does not independently “wake Codex.” The wake-up is the supervising process completing or emitting data when it reads `agent_settled`; Codex's own process/session wait primitive must await that supervisor. A plain background shell process without a reader or notification path is insufficient.

After settlement, use `get_last_assistant_text`, `get_state`, `get_messages`, and `get_session_stats` as needed. The repository diff and test commands remain the source of truth; a worker saying “done” is not acceptance. ([official RPC session commands](https://pi.dev/docs/latest/rpc#session))

## Feedback, cancellation, and shutdown

- Send `steer` for a correction that should be delivered after the current tool calls and before the next model call.
- Send `follow_up` for review feedback after the worker has finished its current work. A new `prompt` can also be sent while idle.
- Before aborting, send `clear_queue` if queued instructions should not run afterward; `abort` otherwise allows remaining queued messages to continue. `abort` waits for the session to become idle before acknowledging. ([official RPC prompting and abort documentation](https://pi.dev/docs/latest/rpc#prompting))
- Keep RPC transport non-TTY. A PTY can echo input into captured output, corrupting a JSONL-only parser.
- On normal completion, close stdin and wait briefly for process exit. On a stuck worker: `clear_queue`, then `abort`, then wait; escalate to process termination only if graceful cancellation fails. Record a forced termination as failure, not completion.

The stream also exposes `tool_execution_start`, `tool_execution_update`, and `tool_execution_end`, which make it possible to see whether a worker is actively testing or has stalled. `message_update` carries text/thinking/tool-call deltas; `message_end.message` is authoritative for the completed message. ([official RPC streaming documentation](https://pi.dev/docs/latest/rpc#message-update-streaming))

## Sessions and isolation

Use **one fresh Pi session per ticket**, with a descriptive `--name` and a dedicated session directory. Saved sessions can be resumed with `--session <path-or-id>` after an orchestrator restart. Pi normally stores sessions as JSONL organized by working directory and supports explicit session, fork, and session-directory flags. ([official Pi session documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session.md), [CLI reference](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md#cli-reference))

Do not allow two implementation workers to edit the same checkout concurrently. Either follow the ticket dependency frontier sequentially, as requested, or give concurrent workers separate Git worktrees and branches. Since this feature's tickets touch shared UI and storage behavior, sequential workers in the `dev` checkout are the lower-risk choice.

For each ticket:

1. Verify the checkout is clean apart from known user-owned files.
2. Start a fresh named RPC worker with the chosen model and a ticket-specific session/log.
3. Give it the full GitHub ticket, parent spec, repository instructions, acceptance expectations, and a requirement to run relevant checks.
4. Await `agent_settled` while retaining the event log.
5. Independently inspect the diff, run the checks, and manually verify visible behavior where appropriate.
6. If deficient, send precise feedback into the same session and await the next `agent_settled`.
7. If it repeatedly fails, abort and replace it with a fresh session; include concrete evidence from the failed attempt.
8. Only the orchestrator commits, pushes, and closes/updates tickets after acceptance.

This makes each ticket session disposable while keeping ownership of Git history and acceptance with the orchestrator.

## Model discovery and selection

Pi's authoritative local discovery mechanisms are:

- CLI: `pi --list-models`
- RPC: `{"type":"get_available_models"}`
- startup selection: `--provider <provider> --model <model>`
- in-session selection: `set_model`
- reasoning control: `--thinking <level>` or `set_thinking_level`

The RPC API reports that GPT-5.6 models can expose both `xhigh` and `max` thinking. ([official RPC model/thinking documentation](https://pi.dev/docs/latest/rpc#model))

Local discovery on 2026-09-03 returned:

| Provider | Model | Context | Maximum output | Reasoning | Images |
|---|---|---:|---:|---|---|
| edtechathon | `azure-gpt-5.4-mini` | 1,050,000 | 128,000 | yes | yes |
| edtechathon | `DeepSeek-V4-Pro` | 1,000,000 | 384,000 | yes | no |
| edtechathon | `gpt-5.6-luna` | 1,050,000 | 128,000 | yes | yes |
| edtechathon | `gpt-5.6-terra` | 1,050,000 | 128,000 | yes | yes |
| edtechathon | `Kimi-K2.7-Code` | 262,144 | 262,144 | yes | no |

There is no first-party public benchmark or model card located for the EdTech-a-thon-specific Terra/Luna variants. The only direct comparative input currently available is the user's statement that Terra is probably the strongest, plus Terra being this installation's default. It would be unjustified to invent detailed strengths for these variants.

Recommended assignment:

- Use **`gpt-5.6-terra` at `high`** for all eight implementation tickets. The consistency and presumed capability are more valuable than speculative per-ticket switching.
- Raise to **`max`** for the highest-integration tickets: create/persist environments (#3), resize/rotate geometry (#7), audio persistence and replacement (#8), and custom gameplay integration (#9), if `high` fails or the first review finds subtle defects.
- Use **`gpt-5.6-luna` as an independent repair/review attempt** when Terra repeatedly misses a concrete issue. This provides model diversity without pretending Luna has a documented specialty.
- Do not select DeepSeek or Kimi merely for their larger maximum output; this work benefits from visual/browser reasoning, and the local catalog marks those models as text-only.

## Important local readiness finding

The installed executable and RPC transport work: a local probe successfully returned `get_state`, listed models through `get_available_models`, and emitted the expected lifecycle sequence through `agent_settled`.

However, the probe's actual Terra prompt failed with:

```text
API key auth failed for provider edtechathon
```

The lifecycle correctly ended with `agent_end` (`willRetry: false`) and then `agent_settled`, demonstrating why the orchestrator must inspect the assistant's stop reason/error and cannot treat settlement itself as success.

**Implementation workers cannot start until the `edtechathon` provider credential is made available to the Pi process.** No relevant API-key environment variable was present in the current shell. Credential remediation should be done through Pi's supported provider/login configuration; secrets must not be placed in prompts, ticket bodies, logs, or committed files.

## Recommended orchestration shape

Use a small, repository-local **RPC supervisor**, rather than ad-hoc terminal streams:

- one Pi child process per ticket;
- strict JSONL parsing (split only on LF; the official docs specifically warn that Node's generic `readline` behavior is not protocol-compliant);
- per-ticket session and event-log locations under ignored scratch storage;
- request IDs for command-response correlation;
- structured terminal outcomes: `settled`, `process-exited`, `timed-out`, `aborted`;
- final extraction of stop reason/error and assistant text;
- graceful cancellation before forced termination.

Then let Codex launch that supervisor as a long-running command and await its completion. On `settled`, Codex performs the independent code/test review and either resumes the saved Pi session with feedback or accepts, commits, and pushes the ticket. This matches Pi's documented process-integration contract while preserving Codex as the accountable orchestrator.
