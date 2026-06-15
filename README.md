# minds — a friendly REPL for HelloMinds

A thin Node.js wrapper around [`@animocabrands/minds-cli`](https://build.hellominds.ai/docs/get-started/cli)
that gives you a `claude`-style interactive prompt to chat with your Minds: colored turns with
left-border separators, markdown/HTML rendering, a spinner while the Mind thinks, and a few slash commands.

```
────────────────────────────────────────────────────────────
Hermes  xiaomi/mimo-v2.5  ·  alias: repl-hermes
type /help for commands, /exit to quit
────────────────────────────────────────────────────────────
› hey, status update on Guillaume?

│ You
│ hey, status update on Guillaume?
  ⠋ thinking…

│ Hermes  02:30 PM
│ Here's the latest on Guillaume:
│
│ **Status:** Still waiting. Guillaume claimed he sent 1 ETH…
```

## Requirements

- Node 22+
- The official CLI on `$PATH`: `npm install -g @animocabrands/minds-cli`
- `MINDS_BUILDER_API_KEY` — see [account setup](https://build.hellominds.ai/docs/get-started/account-setup)

## API key setup

The wrapper loads `MINDS_BUILDER_API_KEY` from (in order):

1. An already-exported environment variable
2. `.env` in the current working directory
3. `.env` alongside `minds-repl.mjs` (this repo)

To persist the key for every new shell (recommended if you don't use `.env`):

```sh
echo 'export MINDS_BUILDER_API_KEY="<your-key>"' >> ~/.zshenv
```

`~/.zshenv` is read by all zsh invocations (login and non-login). You can also use `~/.zprofile`
for login shells only. The key does **not** need to live in `~/.zshrc`.

Get or rotate a key at https://build.hellominds.ai/console

## Install

The wrapper is a single self-contained file: `minds-repl.mjs`. To make it
invokable as `minds`, add one line to your `~/.zshrc`:

```sh
minds() { node ~/workspace/quidli/hellominds/minds-repl.mjs "$@"; }
```

Then `source ~/.zshrc` and run `minds`. Or call it directly:

```sh
node minds-repl.mjs
```

> Note: `/opt/homebrew/bin` is later in `$PATH` than the nvm bin where the official
> `minds` lives, so a symlink in homebrew gets shadowed. A shell function is the
> least invasive way to claim the `minds` name.

## Usage

```sh
minds                       # auto-picks if only one Mind; otherwise prompts
minds --mind Hermes         # pick by name
minds --alias main          # reuse an existing conversation alias
minds list                  # any non-REPL args pass through to the official CLI
minds doctor
minds chat list
```

### Slash commands inside the REPL

| Command         | What it does                           |
| --------------- | -------------------------------------- |
| `/exit` `/quit` | Quit the REPL                          |
| `/clear`        | Clear the screen                       |
| `/help`         | Show this list                         |
| `/who`          | Show current Mind + conversation alias |
| `/minds`        | List Minds on your account             |
| `/history [n]`  | Show last `n` messages (default 10)    |

Ctrl-C cancels the current wait-for-reply without exiting.

## How it works

- `minds list` → pick a Mind (or use `--mind <name>`)
- `minds chat create --mind <id> --alias <a>` → idempotently ensure a conversation
- On each user line: echo your message (cyan, left border), then
  `minds send <alias> "<text>" --wait --timeout 180000` and parse the `reply` field
- Mind replies use `partyType` 0 or 2 (per client lib); user messages use `partyType` 1 or `senderName === "You"`
- HTML (`<br>`, `<b>`, `<code>`, `<a>`) and basic markdown (`**bold**`, `` `code` ``, fenced blocks) render to ANSI

The wrapper finds the original `minds` binary by scanning `$PATH` and excluding
itself via `realpath`, so it can pass through any non-REPL subcommand to the
official CLI without recursing.

## Smoke test

```sh
node smoke-test.mjs
node smoke-test.mjs --mind Hermes
```

## Customizing

Edit `minds-repl.mjs`:

- Colors live in the `c` table near the top, plus `USER_COLOR`, `MIND_COLOR`, `SYS_COLOR`
- Wait timeout is `WAIT_TIMEOUT_MS` (180s)
- Spinner frames are in `startSpinner()`

## Uninstall

Remove the function from `~/.zshrc` and delete this directory. Nothing else
was installed.
