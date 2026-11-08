# on-before-edit — перед любой правкой функции/класса/модуля

**Целевая аудитория:** ИИ-ассистент в IDE.
**Триггер:** намерение изменить существующий код.
**Время на исполнение:** ≤ 2 секунды если index свежий, ≤ 10 секунд если требуется инкремент.

---

## Канонический workflow — skill `doubled-graph-before-edit`

`doubled-graph setup` устанавливает skill `doubled-graph-before-edit` (см. `.claude/skills/doubled-graph-before-edit/SKILL.md` или эквиваленты для других IDE). Этот промпт-файл — fallback / навигационный пункт для случаев когда skill не загружен.

---

## Шаги (краткая форма)

**1. Обновить computed graph** (если в IDE нет PostToolUse hook):

```bash
doubled-graph analyze --mode incremental --paths <тронутые-файлы> --repo .
```

**2. Impact analysis (обязательно):**

```bash
doubled-graph impact <имя-функции|класса|путь> --direction upstream --depth 3 --repo .
```

Возвращается JSON со структурой `risk.level`, `risk.reasons`, `direct[]`, `transitive[]`, `affected_modules[]`, `affected_verification[]`, `target_resolved.module_id`.

**3. Интерпретация risk.level:**

| risk.level | Действие |
|---|---|
| `NONE` / `LOW` | Продолжай правку без подтверждения. |
| `MEDIUM` | Скажи пользователю: «правлю X, затрагивает N callers: [...]». Продолжай. |
| `HIGH` | **Останови.** Покажи `risk.reasons`. Жди явного «продолжай». |
| `CRITICAL` | **Останови.** Покажи `risk.reasons` + `affected_modules` + `affected_verification`. Предложи альтернативу. Жди явного «продолжай». |

**4. Режим, контракт и бандл.** Прочитай `AGENTS.md`, найди блок `<!-- doubled-graph:phase:start -->`.

Контракт читается из `.grace`, не из `docs/`:

1. `module_id` — строго в этом порядке: `impact` (`target_resolved.module_id`) → если пусто, `doubled-graph module find <путь> --repo .` → если пусто, `doubled-graph file show <путь> --repo .` (`MODULE:`). Первый непустой результат — истина.
2. Запись модуля: `doubled-graph module show <M-id> --with-verification --repo .` (Summary, Path, Depends, локальные файлы, `V-M-*`).
3. Сама разметка файла: `doubled-graph file show <path> --contracts --blocks --repo .` — блоки `MODULE_CONTRACT` / `CONTRACT:fn` / `BLOCK_*` без чтения всего файла (прямой вызов движка: `grace file show <path> --path . --json`).

**В `post_migration` (артефакты `.grace` = ground-truth):**

1. Сверь планируемую правку с `PURPOSE`/`SCOPE` модуля и с `CONTRACT:fn` функции.
2. Если правка **нарушает контракт** — это **новое требование**. **Останови.** Запроси у пользователя planning-цикл:
   - завести активный бандл `.grace/changes/active/C-<NNN>-<SLUG>/`:
     `spec.xml` (`<GraceChangeSpec graceVersion="4.0" status="draft">`, секции `Summary`, `Goals`, `Constraints`, `NonGoals`, `AcceptanceCriteria`, `AffectedAreas`, `VerificationIntent`) и `plan.xml` (`<GraceChangePlan graceVersion="4.0" status="draft">`, секции `IntentSummary`, `BaselineAssertions`, `TargetAssertions`, `DurableScope`, `ObservedWriteScope`, `ImplementationPlan` с задачами `T-###`);
   - approval на `spec.xml` (атрибут `status="approved"` у корня);
   - затем правишь код и `.grace/graph/main.xml` / `V-<M-id>` под новую реальность.

**В `migration` (код = ground-truth):**
- Правки разрешены свободнее.
- После правки **обязательно** `Edit` `.grace/graph/main.xml` (и `V-<M-id>`, если поменялись тесты) под новые экспорты/контракт (см. `on-after-edit.md` шаг 2).

**5. Провести правку.** Используй Edit/Write. Сохрани разметку:

- `START_MODULE_CONTRACT` / `END_MODULE_CONTRACT` — с полями `MODULE`, `PURPOSE`, `SCOPE`, `DEPENDS`, `LINKS` и парой `ROLE` ↔ `MAP_MODE`;
- `LINKS` обязан содержать `M-*` (единственная связь файла с модулем); `UC-*`/`V-M-*` в `LINKS` движок игнорирует;
- `START_MODULE_MAP` (строки `symbol - описание`), `CONTRACT:fn`, `START_BLOCK_*`/`END_BLOCK_*` — не удаляй;
- `START_CHANGE_SUMMARY` — не обязателен, но если секция есть, добавь запись с датой ISO и кратким why (`LAST_CHANGE:` внутри обязателен).

**6. Перейти на `on-after-edit.md`.**

---

## Anti-patterns

- Не правь без `impact`. Это базовый risk-gate.
- Не игнорируй HIGH/CRITICAL «молча» — пользователь должен видеть `risk.reasons`.
- Не меняй `phase:` в `AGENTS.md` вручную — только `doubled-graph phase set <value> --repo .`.
- Не удаляй якоря при правке и не оставляй `LINKS` без `M-*`.
- Не правь `docs/*.xml` — их в GRACE 4 нет; всё живёт в `.grace/`.
- Не утверждай «я починил всех вызывающих» без явного `detect-changes` или повторного `impact` после.

---

## Если инструмент недоступен

- **`doubled-graph impact` упал**: предупреди пользователя, сделай `grep` вызовов руками, классифицируй risk консервативно (default `MEDIUM`).
- **`doubled-graph file show` / `module show` недоступен** (`grace` CLI не установлен): прочитай файл напрямую через `Read`, найди `MODULE_CONTRACT` блоки руками; контракт модуля — в `.grace/graph/main.xml`.
- **`.grace` нет, есть `docs/*.xml`**: проект не мигрирован (движок ответит `project.grace3-detected`). Скажи пользователю и ушли на `prompts/migrate-existing-project/00-entry-prompt.md`.
- **`AGENTS.md` нет**: default `post_migration`, предупреди пользователя.
