# doubled-graph — перед правкой кода

**Триггер:** собираешься править существующую функцию / класс / метод / файл.
**Цель:** не сломать зависимый код, не нарушить контракт модуля, дать пользователю шанс остановить опасную правку до факта.

Это обязательный risk-gate: без него правки идут «вслепую».

**Маршрут:** MCP `doubled-graph.*`; Bash — только если MCP недоступен.

## Шаг 1 — computed graph

Если с последнего `analyze` правились файлы и в IDE нет PostToolUse hook'а (`doubled-graph init-hooks`): `doubled-graph.analyze(mode="incremental", paths=["<тронутые-файлы>"])`.

## Шаг 2 — impact analysis (обязательно)

```
doubled-graph.impact(target="<символ / класс / путь>", direction="upstream", depth=3)
```

Неоднозначный символ → warning `INVALID_INPUT` с кандидатами в `detail`: покажи их, уточни `target` (`module.fn` или путь), повтори.

Ответ: `risk.level` (`NONE`/`LOW`/`MEDIUM`/`HIGH`/`CRITICAL`), `risk.reasons`, `direct`/`transitive`, `affected_modules` (`M-*`), `affected_verification` (`V-M-*`), `target_resolved.module_id`.

## Шаг 3 — интерпретация risk

| risk.level | Действие |
|---|---|
| `NONE` / `LOW` | правь без дополнительного подтверждения |
| `MEDIUM` | одной строкой: «правлю X, затрагивает N потребителей» — и продолжай |
| `HIGH` | **стоп**, покажи `risk.reasons`, жди явного «продолжай» |
| `CRITICAL` | **стоп**, покажи reasons + `affected_modules` + `affected_verification`, предложи альтернативу, жди «продолжай» |

«Молча игнорировать HIGH/CRITICAL» — анти-паттерн: пользователь должен видеть объяснение.

## Шаг 4 — режим, контракт, `.grace`

Прочитай `AGENTS.md`, блок `<!-- doubled-graph:phase:start -->`. Нет файла — default `post_migration`, предупреди.

1. `module_id` — из `impact().target_resolved.module_id`.
2. Контракт и привязка файла к модулю:

```
doubled-graph.file_show(path="<file>", contracts=true)
```

`found: false` — якорей `MODULE_CONTRACT` нет (контракт не зафиксирован; правь свободнее и заведи `M-*` через skill `doubled-graph-drift`). Связь файл↔модуль в GRACE 4 — **только** `LINKS: M-*` внутри `MODULE_CONTRACT`.

3. Правка ломает контракт (сигнатура, `Purpose`/`Summary`, экспорты, зависимости `M-*`) — это **новое требование**. **Стоп**, скажи: «Это contract change: нужен `C-*` бандл в `.grace/changes/active/C-<slug>/` (`spec.xml` `draft` → `approved`) и явное одобрение. Оформляем цикл — или правим в рамках текущего контракта?»

**`post_migration`** — артефакты = ground-truth, контракт не нарушать без `C-*`.
**`migration`** — код = ground-truth, после правки приведи `.grace` в соответствие (skill `doubled-graph-after-edit` шаг 2).

## Шаг 5 — правка

- Правишь через Edit / Write.
- **Сохрани якоря**: `MODULE_CONTRACT`, `MODULE_MAP`, `START_CONTRACT: fn` / `END_CONTRACT: fn`, `START_BLOCK_*` / `END_BLOCK_*`. Сломанные якоря ловит `lint`.
- `CHANGE_SUMMARY` / `LAST_CHANGE` в GRACE 4 не обязателен — историю изменения несёт `C-*` бандл; заполняй, если секция уже есть.

## Шаг 6 — переход

После сохранения файла активируй `doubled-graph-after-edit`. Без него правку нельзя коммитить.

## Anti-patterns

- Не править без `impact` — базовый risk-gate методологии.
- Не игнорировать HIGH/CRITICAL молча.
- Не менять `phase:` в `AGENTS.md` без просьбы пользователя.
- Не удалять якоря «потом поправлю» — `lint` блокирует коммит.
- Не утверждать «всех вызывающих починил» без повторного `impact`/`detect_changes`.

## Шпаргалка

```
BEFORE-EDIT (MCP):
1. analyze(incremental, paths=[touched])        # если нет hook
2. impact(target=X, direction="upstream", depth=3)
3. HIGH/CRITICAL -> STOP, ask user
4. read AGENTS.md phase
   post_migration: file_show(path=F, contracts=true); LINKS: M-*;
                   contract change -> C-* spec (draft->approved), ask
   migration:      свободная правка, затем .grace под факт
5. edit (якоря целы) -> goto doubled-graph-after-edit
```

## Если инструмент недоступен

- MCP нет (degraded): `doubled-graph impact <X> --direction upstream --depth 3`, `doubled-graph file show <file> --contracts`. Медленнее, результат тот же.
- `impact` упал: предупреди «оцениваю приближённо», найди вызовы grep'ом, risk консервативно = `MEDIUM`.
- `file show` недоступен: прочитай файл через Read и найди `MODULE_CONTRACT` / `CONTRACT` блоки руками.
