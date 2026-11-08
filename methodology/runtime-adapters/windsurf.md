# Runtime adapter: Windsurf (Codeium)

## 1. MCP

Windsurf поддерживает MCP (stdio + SSE) с 2025. Конфиг: `~/.codeium/windsurf/mcp_config.json`.

## 2. Регистрация `doubled-graph`

```json
{
  "mcpServers": {
    "doubled-graph": {
      "command": "python",
      "args": ["-m", "doubled_graph"],
      "cwd": "/абсолютный/путь/репо"
    }
  }
}
```

> **Важно:** Windsurf запускает MCP-серверы в контексте, где `cwd` = домашняя директория по умолчанию, не корень репо. Всегда указывай `cwd` явно.

## 3. Rules / Cascade

Windsurf использует Cascade agents с `.windsurfrules` / `global_rules.md`. Добавь общие инструкции doubled-graph в `.windsurfrules`:

```markdown
# doubled-graph agent rules

1. Перед любой правкой — `doubled-graph.impact(target=...)`
2. Перед commit — `doubled-graph.detect_changes(scope="staged")`
3. Режим из AGENTS.md phase-блока определяет drift resolution: post_migration — спрашивай user, migration — обновляй артефакты автоматом
```

## 4. Hooks

Windsurf hooks — ограниченные; нет прямого аналога Claude Code PostToolUse. Baseline `post-commit` обязателен.

## 5. Permissions

Windsurf имеет auto-accept и per-command approval. Аналогично Cursor (см. `cursor.md §5`).

## 6. Установка за 90 секунд

```bash
pipx install doubled-graph
bun add -g @osovv/grace-cli
doubled-graph init-hooks --post-commit
# Отредактировать ~/.codeium/windsurf/mcp_config.json (§2)
# Перезапустить Windsurf
```

## 7. Skills

`doubled-graph setup` записывает все наши skills как блок `<!-- doubled-graph-skills:start --> ... <!-- doubled-graph-skills:end -->` в `.windsurfrules` (Windsurf читает один файл, всегда; on-demand discovery нет). Семейство — `-guide`, `-before-edit`, `-after-edit`, `-drift`, `-manual-edit`, `-refactor`, `-verify`. См. `methodology/tools.md §1`.

Workflow методологии (refresh / plan / execute / fix / refactor / verification) исполняется по нашим скилам через Cascade `Read`/`Edit`/`Write`/`Bash` — не как отдельные subprocess-команды.

## 8. Заметки

- Cascade workflow tends to generate many tool calls in a single turn; MCP tool quota по умолчанию — мягкий. Смотри через logs в `.doubled-graph/logs/` — если count analyze-калла растёт линейно с правками, всё нормально.
- Windsurf Web (remote) — без локального MCP-сервера не работает. Локальный клиент обязателен.
