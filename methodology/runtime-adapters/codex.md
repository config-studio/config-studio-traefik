# Runtime adapter: Codex (OpenAI)

## 1. MCP

OpenAI Codex CLI и Codex Web поддерживают MCP (spec-2025-03-26 на апрель 2026). Транспорт stdio.

Конфиг: `~/.codex/mcp.json` (глобально) или `.codex/mcp.json` в репо.

## 2. Регистрация `doubled-graph`

`.codex/mcp.json`:

```json
{
  "mcpServers": {
    "doubled-graph": {
      "command": "python",
      "args": ["-m", "doubled_graph"]
    }
  }
}
```

## 3. Rules / instructions

Codex читает `AGENTS.md` в корне репо. Содержимое `AGENTS.md`, созданное при bootstrap'е проекта (см. `prompts/new-project/02-requirements.md`), Codex воспримет нативно.

Наш `phase`-блок `<!-- doubled-graph:phase:start -->` для Codex — прозрачный комментарий (не интерпретируется как инструкция). Парсит его только `doubled-graph`. ✓

Дополнительные промпты (наши из Phase 3) — через `~/.codex/prompts/` (custom slash-команды).

## 4. Hooks

**Codex hooks — ограниченные.** На 2026-04: только OnSessionStart и custom preprocessor на tool responses (не равно PostToolUse).

**Митигация** — та же, что в Cursor (см. `cursor.md §4`): полагаемся на `post-commit` baseline и на явный вызов `analyze` в промптах.

## 5. Permissions UI

Codex имеет approval mode (suggest / auto-edit / full-auto):
- **suggest**: каждая правка подтверждается — default, рекомендуется для режима `migration`.
- **auto-edit**: авто-применение mut-tools с approval только на shell.
- **full-auto**: минимум approval — **не рекомендуется** для doubled-graph без строгого gate в CI.

## 6. Установка за 60 секунд

```bash
pipx install doubled-graph
bun add -g @osovv/grace-cli
doubled-graph init-hooks --post-commit
# создать .codex/mcp.json (§2)
codex  # или codex-web
```

## 7. Skills

Codex не имеет native skill-системы — он читает `AGENTS.md` как always-on system prompt. Наши workflow'ы живут как SKILL.md в `.claude/skills/` (Claude Code), `.cursor/rules/` (Cursor), `.continue/rules/` (Continue), `.roo/rules/`, `.kilocode/rules/`, `.opencode/rules/`, `.windsurfrules`. Для Codex `doubled-graph setup` ничего специфичного не пишет — рекомендация: добавь в `AGENTS.md` одну строку «Use the doubled-graph methodology; full skills in `.claude/skills/doubled-graph-*/SKILL.md` (read on demand)», чтобы Codex знал куда смотреть.

Workflow методологии (refresh / plan / execute / fix / refactor / verification) исполняется агентом по нашим SKILL.md через `Read`/`Edit`/`Write`/`Bash` — не как отдельные subprocess-команды.

## 8. Ограничения

- Codex из web-интерфейса работает в ephemeral sandbox — доступ к локальному MCP-серверу невозможен. Используй Codex CLI локально.
- Codex full-auto с OpenAI frontier моделями не всегда соблюдает 10 принципов — требуется explicit reminder в `AGENTS.md`.
