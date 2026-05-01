/**
 * Bots CLI.
 *
 * Usage:
 *   pnpm dev:bots -- --count 20 --mix wanderer,orbiter,clicker --seed 42 --url http://localhost:3001
 *
 * Bots are real Socket.io clients (not server-injected), so they exercise
 * the same validation, rate limiting, and logging paths a human would.
 */
import pino from 'pino';
import { ALL_BEHAVIORS, createBehavior, type BehaviorName } from './behaviors.js';
import { Bot } from './bot.js';
import { mulberry32 } from './rng.js';

interface ParsedArgs {
  count: number;
  mix: BehaviorName[];
  seed: number;
  url: string;
  tickHz: number;
  staggerMs: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args.set(key, next);
        i++;
      } else {
        args.set(key, '1');
      }
    }
  }

  const count = Number(args.get('count') ?? '8');
  // Accept commas, spaces, or both - some shells (PowerShell) eat commas.
  const mixRaw = (args.get('mix') ?? ALL_BEHAVIORS.join(','))
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const mix = mixRaw.filter((m): m is BehaviorName =>
    (ALL_BEHAVIORS as string[]).includes(m),
  );
  if (mix.length === 0) mix.push('wanderer');
  const seed = Number(args.get('seed') ?? Date.now());
  const url = args.get('url') ?? process.env.SERVER_URL ?? 'http://localhost:3001';
  const tickHz = Number(args.get('tickHz') ?? '28');
  const staggerMs = Number(args.get('staggerMs') ?? '120');
  return { count, mix, seed, url, tickHz, staggerMs };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const logger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: { svc: 'tutelary-bots' },
    transport: process.stdout.isTTY
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,svc' },
        }
      : undefined,
  });

  logger.info({ evt: 'bots.config', ...args, mix: args.mix }, 'starting bots');

  const rngSeed = mulberry32(args.seed);
  const bots: Bot[] = [];

  for (let i = 0; i < args.count; i++) {
    const behaviorName = args.mix[i % args.mix.length] ?? 'wanderer';
    const rng = mulberry32((args.seed + i * 1013904223) >>> 0);
    const behavior = createBehavior(behaviorName, rng);
    const name = `BOT_${behaviorName}_${i.toString().padStart(2, '0')}`;
    // Stable per-(seed, botId) so a `tsx watch` server restart re-attaches
    // the same bot record (combined with server dev persistence).
    const resumeToken = `bot-${args.seed}-${i}`;
    const bot = new Bot({
      url: args.url,
      botId: i,
      name,
      behavior,
      rng,
      tickHz: args.tickHz,
      logger,
      resumeToken,
    });
    bots.push(bot);
    if (args.staggerMs > 0) {
      await new Promise((r) => setTimeout(r, args.staggerMs * (0.5 + rngSeed() * 0.5)));
    }
    bot.start();
  }

  function shutdown(signal: string): void {
    logger.info({ evt: 'bots.shutdown', signal }, 'shutting down');
    for (const b of bots) b.stop();
    setTimeout(() => process.exit(0), 200);
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[tutelary-bots] fatal', err);
  process.exit(1);
});
