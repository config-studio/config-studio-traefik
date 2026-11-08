# 07 — Post-init sync

**Роль ИИ:** финальная синхронизация — computed graph + hooks + закрытие бандла + первый коммит с отмеченным baseline.

---

## Шаги

**Шаг 1 — полный analyze.**

```bash
doubled-graph analyze --mode full --force --repo .
```

Это создаёт baseline computed graph. Не инкремент, а `full`, чтобы `code-fingerprint.json` был свежим.

**Шаг 2 — синхронизация declared graph (если нужно).**

```bash
doubled-graph detect-changes --scope all --repo .
```

Если drift пустой — пропусти этот шаг (код и `.grace/graph/main.xml` согласованы — нормально для свежесгенерированного проекта).

Если drift непуст:

| Тип drift'а | Что править |
|---|---|
| `code_without_module` | Сначала `doubled-graph file show <путь> --repo .`: если `MODULE:` есть — дописать `LINKS: M-*` в файл; если нет — новый `M-*` в `.grace/graph/main.xml` + строка в `<Owns>` |
| `module_without_code` | `.grace/graph/main.xml` — реальный `<Path>` или `<Summary>` |
| `stale_crosslinks` | `.grace/graph/main.xml` — блок `<Depends>` модуля |
| `missing_verification` | `.grace/verification/main.xml` — `V-<M-id>` |
| `markup_missing` | `MODULE_CONTRACT`/`MODULE_MAP` в самом файле кода |

Правит всё это активный бандл `C-001-INITIAL-BUILD` (его `spec.xml`/`plan.xml` — источник решений), а не `docs/*.xml`. Покажи пользователю `git diff .grace/` (см. skill `doubled-graph-drift` § A — режим `migration`, артефакты догоняют код).

**Шаг 3 — lint якорей.**

```bash
grace lint --path . --format json
```

или через обёртку:

```bash
doubled-graph lint --path .
```

Должно вернуть `ok: true` и `summary.errors == 0` (rc=0). Если нет — для каждой находки (`file`, `rule`, `message`) поправь файл через `Edit` и перезапусти. Помни: у `grace lint` в 4.x JSON включается только `--format json`; флагов `--json` / `--verbose` нет.

**Шаг 4 — detect_changes (повторно).**

```bash
doubled-graph detect-changes --scope all --repo .
```

Должен быть пустой drift. Если нет:
- модули без кода → что-то не было реализовано (вернуться на 06-generate для недостающих `T-###`);
- код без модулей → что-то лишнее (дополнительные утилиты — решать с пользователем).

**Шаг 5 — установка hooks.**

```bash
doubled-graph init-hooks --all --repo .
```

Это:
- git `post-commit`,
- Claude Code PostToolUse (если `.claude/settings.json` существует),
- `.gitignore` для `.doubled-graph/logs/` и `.doubled-graph/cache/`.

**Шаг 6 — прогон тестов.**

Выполни `<Command>` **каждой** записи `V-*` из `.grace/verification/main.xml` (с указанным `<Cwd>`). Дополнительно — pre-merge набор из `<VerificationIntent>` бандла.

Если что-то не проходит — фикс, возврат к 06-generate.

Затем подтверди покрытие:

```bash
doubled-graph health --repo .
```

Ожидается: `"modules": {"without_verification": []}`, `"drift": {"total": 0}`, `"ok": true`.

**Шаг 6b — scratchpads от шагов 01–05.**

Проверь `.doubled-graph/drafts/`:
- `interview.md` — `Status: completed`?
- `plan.md` — все `Approvals` проставлены?

Если да — опционально переместить в `.doubled-graph/drafts/_archive/<дата>/` (чистый drafts + сохранена история). Рекомендация: **переместить**, не удалять. Сохраняет audit-trail зарождения проекта для будущей отладки.

**Шаг 6c — закрытие бандла.**

1. Поставь атрибут `status="applied"` у корней обоих документов бандла: `.grace/changes/active/C-001-INITIAL-BUILD/spec.xml` (`GraceChangeSpec`) и `plan.xml` (`GraceChangePlan`). Путь статуса: `draft` → `approved` (после approval gate шага 04) → `applied`. `<Status>`-элемент движок не читает — только атрибут корня.
2. Перенеси каталог в архив — только после зелёных шагов 3–6:

```bash
git mv .grace/changes/active/C-001-INITIAL-BUILD .grace/changes/archive/C-001-INITIAL-BUILD
```

Допустимые статусы и что с ними делать: `applied` / `rejected` / `cancelled` / `superseded` → в `.grace/changes/archive/`; `draft` / `approved` → остаются в `.grace/changes/active/`.

**Шаг 7 — первый коммит.**

```bash
git add -A
git commit -m "chore(init): doubled-graph baseline established

- .grace-скелет: 5 context-артефактов, graph/{index,main}.xml,
  verification/{index,main}.xml, changes/{active,archive};
- MVP кода по фазам <N>;
- бандл C-001-INITIAL-BUILD применён и заархивирован;
- hooks установлены;
- phase=post_migration.

Modules: M-AUTH-TOKENS, M-AUTH-VALIDATE, M-ROUTES-LOGIN
Verifications: V-M-AUTH-TOKENS, V-M-AUTH-VALIDATE, V-M-ROUTES-LOGIN"
```

**Шаг 8 — сводка пользователю.**

Выведи:

```
Baseline установлен.

Артефакты (.grace/):
  - context/requirements.xml — <N> целей, <K> пользователей, <M> ограничений
  - context/technology.xml — <стек одной строкой>
  - context/deployment.xml — <applicable | not-applicable>
  - graph/main.xml — <N> модулей, <D> data flows
  - verification/main.xml — <K> записей V-<M-id>
  - changes/archive/C-001-INITIAL-BUILD — применён

Код:
  - <N> файлов
  - <LOC> строк
  - computed graph: <X> символов, <Y> связей

Что дальше:
1. Проверь работу: <команда запуска из technology.xml>.
2. Для следующей фичи — заведи активный бандл `.grace/changes/active/C-002-<SLUG>/`
   (spec.xml: Goals/NonGoals/AcceptanceCriteria; plan.xml: T-###), затем approval-gate,
   затем правка кода и `.grace/graph/main.xml` (см. skill `doubled-graph-after-edit`).
3. Перед любой правкой — активируй skill `doubled-graph-before-edit` (или fallback prompts/maintenance/on-before-edit.md).

Режим: post_migration. Переключать только если начнёте крупный рефакторинг (см. methodology/drift-and-priority.md).
```

---

## Что дальше

Сообщи пользователю что новый проект завершен.

Настрой себя что дальше надо работать по `prompts/maintenance/*`:
- `on-before-edit.md` перед правками;
- `on-after-edit.md` после;
- `on-drift-detected.md` если `detect-changes` обнаружил расхождение;
- `on-user-manual-edit.md` если код правил человек вручную.
