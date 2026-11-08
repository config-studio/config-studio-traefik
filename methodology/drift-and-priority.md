# Политика дрейфа и приоритета

**Дрейф** — расхождение между **declared graph** (`.grace/graph/index.xml` + `.grace/graph/main.xml`) и **computed graph** (строится `codegraphcontext` из AST).

В upstream grace-marketplace такого разделения нет — только declared, проверяется через `grace lint` (синтаксическая целостность и покрытие `M-*` → `V-M-*`). **Политика ниже — расширение doubled-graph.**

---

## Два режима

Хранятся в `AGENTS.md` в блоке между `<!-- doubled-graph:phase:start -->` и `<!-- doubled-graph:phase:end -->`:

```markdown
<!-- doubled-graph:phase:start -->
## doubled-graph phase
phase: post_migration
updated: 2026-04-18
<!-- doubled-graph:phase:end -->
```

Парсер — `src/doubled_graph/policy/phase.py`. Default при отсутствии блока: `post_migration`.

### Режим `migration`

**Ground-truth = код.** Артефакты догоняют.

**Когда используется:**
- Сценарий 2 (миграция legacy) — полностью, включая заполнение пустых `V-<M>` после `doubled-graph migrate apply`;
- Крупные рефакторинги, где сначала переписываем код, потом актуализируем `.grace`.

**Политика разрешения дрейфа:** агент `Edit`-ит `.grace/graph/main.xml` (и `<Owns>` в `index.xml`) под код **без вопросов** (см. skill `doubled-graph-drift` § A). Пользователь ревьюит diff артефактов через `git diff .grace/`, а не код.

**Approval-gates остаются** (принцип 2): решение «что стало частью продукта» подписывает человек, просто оно теперь формулируется как «одобряю обновлённый `.grace/graph/main.xml` и бандл `C-*`» вместо «одобряю новую функцию».

### Режим `post_migration` (default)

**Ground-truth = артефакты.** Расхождение — подозрение на баг или новое неодобренное требование.

**Когда используется:**
- Сценарий 1 (новый проект) — с первого шага.
- Сценарий 3 (поддержка) — после завершения миграции.

**Политика разрешения дрейфа** (см. skill `doubled-graph-drift` § B):

1. `doubled-graph.detect_changes()` нашёл расхождение.
2. Агент смотрит `git log -1 --name-only`: был ли код в этом файле изменён в последнем коммите?
3. **Да:** спрашивает пользователя — «Новое требование или баг?»
   - **«Новое требование»** → полный цикл: `Edit` текста в `.grace/context/requirements.xml` + бандл `C-*` (spec → approved, plan с `T-###`) + `<M-*>` в `.grace/graph/main.xml` → approval-gate → кодогенерация под обновлённый контракт.
   - **«Баг»** → `Edit` кода обратно под существующий контракт + запись в бандл `C-*` (или в `CHANGE_SUMMARY`, если он есть).
   - **«Не знаю»** → запись в `docs/DRIFT.md`, модуль блокируется для правок ИИ до разрешения.
4. **Нет (код не менялся, но drift есть)** → audit-запись в `DRIFT.md`, это tooling-проблема или внешний процесс (автогенератор, миграция библиотеки).

---

## Переключение режима

**Миграция завершена → переход в `post_migration`.** Критерии:

- `grace lint --path . --format json` без ошибок: `summary.errors = 0` (не по `exit code` — он зависит от `--fail-on`);
- `grace status --path . --json` даёт `projectKind = grace4` и пустой `integrity.errors`;
- `doubled-graph.detect_changes(scope="all")` возвращает пустой drift;
- все критические модули имеют MODULE_CONTRACT и **непустой** `V-M-*` — `doubled-graph.health()` показывает пустой `modules.without_verification`, а `grace module health` не показывает `verification.placeholder`.

**Процедура:**

```bash
# Через инструмент (рекомендовано):
doubled-graph phase set post_migration --reason "migration complete after M42"

# Или руками: правка блока в AGENTS.md + commit.
```

Инструмент меняет блок и создаёт commit с сообщением, содержащим причину («reason»). Ревью PR — обычный git-review.

**Откат `post_migration` → `migration`** возможен, но **обязывает** сопроводить запись в `docs/DRIFT.md`:

```markdown
# docs/DRIFT.md

## 2026-04-18 — откат в режим migration
**Причина:** внедряем новую библиотеку Y, которая затрагивает 17 модулей;
артефакты будут отставать от кода 2–3 дня до стабилизации.
**Ожидаемое окончание:** 2026-04-21.
**Ответственный:** <имя>.
```

**Почему** откат не бесплатен: в `migration` политика молчаливо подписывает любые code-changes в артефакты. Если включать её без необходимости — теряем гарантию согласованности.

---

## Источники дрейфа

| Источник | Типичный случай | Кто инициирует обнаружение |
|---|---|---|
| Ручная правка человеком | фикс bug на production, сделанный без ИИ | `post-commit` hook → `analyze` → следующий `detect_changes` (см. skill `doubled-graph-manual-edit`) |
| ИИ сгенерировал код, но не обновил артефакт | агент пропустил шаг 2 в `doubled-graph-after-edit` | следующий `detect_changes` ловит; CI pre-commit gate блокирует merge |
| Внешний процесс (codegen, migration) | `prisma migrate`, `grpc-gen` создают код | `post-commit` hook фиксирует файлы, `detect_changes` показывает `code_without_module` |
| Одобренное новое требование, частично реализованное | середина работы над фичей | ожидаемо; `DRIFT.md` помечает «in progress: C-2026-04-18-audit-links» |
| Миграция с GRACE 3 | пустые `V-<M>` заглушки после `migrate apply` | `grace module health` / warning `verification.placeholder` — не дрейф графа, а незакрытая верификация |

---

## Типы дрейфа и разрешение

(Выход `doubled-graph.detect_changes()` — см. `../docs/TOOLS.md § 4.2`.)

### `code_without_module`
Функция/класс существует в коде, не покрыт ни одним `M-*`.

**Причина в GRACE 4:** файл без `LINKS: M-*` в `MODULE_CONTRACT` — либо `LINKS` содержит только `UC-*`/`V-M-*`, которые движок игнорирует.

**Миграция:** агент `Edit`-ит `.grace/graph/main.xml` — добавляет новый `<M-*>` с `<Path>` и дописывает якорь в `<Owns>` (см. skill `doubled-graph-drift` § A).
**Post_migration:** спросить — новое требование? Если да → `Edit` текста требований + `<M-*>` + бандл `C-*` под cycle планирования. Если баг (код попал случайно) → удалить код или исправить `LINKS`.

### `module_without_code`
`M-*` в `.grace/graph/main.xml` есть, файлов нет (ни `<Path>`, ни привязанных через `LINKS`).

**Миграция:** отметить `<Status>deprecated</Status>`, по согласованию удалить якорь из документа и из `<Owns>`.
**Post_migration:** ожидаемо в начале работы над фичей. Если осталось «долго» (настраиваемо, например > 7 дней) — пингуем.

### `contract_mismatch`
Декларированная сигнатура `validateUser(req: Request): User | null`, реальная `validateUser(req: Request, opts?: Options)`. Сюда же расхождение `Exports` модуля с `MODULE_MAP` файла и несоответствие `ROLE`/`MAP_MODE`.

**Миграция:** обновить контракт (`.grace/graph/main.xml` и `MODULE_CONTRACT`) под код.
**Post_migration:** спросить — обновляем артефакт (новое требование) или откатываем код (баг)? `ROLE`/`MAP_MODE` — всегда ошибка разметки, чинится в коде (`markup.role-map-mode-mismatch`).

### `stale_crosslinks`
`<Depends><M-B /></Depends>` у `M-A`, но в CGC нет вызовов между их файлами.

**Миграция:** удалить зависимость из `<Depends>` и из документа, и из `<Owns>`, если она была отдельным якорем.
**Post_migration:** скорее всего рефакторинг разорвал связь случайно — задокументировать и удалить зависимость, проверить что это не потерянная функциональность.

### `missing_verification`
`M-*` имеет код, но нет `V-M-*`.

**Обоих режимов одинаково:** добавить `V-M-*`. В GRACE 4 покрытие обязательно на уровне lint (`projection.verification.missing-module-coverage`), поэтому практический эквивалент — **пустая заглушка** `V-<M>`: она проходит структурный gate, но `grace module health` показывает `verification.placeholder`, а `doubled-graph.health()` — модуль в `without_verification`. Заглушку нужно заполнить реальными `TestFiles`/`Command`/`Scenario`; на критических модулях — блокирующий gate.

### `markup_missing`
В файле нет MODULE_CONTRACT / MODULE_MAP, либо в `MODULE_CONTRACT` нет `LINKS: M-*`.

**Миграция:** добавить; это основная активность `04-markup-codebase.md`, а механическую часть (`LINKS: M-*`) делает `doubled-graph migrate apply`.
**Post_migration:** обычно ошибка генерации — добавить разметку вручную (по шаблону `language-adapters/<язык>.md`) и проверить `doubled-graph lint`.

---

## Grace lint, CI и gates

`doubled-graph detect_changes` — **не** блокирует коммит сам по себе (соображения UX, см. `../docs/HOOKS.md §1.2`). Блокировкой занимается:

- **pre-commit (опциональный) + CI**: `doubled-graph lint` + `doubled-graph detect_changes --scope staged`. Если drift > 0 и **не записан** в `DRIFT.md` — merge блокируется.
- **pre-merge gate**: полный `detect_changes --scope compare --base-ref main` + прогон `<Command>` всех `V-M-*` с `<Priority>high</Priority>` из `.grace/verification/main.xml`.

Два технических нюанса, без которых gate врёт:

- `grace lint --path . --format json` (**не** `--json`) — exit code зависит от `--fail-on` (default `errors`), поэтому проверяем `summary.errors = 0`, а не `rc`.
- `grace status --path . --json` возвращает exit 0 даже для проекта 3.x: смотрим `projectKind = grace4` и `integrity.errors`.

Эти gate-ы **обязательны** для всех проектов (профилей глубины в doubled-graph нет — см. `auto-scaling.md`).

---

## Logs privacy

Привязано сюда, потому что phase-решение влияет на privacy:

- В `migration` лог-события с `belief` могут содержать «что ИИ думал про этот legacy-код» — включая PII, прочитанный ИИ из legacy. **Маскировать агрессивнее.**
- В `post_migration` код уже ревьюирован, меньше шансов, что ИИ «запомнил» чужой PII в своём belief. **Стандартный режим маскирования.**

Правила маскирования — в `runtime-adapters/*.md` (privacy-секции).

---

## Что `DRIFT.md` должен содержать

```markdown
# DRIFT.md

## Текущие открытые дрейфы

### D-001 — M-AUTH-VALIDATE: contract_mismatch (2026-04-17)
- **Что:** реальная сигнатура `validateUser(req, opts?)` расходится с контрактом (1 аргумент).
- **Причина:** добавление опционального `opts` без прохождения approval-gate на contract-change.
- **Статус:** пользователь не решил — новое требование или откат.
- **Owner:** @alice.
- **Deadline:** 2026-04-20.

## История закрытых

### D-000 — M-BILLING-STRIPE: stale_crosslinks (2026-04-10 → closed 2026-04-12)
- Решение: рефакторинг разорвал связь преднамеренно, зависимость удалена из `.grace/graph/main.xml`.
```

Формат — произвольный markdown; шаблон выше — рекомендация, не требование.
