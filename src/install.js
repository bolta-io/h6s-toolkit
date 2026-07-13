// ESM, no TS — 작은 install/uninstall 라우터.
// PR-C3: target=cursor / gemini / mcp / claude-manual
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const MCP_SERVER_NAME = 'h6s';
const MCP_SERVER_CONFIG = {
  command: 'npx',
  args: ['-y', '@h6s-ai/cli', 'mcp'],
};

export const TARGETS = ['cursor', 'gemini', 'mcp', 'claude-manual'];

/**
 * @param {Object} args
 * @param {string} args.toolkitRoot - packages/ai-toolkit 의 절대 경로
 * @param {string} args.target
 * @param {boolean} [args.dryRun]
 * @param {boolean} [args.uninstall]
 * @param {string} [args.home] - 테스트용 HOME override
 * @returns {{actions: string[]}}
 */
export function runInstall(args) {
  const home = args.home ?? homedir();
  const dryRun = Boolean(args.dryRun);
  const uninstall = Boolean(args.uninstall);
  const ctx = { toolkitRoot: args.toolkitRoot, home, dryRun, uninstall };

  if (!TARGETS.includes(args.target)) {
    throw new Error(`알 수 없는 target: ${args.target}. 가용: ${TARGETS.join(', ')}`);
  }

  if (args.target === 'cursor') return installCursor(ctx);
  if (args.target === 'gemini') return installGemini(ctx);
  if (args.target === 'mcp') return installRawMcp(ctx);
  return installClaudeManual(ctx);
}

function installCursor(ctx) {
  const path = join(ctx.home, '.cursor', 'mcp.json');
  const actions = [];
  const current = readJsonOr(path, { mcpServers: {} });
  current.mcpServers ??= {};

  if (ctx.uninstall) {
    if (current.mcpServers[MCP_SERVER_NAME]) {
      delete current.mcpServers[MCP_SERVER_NAME];
      actions.push(`remove mcpServers.${MCP_SERVER_NAME} from ${path}`);
      writeJson(path, current, ctx.dryRun, actions);
    } else {
      actions.push(`no-op (mcpServers.${MCP_SERVER_NAME} 없음)`);
    }
    return { actions };
  }

  // Cursor mcp.json 은 command 가 있으면 stdio 로 자동 분기 — type 필드는 정의에 없음
  current.mcpServers[MCP_SERVER_NAME] = { ...MCP_SERVER_CONFIG };
  actions.push(`merge mcpServers.${MCP_SERVER_NAME} into ${path}`);
  writeJson(path, current, ctx.dryRun, actions);
  return { actions };
}

function installGemini(ctx) {
  const dir = join(ctx.home, '.gemini', 'extensions', 'h6s-data');
  const actions = [];

  if (ctx.uninstall) {
    if (existsSync(dir)) {
      actions.push(`remove ${dir}`);
      if (!ctx.dryRun) rmSync(dir, { recursive: true, force: true });
    } else {
      actions.push(`no-op (${dir} 없음)`);
    }
    return { actions };
  }

  // gemini-extension.json + skills/ 만 복사 (toolkit 의 .claude-plugin 등은 Gemini 가 무시)
  if (!ctx.dryRun) mkdirSync(dir, { recursive: true });
  actions.push(`mkdir -p ${dir}`);

  const manifestSrc = join(ctx.toolkitRoot, 'gemini-extension.json');
  const manifestDst = join(dir, 'gemini-extension.json');
  if (!ctx.dryRun) cpSync(manifestSrc, manifestDst);
  actions.push(`copy gemini-extension.json → ${manifestDst}`);

  const skillsSrc = join(ctx.toolkitRoot, 'skills');
  const skillsDst = join(dir, 'skills');
  if (existsSync(skillsSrc)) {
    if (!ctx.dryRun) cpSync(skillsSrc, skillsDst, { recursive: true });
    actions.push(`copy skills/ → ${skillsDst}`);
  }

  return { actions };
}

function installRawMcp(ctx) {
  const snippet = {
    mcpServers: {
      [MCP_SERVER_NAME]: { ...MCP_SERVER_CONFIG },
    },
  };
  const actions = ['print MCP snippet to stdout'];
  if (ctx.uninstall) {
    actions[0] = 'no-op (raw MCP target 은 uninstall 대상 디렉토리 없음 — 사용자 클라이언트의 설정에서 직접 제거)';
    return { actions, snippet: null };
  }
  return { actions, snippet };
}

function installClaudeManual(ctx) {
  // /plugin install 을 안 쓰는 환경 — 사용자가 직접 ~/.claude/plugins/h6s-data/ 에 넣는 형태.
  const dir = join(ctx.home, '.claude', 'plugins', 'h6s-data');
  const actions = [];

  if (ctx.uninstall) {
    if (existsSync(dir)) {
      actions.push(`remove ${dir}`);
      if (!ctx.dryRun) rmSync(dir, { recursive: true, force: true });
    } else {
      actions.push(`no-op (${dir} 없음)`);
    }
    return { actions };
  }

  if (!ctx.dryRun) mkdirSync(dir, { recursive: true });
  actions.push(`mkdir -p ${dir}`);

  for (const rel of ['.claude-plugin', 'skills', '.mcp.json']) {
    const src = join(ctx.toolkitRoot, rel);
    const dst = join(dir, rel);
    if (!existsSync(src)) continue;
    if (!ctx.dryRun) cpSync(src, dst, { recursive: true });
    actions.push(`copy ${rel} → ${dst}`);
  }

  return { actions };
}

function readJsonOr(path, fallback) {
  if (!existsSync(path)) return structuredClone(fallback);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return structuredClone(fallback);
  }
}

function writeJson(path, value, dryRun, actions) {
  if (dryRun) {
    actions.push(`[dry-run] would write ${path}`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  actions.push(`wrote ${path}`);
}
