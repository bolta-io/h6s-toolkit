#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInstall, TARGETS } from '../src/install.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');

const HELP = `headless AI Toolkit — Claude plugin / Agent skill / MCP server bundle

Usage:
  h6s-toolkit <command>

Commands:
  path                       toolkit 설치 디렉토리 출력 (개발/디버깅용)
  list                       포함된 plugin / skill / MCP 서버 요약
  version                    버전 출력
  install --target=<t>       플랫폼별 설치 (target: ${TARGETS.join(' | ')})
    [--uninstall]            제거
    [--dry-run]              실제 변경 없이 무엇을 할지 출력만

Targets:
  cursor          ~/.cursor/mcp.json 에 mcpServers.h6s 깊은 병합
  gemini          ~/.gemini/extensions/h6s-data/ 에 매니페스트 + skills 복사
  mcp             stdout 으로 MCP 클라이언트용 .mcp.json 스니펫 출력
  claude-manual   ~/.claude/plugins/h6s-data/ 에 plugin + skills 복사 (Claude Code 의 /plugin install 안 쓰는 환경)

Claude Code 권장 흐름:
  /plugin marketplace add bolta-io/h6s-toolkit
  /plugin install h6s-data@h6s
`;

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(PKG_ROOT, rel), 'utf8'));
}

function cmdPath() {
  process.stdout.write(PKG_ROOT + '\n');
}

function cmdVersion() {
  const pkg = readJson('package.json');
  process.stdout.write(`${pkg.name} v${pkg.version}\n`);
}

function cmdList() {
  const plugin = readJson('.claude-plugin/plugin.json');
  const market = readJson('.claude-plugin/marketplace.json');
  const mcp = readJson('.mcp.json');

  process.stdout.write(`marketplace: ${market.name}\n`);
  process.stdout.write(`plugin:      ${plugin.name} v${plugin.version}\n`);
  process.stdout.write(`description: ${plugin.description}\n\n`);

  process.stdout.write('skills:\n');
  for (const p of market.plugins ?? []) {
    process.stdout.write(`  - skills/${p.name}/SKILL.md\n`);
  }

  process.stdout.write('\nmcp servers:\n');
  for (const [name, cfg] of Object.entries(mcp.mcpServers ?? {})) {
    const cmd = [cfg.command, ...(cfg.args ?? [])].join(' ');
    process.stdout.write(`  - ${name}: ${cmd}\n`);
  }
}

function parseInstallArgs(argv) {
  const opts = { target: null, dryRun: false, uninstall: false };
  for (const arg of argv) {
    if (arg.startsWith('--target=')) opts.target = arg.slice('--target='.length);
    else if (arg === '--target') opts.target = '';
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--uninstall') opts.uninstall = true;
    else throw new Error(`알 수 없는 옵션: ${arg}`);
  }
  if (!opts.target) {
    throw new Error(`--target=<t> 필요. 가용: ${TARGETS.join(' | ')}`);
  }
  return opts;
}

function cmdInstall(rest) {
  if (rest.includes('--help') || rest.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }
  const opts = parseInstallArgs(rest);
  const result = runInstall({ toolkitRoot: PKG_ROOT, ...opts });
  for (const a of result.actions) process.stderr.write(`  · ${a}\n`);
  if (opts.target === 'mcp' && result.snippet) {
    process.stdout.write(JSON.stringify(result.snippet, null, 2) + '\n');
  }
  if (opts.dryRun) process.stderr.write('\n(dry-run — 실제 파일 변경 없음)\n');
}

const cmd = process.argv[2];
const rest = process.argv.slice(3);
try {
  switch (cmd) {
    case 'path':
      cmdPath();
      break;
    case 'version':
    case '--version':
    case '-v':
      cmdVersion();
      break;
    case 'list':
      cmdList();
      break;
    case 'install':
      cmdInstall(rest);
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      process.stdout.write(HELP);
      break;
    default:
      process.stderr.write(`알 수 없는 명령: ${cmd}\n\n${HELP}`);
      process.exit(64);
  }
} catch (e) {
  process.stderr.write(`오류: ${e.message}\n`);
  process.exit(1);
}
