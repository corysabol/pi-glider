# Idea: long-lived tasks in tmux (backlog)

Status: ideation only — not implemented. Revisit when the agent needs to run long-running or
interactive tools without blocking a turn.

## Goal

Let the agent run long-lived tasks (long scans, fuzzers, interactive tools like `sqlmap` /
`msfconsole`, listeners) in detached tmux sessions so the operator can attach, view, take over,
and continue them, while the agent polls output and sends input asynchronously.

## Why (the gap)

Pi's `bash` tool is synchronous: it spawns a shell, streams stdout/stderr, and blocks until the
command exits or hits a timeout (then kills the process tree). stdin is `ignore` (no interactivity).
There is no background mode and no native terminal/PTY primitive (built-in tools: `bash`, `edit`,
`find`, `grep`, `ls`, `powershell`, `read`, `write`). So long tasks either tie up the turn or get
killed on timeout.

tmux fills the gap: run detached, return immediately, poll `capture-pane`, send `send-keys`, and
give the operator a PTY to attach to.

## Approaches

### A. Skill-only (no code)

Teach the agent tmux idioms in a skill; drive tmux via the existing `bash` tool:

- start: `tmux new-session -d -s <name> '<cmd>'`
- poll: `tmux capture-pane -p -t <name> -S -`
- interact: `tmux send-keys -t <name> '...' Enter`
- list/kill: `tmux ls` / `tmux kill-session -t <name>`

Pros: zero code. Cons: model must remember tmux CLI (error-prone), stringly-typed, no structured
args.

### B. Skill + thin helper script

`scripts/tmux.sh` with subcommands (`new`, `ls`, `capture`, `send`, `kill`) called via `bash`.

Pros: clean interface, hides flags, reviewable. Cons: still string-based, less discoverable.

### C. Pi extension (plugin)

Register `tmux_new`, `tmux_list`, `tmux_capture`, `tmux_send`, `tmux_kill` via `registerTool`
(TypeBox schemas; optionally a custom `renderResult` for a live pane view).

Pros: first-class discoverable tools, structured args, robust. Cons: most code to maintain.

## Recommendation

Incremental: validate with A (skill) first; graduate to C (plugin) if the skill proves flaky. The
skill then becomes documentation, the plugin the mechanism.

## Design considerations

- Session naming convention (e.g. `pi-<task-slug>`) so operator and agent can find sessions.
- Operator attach: tmux lives inside the container; attach from a second terminal via
  `docker exec -it <container> tmux attach -t <name>` (first terminal is Pi's TUI).
- TTY: tmux provides a PTY, enabling interactive tools and operator takeover mid-run.
- Lifecycle: tmux sessions die with the container (ephemeral, consistent with the disposable model).
- Capture: `capture-pane -S -` for full scrollback; the agent polls it to report progress.
- tmux is not in the image yet; needs `apt-get install tmux` (standard Kali package).

## Open questions

1. Operator attach from the host directly (shared tmux socket on a mounted volume) vs `docker exec`?
   (latter is simpler and version-safe)
2. tmux vs a lighter `dtach`/`abduco`? (default tmux)
3. Plugin: live-pane `renderResult` vs plain-text capture for v1?
