# 06 — Validation gates

**Роль ИИ:** прогнать финальные проверки, помочь пользователю переключиться в `post_migration`.

---

## Чек-лист завершения миграции

Миграция считается **завершённой**, когда **все пункты** ниже — зелёные:

### Чек 1. Lint якорей и артефактов полностью проходит.

```bash
grace lint --path . --format json
```

или через обёртку:

```bash
doubled-graph lint --path .
```

Exit code = 0 и `summary.errors == 0`. Если нет — вернись на 04-markup-codebase, найди файл с ошибкой, почини якоря. Помни: у `grace lint` в 4.x JSON включается только `--format json`, флагов `--json` / `--verbose` нет; rc=0 сам по себе не означает «чисто», смотри итоговый JSON.

Если движок отвечает `project.grace3-detected` — миграция не выполнена: вернись на 02-reconstruct-intent, ветка (б), `doubled-graph migrate apply --repo .`.

Если ошибка — `markup.module-map-missing`, а warning — `verification.placeholder`, это не сломанные якоря, а **незакрытые содержательные пробелы**: выполни `prompts/upgrade-methodology/01-content-gaps.md` и вернись к чеку 1.

### Чек 2. `doubled-graph detect-changes --scope all` → пусто.

```bash
doubled-graph detect-changes --scope all --repo .
```

drift должен быть `{ code_without_module: [], module_without_code: [], stale_crosslinks: [], missing_verification: [], markup_missing: [] }`.

**Исключения, разрешённые для завершения миграции:**
- `missing_verification` для модулей с `<Priority>low</Priority>` (helper) — допустимо;
- `missing_verification` для модулей, явно помеченных `pending-to-write` в `.grace/verification/main.xml` — допустимо с записью в DRIFT.md.

Всё остальное — **не** допустимо. Вернись на соответствующий шаг.

### Чек 3. Все критические `V-<M-id>` заполнены и прогоняются.

```bash
# для каждой записи с Priority=high из .grace/verification/main.xml:
<command из записи>
```

Должны проходить. Запись без `Command`/`Scenario`/`TestFiles` даёт warning `verification.placeholder` — для `Priority=high` это блокер; заполнение таких записей — `prompts/upgrade-methodology/01-content-gaps.md`. Сверить саму запись: `doubled-graph verify V-<M-id> --repo .`.

### Чек 4. `.grace`-покрытие полное и согласованное.

- `.grace/context/requirements.xml` — заполненные `<Goals>`/`<Users>`/`<Constraints>`, без placeholder-текста;
- `.grace/context/technology.xml` — не `unknown` в `<Language>`/`<Runtime>`;
- `.grace/context/deployment.xml` и `ux-guidelines.xml` — `<Applicability>applicable|not-applicable</Applicability>`, и при `not-applicable` обязателен `<Reason>`;
- `Owns` в `.grace/graph/index.xml` и `.grace/verification/index.xml` перечисляет ровно те якоря, что объявлены в документах;
- каталоги `.grace/changes/active/` и `.grace/changes/archive/` существуют (иначе `project.missing-change-directory`).

Быстрая сводка:

```bash
doubled-graph health --repo .
```

Ожидается `"artifacts": {"project_kind": "grace4"}`, `"modules": {"without_verification": []}` (кроме разрешённых исключений), `"drift": {"total": 0}`.

### Чек 5. `docs/DRIFT.md` пересмотрен.

Каждая запись обязана быть в одном из двух состояний — проверяется по файлу, без суждения:
- `resolved` — закрыта с датой и причиной;
- `accepted` — известное ограничение с owner и deadline.

Записи со `status: unknown` или без статуса — блокер. Действуй в этом порядке: (1) закрой как `resolved` с датой и причиной, если `doubled-graph detect-changes --scope all --repo .` больше не показывает проблему; (2) иначе переведи в `accepted` с owner (автор затронутого файла из `git log -1 --format=%ae <file>`) и deadline ≤ 7 дней.

### Чек 6. Hooks установлены.

```bash
doubled-graph init-hooks --all --repo .
```

### Чек 6b. Scratchpads из шагов 01–05 проверены.

Все файлы в `.doubled-graph/drafts/`:
- `discover.md` — `Status: completed`?
- `intent-recovery.md` — `Status: completed`?
- `plan-draft.md` — все модули в `Status: committed`?
- `markup-progress.md` — все модули `committed` или явно `skipped → DRIFT.md`?

Если статусы in-progress или pending — миграция не закончена, возврат на соответствующий шаг.

**Cleanup после успешного переключения phase:** переместить завершённые scratchpads в `.doubled-graph/drafts/_archive/<дата>/` — это обязательный шаг, а не выбор. Удалять их запрещено: scratchpads фиксируют историю миграции (постмортем, аудит).

### Чек 6c. Бандл миграции закрыт.

1. У корня `.grace/changes/active/C-001-LEGACY-MARKUP/spec.xml` поставь атрибут `status="applied"` (и такой же атрибут у `GraceChangePlan` в `plan.xml`).
2. Приведи `<ObservedWriteScope>` в `plan.xml` к фактически изменённым путям.
3. Перенеси каталог в архив:

```bash
git mv .grace/changes/active/C-001-LEGACY-MARKUP .grace/changes/archive/C-001-LEGACY-MARKUP
```

Статусы `applied` / `rejected` / `cancelled` / `superseded` живут в `archive/`; `draft` / `approved` — в `active/`.

### Чек 7. CI обновлён (если был).

Добавлены в CI:
- `doubled-graph lint --path .`;
- `doubled-graph analyze --mode full --repo .` + `doubled-graph detect-changes --scope compare --base-ref main --repo .`.

Если их нет — добавь. Готовых шаблонов в `methodology/ci-templates/` пока нет (директория зарезервирована под будущий релиз); собери по инструкции из `docs/HOOKS.md § 4 CI-шаблон` — там описан baseline-flow для GitHub Actions / GitLab CI.

---

## Legacy-документы (`docs/*.xml`)

Миграция их **не удаляла и не переписывала**. Проверь, что это так:

```bash
git status --short docs/
```

Должно быть пусто (никаких изменений/удалений в `docs/`). Если появились — откати (`git checkout -- docs/`): источник истины теперь `.grace/`, а legacy — история.

**Архивация — отдельное решение пользователя** (не часть миграции). Порядок, если пользователь решил убрать:

1. явный вопрос: «Архивируем legacy `docs/*.xml`? Предлагаю `git mv` в `docs/legacy-grace3/` — файлы останутся в истории репозитория, но выйдут из активной работы»;
2. после «да» — отдельный коммит:

   ```bash
   mkdir -p docs/legacy-grace3
   git mv docs/requirements.xml docs/technology.xml docs/development-plan.xml \
          docs/knowledge-graph.xml docs/verification-plan.xml docs/operational-packets.xml \
          docs/legacy-grace3/
   git commit -m "chore(docs): archive legacy GRACE 3 artifacts (superseded by .grace/)"
   ```

3. `docs/DRIFT.md` остаётся на месте — его читает `doubled-graph health`.

Без явного «да» — ничего не перемещай и не удаляй.

---

## Переключение phase

Когда все чеки зелёные:

```bash
doubled-graph phase set post_migration \
  --reason "migration complete: .grace artifacts ready, all M-* have V-<M-id>, lint clean, detect-changes empty" \
  --repo .
```

Инструмент правит блок в `AGENTS.md` и создаёт коммит:

```
chore(phase): migration → post_migration

reason: migration complete: .grace artifacts ready, all M-* have V-<M-id>, lint clean, detect-changes empty
scope-all-detect_changes: clean
grace-lint: clean
critical-V-M-*-pass: <N>/<N>
```

**Approval пользователя — обязательный** перед переключением. Покажи ему чек-лист с галочками, явно запроси «переключаем?»

---

## Что дальше

После переключения:
- режим `post_migration` — артефакты `.grace` теперь ground-truth;
- любая правка идёт через `prompts/maintenance/on-before-edit.md`;
- если `detect-changes` находит расхождение — `prompts/maintenance/on-drift-detected.md § B` (с пользователем решают);
- если что-то срочно и код надо обновить быстрее артефактов — временно переключись в `migration` с записью в DRIFT.md (см. `methodology/drift-and-priority.md § Переключение режима`).

---

## Известные паттерны «почти готово, но нет»

- **«ещё одну фичу доделаю, потом закрою миграцию».** Анти-паттерн. Закрой миграцию, потом добавляй фичу по обычному post_migration-циклу (через бандл `C-002-…`). Иначе миграция станет бесконечной.
- **«тесты пишу завтра».** `pending-to-write` с deadline > 7 дней — блокер. Правило: сначала написать тест и получить rc=0; только если тест объективно невозможен (сторонний сервис без mock-инфраструктуры) — `accepted`-запись в `DRIFT.md` с owner и deadline ≤ 7 дней.
- **«эти deprecated-модули я скоро удалю».** В режиме `post_migration` удаление — это новое требование: нужен бандл `C-*` (`spec.xml` с `NonGoals`/`AcceptanceCriteria`) + approval-gate. В миграции удалять можно, **после** того как убедишься, что не нужны (`doubled-graph impact <symbol> --direction both --repo .` → `direct[]` пуст).

---

## Переход

Сообщи пользователю что миграция завершена.

Настрой себя что дальше надо работать по `prompts/maintenance/*`:
- `on-before-edit.md` перед правками;
- `on-after-edit.md` после;
- `on-drift-detected.md` если `detect-changes` обнаружил расхождение;
- `on-user-manual-edit.md` если код правил человек вручную.
