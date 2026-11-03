# session-address

A Claude Code mod for Claude Desktop. It adds a **⧉ Copy session** button to the
prompt footer of every desktop session. One click copies a line like

    Peer session "<title>" has the id local_...

Paste it into another session and that session reaches this one with
`SendMessage` to the `local_...` id directly, with no search through ListAgents
and no guessing between sessions with similar titles.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install session-address --marketplace ashnurkoff/claude-session-address
```

From a shell:

```bash
claude plugin install session-address --marketplace ashnurkoff/claude-session-address
```

In the desktop app: click **+** next to the prompt box, then **Plugins**,
**Add marketplace** with `ashnurkoff/claude-session-address`, then **Add plugin**.

Installed at the user scope, the button shows in every new desktop session.
Sessions already open pick it up after `/reload-plugins` or a restart.

## Use

- **⧉ Copy session** in the footer copies the line; the button reads
  **✓ Copied** for a moment.
- `/session-address` prints the same line in the chat, for a surface the
  clipboard does not reach (the phone over Remote Control).

Copy goes through the desktop's clipboard, falling back to `pbcopy` on macOS.
Terminal sessions and `claude -p` runs keep their footer as it is.

## How it works

The desktop app addresses a session by its `local_...` id, which it hands the
session in `CLAUDE_CODE_HOST_SESSION_ID`. The mod reads that id, asks the app
for the session's title, and draws its button in the footer through a
`ui.render` hook on `SessionMode`. Hooks modules are an early-access part of
Claude Code, so a later release may change how the footer draws.

## What the mod does on its own

Nothing leaves your machine. The mod has no network calls of its own and
sends nothing to any server.

- **Reads:** the `CLAUDE_CODE_HOST_SESSION_ID` environment variable (this
  session's `local_...` id) and, in a terminal session, the session's own id.
  It does not read the conversation.
- **Calls a tool itself:** the Claude Desktop app's local `ccd_session_mgmt`
  server, tool `get_session` with `session_id: "self"`, to read this session's
  title. It calls it when the session starts, after each turn (to catch a
  rename), and when you press the button or run `/session-address`. Only in a
  desktop session; a terminal or `claude -p` run never calls it.
- **Writes:** the copied line, to the desktop's clipboard, or into the chat for
  `/session-address`.
- **Starts a program:** only `/usr/bin/pbcopy` on macOS, with the copied line on
  its standard input, and only when the desktop's own clipboard does not take
  the copy.

The hooks it adds:

- `session.start` registers the `/session-address` command and, in a desktop
  session, reads the title.
- `command.run` answers its own `/session-address` command alone, printing the
  line; every other command passes through untouched.
- `turn.complete` reads the title again and passes the turn's result on
  unchanged.
- `ui.render` on `SessionMode` draws the footer's mode labels as they are, plus
  the button, on the desktop surface only; everywhere else the footer is the
  engine's own.

## License

MIT
