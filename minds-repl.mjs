#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const execFileP = promisify(execFile);

function loadDotenv() {
  if (process.env.MINDS_BUILDER_API_KEY) return;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(process.cwd(), '.env'), join(here, '.env')];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim().replace(/^export\s+/, '');
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (k && process.env[k] === undefined) process.env[k] = v;
    }
    if (process.env.MINDS_BUILDER_API_KEY) return;
  }
}

loadDotenv();

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', italic: '\x1b[3m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m',
  magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m',
  bgGray: '\x1b[100m',
};

const USER_COLOR = c.cyan;
const MIND_COLOR = c.green;
const SYS_COLOR = c.gray;
const WAIT_TIMEOUT_MS = '180000';
const SIGINT_EXIT_MS = 1000;

function findOfficialMinds() {
  const self = realpathSync(process.argv[1]);
  for (const dir of (process.env.PATH || '').split(':')) {
    if (!dir) continue;
    const p = join(dir, 'minds');
    if (!existsSync(p)) continue;
    try { if (realpathSync(p) === self) continue; } catch {}
    return p;
  }
  return null;
}

const OFFICIAL = findOfficialMinds();

export async function callMinds(args) {
  if (!OFFICIAL) throw new Error('Official @animocabrands/minds-cli not found on PATH. Install with: npm install -g @animocabrands/minds-cli');
  const { stdout } = await execFileP(OFFICIAL, args, { maxBuffer: 8 * 1024 * 1024 });
  const lastLine = stdout.trim().split('\n').filter(Boolean).pop() || '{}';
  return JSON.parse(lastLine);
}

export function isUserMessage(item) {
  return item.partyType === 1 || item.senderName === 'You';
}

export function isMindMessage(item) {
  return item.partyType === 0 || item.partyType === 2;
}

function renderHtml(s) {
  return (s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<\/?p>/gi, '')
    .replace(/<b>([\s\S]*?)<\/b>/gi, (_, x) => c.bold + x + c.reset)
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, (_, x) => c.bold + x + c.reset)
    .replace(/<i>([\s\S]*?)<\/i>/gi, (_, x) => c.italic + x + c.reset)
    .replace(/<em>([\s\S]*?)<\/em>/gi, (_, x) => c.italic + x + c.reset)
    .replace(/<code>([\s\S]*?)<\/code>/gi, (_, x) => c.cyan + x + c.reset)
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_, href, label) => c.blue + label + c.reset + c.gray + ' (' + href + ')' + c.reset)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function renderMarkdown(s, baseColor) {
  let out = s || '';
  out = out.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const body = code.replace(/\n$/, '').split('\n')
      .map(line => c.bgGray + c.gray + ' ' + line + ' ' + c.reset)
      .join('\n');
    const label = lang ? c.dim + lang + c.reset + '\n' : '';
    return '\n' + label + body + '\n';
  });
  out = out.replace(/\*\*([^*\n]+)\*\*/g, (_, x) => c.bold + x + c.reset + baseColor);
  out = out.replace(/`([^`\n]+)`/g, (_, x) => c.cyan + x + c.reset + baseColor);
  return out;
}

function renderContent(s, baseColor) {
  return renderMarkdown(renderHtml(s), baseColor);
}

function timeOf(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

function turnBorder(color) {
  return color + '│' + c.reset;
}

function printTurn({ isUser, name, text, ts }) {
  const color = isUser ? USER_COLOR : MIND_COLOR;
  const border = turnBorder(color);
  const header = c.bold + color + name + c.reset + (ts ? c.gray + '  ' + ts + c.reset : '');
  process.stdout.write('\n' + border + ' ' + header + '\n');
  const rendered = renderContent(text, color);
  for (const line of rendered.split('\n')) {
    if (line === '') {
      process.stdout.write(border + '\n');
      continue;
    }
    process.stdout.write(border + ' ' + color + line + c.reset + '\n');
  }
  process.stdout.write('\n');
}

function printUserMessage(item) {
  printTurn({
    isUser: true,
    name: item.senderName || 'You',
    text: item.messageText,
    ts: timeOf(item.createdAt),
  });
}

function printMindMessage(item, fallbackName) {
  printTurn({
    isUser: false,
    name: item.senderName || item.mindName || fallbackName || 'mind',
    text: item.messageText,
    ts: timeOf(item.createdAt),
  });
}

function startSpinner() {
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write('\r' + c.gray + '  ' + frames[i++ % frames.length] + ' thinking…' + c.reset);
  }, 90);
  return () => { clearInterval(id); process.stdout.write('\r' + ' '.repeat(20) + '\r'); };
}

function question(rl, q) {
  return new Promise(res => rl.question(q, ans => res(ans)));
}

function printMenu() {
  const lines = MENU_ACTIONS.map((action, i) =>
    `  ${c.yellow}${i + 1}${c.reset}. ${action.label}`,
  );
  console.log(SYS_COLOR + 'Options:' + c.reset);
  console.log(lines.join('\n'));
  console.log(SYS_COLOR + 'Enter a number, or press enter to cancel.' + c.reset);
}

const MENU_ACTIONS = [
  {
    label: 'Show conversation history',
    async run(ctx) {
      const raw = await question(ctx.rl, c.dim + 'How many messages? [10] › ' + c.reset);
      const n = raw.trim() || '10';
      const h = await callMinds(['history', ctx.alias, '--limit', n]);
      (h.items || []).forEach(it => {
        if (isUserMessage(it)) printUserMessage(it);
        else if (isMindMessage(it)) printMindMessage(it, ctx.mind.name);
      });
    },
  },
  {
    label: 'Clear screen',
    async run() {
      console.clear();
    },
  },
  {
    label: 'List available minds',
    async run() {
      const l = await callMinds(['list']);
      l.items?.forEach(m => console.log(`${c.bold}${m.name}${c.reset} ${c.gray}${m.model} · ${m.mindId}${c.reset}`));
    },
  },
  {
    label: 'Show current mind + alias',
    async run(ctx) {
      console.log(SYS_COLOR + `${ctx.mind.name} (${ctx.mind.mindId}) — alias ${ctx.alias}` + c.reset);
    },
  },
  {
    label: 'Quit',
    async run(ctx) {
      ctx.shouldExit = true;
    },
  },
];

async function pickMind(args) {
  let nameFlag = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mind') nameFlag = args[++i];
  }
  const list = await callMinds(['list']);
  if (!list.ok || !list.items?.length) throw new Error('No minds available on this account.');
  if (nameFlag) {
    const m = list.items.find(x => x.name.toLowerCase() === nameFlag.toLowerCase());
    if (!m) throw new Error(`No mind named "${nameFlag}". Available: ${list.items.map(x=>x.name).join(', ')}`);
    return m;
  }
  if (list.items.length === 1) return list.items[0];
  console.log(c.dim + 'Choose a mind:' + c.reset);
  list.items.forEach((m, i) => console.log(`  ${c.yellow}${i+1}${c.reset}. ${c.bold}${m.name}${c.reset} ${c.gray}(${m.model})${c.reset}`));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  while (true) {
    const ans = await question(rl, c.dim + '# > ' + c.reset);
    const idx = parseInt(ans.trim(), 10) - 1;
    if (list.items[idx]) {
      rl.close();
      return list.items[idx];
    }
    console.log(c.yellow + `Invalid choice — pick 1–${list.items.length}.` + c.reset);
  }
}

function aliasFor(args, mind) {
  for (let i = 0; i < args.length; i++) if (args[i] === '--alias') return args[++i];
  return 'repl-' + mind.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

async function sendAndWait(alias, text, mindName, abortSignal) {
  printUserMessage({ senderName: 'You', messageText: text });

  const stop = startSpinner();
  let result;
  try {
    result = await callMinds(['send', alias, text, '--wait', '--timeout', WAIT_TIMEOUT_MS]);
  } finally {
    stop();
  }

  if (abortSignal?.aborted) return null;
  if (!result.ok) throw new Error(result.error || JSON.stringify(result));
  if (result.reply && isMindMessage(result.reply)) {
    printMindMessage(result.reply, mindName);
    return result.reply;
  }
  return null;
}

async function repl(args) {
  if (!process.env.MINDS_BUILDER_API_KEY) {
    console.error(c.red + 'MINDS_BUILDER_API_KEY is not set.' + c.reset);
    console.error(c.gray + 'Fix it one of these ways:' + c.reset);
    console.error(c.gray + '  1) Persist for all new shells:  echo \'export MINDS_BUILDER_API_KEY="<key>"\' >> ~/.zshenv' + c.reset);
    console.error(c.gray + '  2) Drop a .env file (KEY=VALUE) into cwd or alongside minds-repl.mjs' + c.reset);
    console.error(c.gray + '  3) Get/rotate a key at https://build.hellominds.ai/console' + c.reset);
    process.exit(1);
  }
  if (!OFFICIAL) {
    console.error(c.red + 'Could not locate the official `minds` CLI on PATH.' + c.reset);
    console.error(c.gray + 'Install it: npm install -g @animocabrands/minds-cli' + c.reset);
    process.exit(1);
  }

  const mind = await pickMind(args);
  const alias = aliasFor(args, mind);
  await callMinds(['chat', 'create', '--mind', mind.mindId, '--alias', alias]);

  const bar = c.gray + '─'.repeat(Math.min(60, (process.stdout.columns || 60))) + c.reset;
  console.log(bar);
  console.log(c.bold + MIND_COLOR + mind.name + c.reset + c.gray + `  ${mind.model}  ·  alias: ${alias}` + c.reset);
  console.log(SYS_COLOR + 'type ? for options' + c.reset);
  console.log(bar);

  const rl = readline.createInterface({
    input: process.stdin, output: process.stdout, terminal: true,
    prompt: c.bold + USER_COLOR + '› ' + c.reset,
    historySize: 200,
  });
  const safePrompt = () => { if (!rl.closed) rl.prompt(); };
  safePrompt();

  let aborter = new AbortController();
  let awaitingMenuChoice = false;
  let busy = false;
  let lastSigintAt = 0;
  const ctx = { rl, mind, alias, shouldExit: false };

  rl.on('SIGINT', () => {
    const now = Date.now();
    const doubleTap = now - lastSigintAt < SIGINT_EXIT_MS;
    lastSigintAt = now;

    if (doubleTap) {
      ctx.shouldExit = true;
      rl.close();
      return;
    }

    if (busy) {
      aborter.abort();
      aborter = new AbortController();
    }
    awaitingMenuChoice = false;
    process.stdout.write('\r' + ' '.repeat(20) + '\r');
    console.log(c.yellow + '(interrupted — press Ctrl+C again to exit)' + c.reset);
    safePrompt();
  });

  for await (const raw of rl) {
    if (ctx.shouldExit) break;
    const line = raw.trim();

    if (awaitingMenuChoice) {
      awaitingMenuChoice = false;
      if (!line) { safePrompt(); continue; }
      const idx = parseInt(line, 10) - 1;
      const action = MENU_ACTIONS[idx];
      if (!action) {
        console.log(c.yellow + `Invalid choice: ${line}` + c.reset);
        printMenu();
        awaitingMenuChoice = true;
        safePrompt();
        continue;
      }
      busy = true;
      try {
        await action.run(ctx);
      } catch (e) {
        console.log(c.red + 'option failed: ' + e.message + c.reset);
      } finally {
        busy = false;
      }
      if (ctx.shouldExit) break;
      safePrompt();
      continue;
    }

    if (!line) { safePrompt(); continue; }

    if (line === '?') {
      printMenu();
      awaitingMenuChoice = true;
      safePrompt();
      continue;
    }

    busy = true;
    try {
      const reply = await sendAndWait(alias, line, mind.name, aborter.signal);
      if (!reply && !aborter.signal.aborted) {
        console.log(c.yellow + '(no reply in 180s — type ? and pick history to check later)' + c.reset);
      }
    } catch (e) {
      console.log(c.red + 'send failed: ' + e.message + c.reset);
    } finally {
      busy = false;
    }
    safePrompt();
  }
  rl.close();
  console.log(SYS_COLOR + 'bye.' + c.reset);
}

async function passthrough(args) {
  if (!OFFICIAL) {
    console.error('Official minds CLI not found.');
    process.exit(1);
  }
  const { spawn } = await import('node:child_process');
  const child = spawn(OFFICIAL, args, { stdio: 'inherit' });
  child.on('exit', code => process.exit(code ?? 0));
}

const isMain = process.argv[1]
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (isMain) {
  const argv = process.argv.slice(2);
  const replFlags = new Set(['--mind', '--alias']);
  const isRepl = argv.length === 0 || argv.every((a, i, arr) => replFlags.has(a) || replFlags.has(arr[i - 1]));

  if (isRepl) {
    repl(argv).catch(e => { console.error(c.red + (e.stack || e.message) + c.reset); process.exit(1); });
  } else {
    passthrough(argv);
  }
}
