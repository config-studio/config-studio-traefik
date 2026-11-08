# 02 — Reconstruct intent

**Роль ИИ:** подготовить `.grace`-артефакты для существующего кода и восстановить `.grace/context/requirements.xml` по коду и документации.

---

## Externalize state — важно для локальной модели

Восстановление замысла legacy-кода — многошаговый процесс с десятками уточнений у пользователя. Контекст локальной модели не выдержит. Поэтому:

- Все найденные actors / actions / goals — **append-only в `.doubled-graph/drafts/intent-recovery.md`** (отдельный файл от интервью в new-project).
- Каждый вопрос к пользователю и его ответ — в этот же файл.
- Финальное заполнение `.grace/context/requirements.xml` — из файла, не из истории чата.

Формат scratchpad'а — свободный markdown, но с разделами:

```markdown
# Intent recovery — draft
Started: <ISO>
Status: in-progress | completed

## Migration branch
- <bootstrap (был project_kind=none) | migrated from GRACE 3 (было N legacy-документов)>

## Actors discovered
- <actor>: <source, напр. "src/routes/login.ts: POST /login">

## Actions per actor
### <actor>
- <action>: <source>
  - goal (draft): <prose>
  - user-clarified: <yes/no> | <если да — дословная фраза пользователя>

## Open questions
- [draft-N] <вопрос пользователю>

## User answers
- 2026-04-18T14:05: <вопрос> → <ответ>

## Legacy-to-deprecate candidates
- <function/module>: <почему кандидат>
```

---

## Шаги

**Шаг 1 — подготовь `.grace` (ветка зависит от `discover.md § 0`).**

**Ветка (а) — `project_kind: none`** (артефактов не было, код есть):

```bash
doubled-graph setup --repo .
doubled-graph status --repo .
```

`setup` создаёт `.grace`-скелет: `context/{requirements,technology,principles,deployment,ux-guidelines}.xml`, `graph/{index,main}.xml`, `verification/{index,main}.xml`, `changes/{active,archive}`. Проверь в JSON `"artifacts": {"project_kind": "grace4"}`. Дальше граф пустой — модули появятся на шаге 03.

**Ветка (б) — `project_kind: grace3`** (есть legacy `docs/*.xml`):

```bash
doubled-graph migrate apply --repo . --dry-run   # 1. посмотреть, что будет создано
doubled-graph migrate apply --repo .             # 2. применить
grace lint --path . --format json                # 3. структурная проверка
```

Что делает `migrate apply`:

- **копирует** legacy-содержимое в `.grace/` (requirements, technology, graph, verification), `docs/*.xml` **не** удаляет и не переписывает;
- создаёт `V-<M>` записи с переносом данных из `docs/verification-plan.xml` (command/scenario/marker/test-file/cwd/priority);
- для модулей без verification создаёт **пустые** `V-<M>` заглушки и пишет warning `verification.placeholder` — их заполняем на шаге 05;
- правит `LINKS: M-*` в `MODULE_CONTRACT` код-файлов (это единственная связь файла с модулем в GRACE 4); отключается флагом `--no-markup-fix`;
- пишет отчёт в `.doubled-graph/migrations/grace3-to-grace4.json` (вне `.grace`, чтобы движок не видел лишних файлов).

Если `.grace` уже существует — мигратор ничего не перезаписывает и сообщает `migration.grace4-present`. Если legacy-документов нет — `migration.no-legacy-docs`: значит ветка (а), используй `setup`.

**Что делать с отчётом миграции:**

| Поле отчёта | Действие |
|---|---|
| `placeholders` | список пустых `V-<M>`; заполнить на шаге 05 |
| `renamed_verifications` | старые id вида `V-M-AUTH-VALIDATE-01` → канонический `V-M-AUTH-VALIDATE`; принять |
| `ambiguous_links` | ссылки на несуществующие модули — уточнить у пользователя |
| `unsupported` | `UC-*`, `ExecutionPacket`, `VERSION="..."` и прочее без аналога в GRACE 4 — переносить некуда, зафиксируй в `docs/DRIFT.md` |

**Legacy `docs/*.xml` остаются на месте.** Их архивация (`git mv docs/legacy-grace3/` или удаление) — **отдельное решение пользователя** с отдельным коммитом, не часть миграции. См. `prompts/migrate-existing-project/06-validation-gates.md § Legacy-документы`.

Также создай/дополни `AGENTS.md` phase-блоком `phase: migration` (мы в режиме миграции — код = ground-truth, артефакты догоняют):

```markdown
<!-- doubled-graph:phase:start -->
## doubled-graph phase
phase: migration
updated: <сегодня>
<!-- doubled-graph:phase:end -->
```

**Шаг 2 — actor discovery.**

Из computed graph найди точки входа (entry points):
- HTTP routes / handlers;
- CLI commands;
- cron jobs / scheduled tasks;
- message consumers;
- public SDK exports.

Каждая точка входа → один или несколько actor'ов.

Составь список actor'ов. Примеры: `Buyer`, `Admin`, `CronScheduler`, `PaymentWebhook`, `ExternalSDKUser`.

**Шаг 3 — action discovery.**

Для каждого actor'а: какие действия он совершает?

Смотри в:
- route paths / command names (читаемые имена);
- function names на entry-point уровне;
- названия message-topics / event types;
- имена модулей из `graph/main.xml`, если ветка (б) принесла declared graph.

Группируй действия по акторам.

**Шаг 4 — goal recovery.**

Для каждого действия:
- посмотри код функции-обработчика;
- прочитай docstring / comments, если есть;
- прочитай тесты, покрывающие функцию (они часто описывают ожидаемое поведение);
- в коде найди log-сообщения «success» — часто описывают goal.

Сформулируй goal **прозой**. Не угадывай числа (latency/throughput) — они должны исходить от пользователя.

**Шаг 5 — подтверждение у пользователя.** Задай 5–10 вопросов одним сообщением (это approval-gate). Если ответа нет в течение сессии — сохрани draft в `.doubled-graph/drafts/intent-recovery.md` со `Status: pending-approval`, добавь строку в `docs/DRIFT.md` и продолжай по ветке (а)/(б) с draft-версией: на шаге 06 запись `pending-approval` останется блокером, пока пользователь не подтвердит.

Покажи черновик списка (нумерованный, без выдуманных якорей — в GRACE 4 нет `UC-*`, номера живут только в этом черновике):

```
Восстановленные цели (черновик):

1. Buyer → оформляет заказ → получает подтверждение
2. Buyer → отменяет заказ → заказ отменён, refund инициирован
3. Admin → отзывает пользователя → доступ прекращён
4. CronScheduler → чистит истёкшие сессии → сессии удалены из БД

Вопросы:
1. Это полный список или что-то пропустил?
2. Есть актор/действие, которое выглядит целью, но на самом деле внутренняя деталь реализации (то есть не стоит в requirements)?
3. Есть latency/throughput/security требования, которые я должен зафиксировать?
4. Что-то из кода кажется legacy — больше не используется? (кандидаты на deprecation)
```

Дождись ответов. Скорректируй список.

**Шаг 6 — заполни `.grace/context/requirements.xml`.**

Источник данных — **scratchpad `.doubled-graph/drafts/intent-recovery.md`**, не история чата. Читай его целиком перед правкой XML.

- Ветка (а): файл пришёл из bootstrap — заменяй placeholder-цели целиком.
- Ветка (б): мигратор уже создал содержательный файл; сохрани поле `<Annotation>` и `<LegacySource>` (если есть) — это маркер происхождения, правь только `Goals`/`Users`/`Constraints`.

Структура (только эти теги, без атрибутов; якорей требований нет):

```xml
<GraceRequirements graceVersion="4.0">
  <ProjectName>Orders API</ProjectName>
  <Annotation>Восстановлено из кода и README (migration, 2026-04-18).</Annotation>
  <Goals>
    <Goal>Buyer оформляет заказ и получает подтверждение. Источник: src/orders/place.py + tests/test_place_order.py.</Goal>
    <Goal>Admin отзывает пользователя: доступ прекращён в течение 60 с. Источник: src/admin/revoke.py.</Goal>
  </Goals>
  <Users>
    <User>Buyer — покупатель, приходит через POST /orders</User>
    <User>Admin — администратор админки</User>
    <User>CronScheduler — cron-задачи в src/cron/</User>
  </Users>
  <Constraints>
    <Constraint>PII: email и адрес доставки; маскировать в логах (см. src/logging/formatter.py).</Constraint>
    <Constraint>Существующий стек не меняем: см. .grace/context/technology.xml.</Constraint>
  </Constraints>
</GraceRequirements>
```

Правило происхождения: ссылку на источник пиши **текстом внутри** `<Goal>`/`<Constraint>` (`Источник: <путь> + <тест>`). Это заменяет GRACE 3-атрибут `Source` — в GRACE 4 у семантических тегов атрибутов нет.

**Шаг 7 — approval gate (наш, на требованиях):**

Покажи пользователю полный `.grace/context/requirements.xml`:

> «Восстановленные цели и ограничения. Подтверждаешь?»

Если есть разногласия — фиксируй в `docs/DRIFT.md` (markdown-файл, не XML; его читает `doubled-graph health`):

```markdown
# DRIFT.md

## Reconstructed-requirements discrepancies (migration)

### D-REC-001 — цель 5 лишняя
Пользователь утверждает, что функция `helper_utils.format_address` — случайный helper, не требование. Закомментирован в 2024-Q3, но не удалён. Помечаем для удаления на шаге 06-validation-gates.

### D-REC-002 — цель 7 без критерия
ИИ не смог восстановить измеримый критерий для `admin_panel.generate_report`. Пользователь обещает дополнить на следующей неделе.
```

---

## Переход

После approval — прочитай `prompts/migrate-existing-project/03-draft-plan.md` через Read tool и следуй его инструкциям.
