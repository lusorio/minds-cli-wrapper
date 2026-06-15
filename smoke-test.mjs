#!/usr/bin/env node
/**
 * Non-interactive smoke test: create chat, send with --wait, print parsed reply.
 * Usage: node smoke-test.mjs [--mind Hermes]
 */
import { callMinds, isMindMessage } from './minds-repl.mjs';

const mindFlag = process.argv.indexOf('--mind');
const mindName = mindFlag >= 0 ? process.argv[mindFlag + 1] : null;

async function main() {
  if (!process.env.MINDS_BUILDER_API_KEY) {
    console.error('MINDS_BUILDER_API_KEY not set (use .env or export)');
    process.exit(1);
  }

  const list = await callMinds(['list']);
  if (!list.ok || !list.items?.length) throw new Error('No minds on account');

  const mind = mindName
    ? list.items.find(m => m.name.toLowerCase() === mindName.toLowerCase())
    : list.items[0];
  if (!mind) throw new Error(`Mind not found: ${mindName}`);

  const alias = `smoke-${Date.now()}`;
  await callMinds(['chat', 'create', '--mind', mind.mindId, '--alias', alias]);

  const result = await callMinds([
    'send', alias, 'Reply with exactly: smoke-ok',
    '--wait', '--timeout', '180000',
  ]);

  if (!result.ok) throw new Error(result.error || JSON.stringify(result));
  if (!result.reply || !isMindMessage(result.reply)) {
    throw new Error('No mind reply in send --wait response: ' + JSON.stringify(result));
  }

  console.log('ok: true');
  console.log('mind:', mind.name);
  console.log('alias:', alias);
  console.log('reply.senderName:', result.reply.senderName);
  console.log('reply.partyType:', result.reply.partyType);
  console.log('reply.messageText:', result.reply.messageText);
}

main().catch(e => {
  console.error('smoke test failed:', e.message);
  process.exit(1);
});
