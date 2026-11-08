# on-after-edit — после правки, до коммита

**Целевая аудитория:** ИИ-ассистент.
**Триггер:** только что сохранён изменённый файл.

---

## Канонический workflow — skill `doubled-graph-after-edit`

`doubled-graph setup` устанавливает skill `doubled-graph-after-edit` (см. `.claude/skills/doubled-graph-after-edit/SKILL.md` в твоём репо или эквиваленты для Cursor/Roo/Kilo/etc). Skill активируется по триггеру `description` в Claude Code и Cursor; в Roo / Kilo / Continue / Windsurf / OpenCode `setup` устанавливает его как always-on rule.

Этот промпт-файл — fallback для ситуаций когда skill не загружен (старый клиент, ручной режим). Логика идентична skill'у.

---

## Шаги (краткая форма)

**1. Обновить computed graph для тронутых файлов** (если в IDE нет PostToolUse hook):

```bash
doubled-graph analyze --mode incremental --paths <тронутые-файлы> --repo .
```

**2. Обновить активный бандл и `.grace` — если правка семантическая.**

Семантическая = изменение публичных экспортов модуля, новая зависимость от другого `M-*`, изменение поведения, влияющего на `V-<M-id>`.

- Бандл: `.grace/changes/active/C-<NNN>-<SLUG>/`
  - `spec.xml` — атрибут `status` у корня `GraceChangeSpec` (`draft` → `approved` → `applied`), при необходимости правка `Goals`/`AcceptanceCriteria`/`AffectedAreas`/`VerificationIntent`;
  - `plan.xml` — атрибут `status` у корня `GraceChangePlan` и фактически изменённые пути в `<ObservedWriteScope>` (задачи `T-###` статуса не имеют).
- `.grace/graph/main.xml` — у своего `M-*`: `<Status>`, `<Path>`, `<Summary>`, `<Depends>` под новую реальность. Новый якорь (`M-*`/`DF-*`) — строкой в `<Owns>` `.grace/graph/index.xml`.
- `.grace/verification/main.xml` — `V-<M-id>`: обнови `<Command>`, `<TestFiles>`, `<Scenario>`, `<Marker>`, `<TraceAssertion>`, если правка изменила проверку.
- `.grace/context/technology.xml` — только если добавил/сменил библиотеку (и только с approval).

Baseline перед правкой бери из `doubled-graph module show <M-id> --with-verification --repo .`.

**3. Drift check:**

```bash
doubled-graph detect-changes --scope staged --repo .
```

- `drift` пуст → продолжай.
- `drift` непуст → перейди на `on-drift-detected.md` (skill `doubled-graph-drift`).

**4. Lint якорей и артефактов:**

```bash
doubled-graph lint --path .
```

Прямой вызов движка — `grace lint --path . --format json` (флагов `--json` / `--verbose` в 4.x нет).

| Ответ | Действие |
|---|---|
| rc=0, `ok: true`, `summary.errors == 0` | продолжай шаг 5 |
| rc=1, `ok: false`, есть находки | для каждой находки (`file`, `rule`, `message`) — `Edit` файл, поправь. Перезапусти lint. **Не коммить через `--no-verify`** до чистого прогона. |
| `{"error": "GRACE_CLI_ERROR", "detail": "..."}` | grace сам упал, разбирайся отдельно (не lint findings) |
| `{"error": "GRACE_CLI_MISSING", ...}` | `grace` не установлен — `doubled-graph setup --repo .` или `bun add -g @osovv/grace-cli@4.2.1` |

**5. Релевантные тесты.** Из `.grace/verification/main.xml` найди `V-<M-id>` тронутого модуля и выполни его `<Command>` (с `<Cwd>`). Сверить запись: `doubled-graph verify V-<M-id> --repo .`. Тесты упали → останови, покажи ошибку. Не коммить сломанное.

**6. Contract-change check.** Если правка изменила сигнатуру публичного экспорта, `PURPOSE`/`SCOPE` модуля, набор `<Depends>` или `V-<M-id>` — **остановись**, покажи отдельным блоком:

```
⚠ CONTRACT CHANGE в <M-ID>:
  было: <old signature / pre-post-invariants / Depends>
  стало: <new ...>
  причина: <из задачи / из diff>
  бандл: .grace/changes/active/C-<NNN>-<SLUG>/ (spec.Status = approved?)
  callers затронуты: <из impact depth=1>
```

Жди явного подтверждения от пользователя («contract change ок», «откати» и т.п.). Без подтверждения — не коммить. Внутренние правки этого шага не требуют.

**7. Коммит.** Все четыре gate должны быть зелёные:
- `detect-changes` пусто;
- `lint` clean (`summary.errors == 0`);
- тесты прошли;
- `impact` перед правкой был не CRITICAL (или явно одобрен).

Commit-message:

```
<краткое описание изменения>

Affected: <M-ids через запятую>
Verifications: <V-M-ids через запятую>
Bundle: C-<NNN>-<SLUG>
```

Если был contract-change — добавь строку `Contract-change: <M-ID> <что>`.

**8. Закрытие бандла (если работа по нему закончена).**

1. `spec.xml` → `status="applied"` в атрибуте корня `GraceChangeSpec` (и `GraceChangePlan`), не элементом.
2. `git mv .grace/changes/active/C-<NNN>-<SLUG> .grace/changes/archive/C-<NNN>-<SLUG>`.
3. В архив уходят только `applied` / `rejected` / `cancelled` / `superseded`; `draft` / `approved` остаются в `active/`.

---

## Что коммитить, что не коммитить

**Коммитим:** изменённый код, обновлённые `.grace/**/*.xml` (graph, verification, changes), `AGENTS.md` (только через `phase set`).
**НЕ коммитим:** `.doubled-graph/cache/` (в .gitignore), `.doubled-graph/logs/` (в .gitignore), временные файлы тестов, `docs/*.xml` (legacy GRACE 3 — только чтение).

**Отдельными коммитами при больших правках:** chore-правки (rename без логики), markup-правки (только якоря в `migration` режиме).

---

## Anti-patterns

- Не коммить без `detect-changes`.
- Не коммить только `.grace/` без кода (если это не drift-resolution pass).
- Не коммить через `--no-verify`. Если gate упал — поправь проблему.
- Не смешивай правку > 1 модуля в один коммит без обоснования.
- Не заводить бандл `C-*` «на будущее»: бандл = конкретное изменение с acceptance-критериями.
