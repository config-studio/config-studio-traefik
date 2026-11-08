# 02 — Requirements

**Роль ИИ:** создать `.grace`-скелет артефактов и заполнить `.grace/context/requirements.xml` на основе intent-интервью. Требования в GRACE 4 — свободный текст: `<Goals>`, `<Users>`, `<Constraints>`. Якорной нотации use-case'ов (`UC-*`) нет.

---

## Инструкция

**Шаг 0 — прочитай scratchpad интервью.**

Обязательный первый шаг:

```
Read: .doubled-graph/drafts/interview.md
```

**Этот файл — единственный источник истины** по ответам пользователя. Не пытайся вспомнить ответы из истории чата — для локальной модели середина контекста ненадёжна.

Если scratchpad **отсутствует** (пользователь запустил 02 напрямую) — остановись, скажи пользователю: «Интервью не проведено, не могу заполнить `requirements.xml` без данных. Вернись к `01-intent-interview.md`.» Не угадывай.

Если scratchpad **имеет `Status: in-progress`** — остановись, скажи «интервью не завершено, продолжим его».

**Шаг 1 — bootstrap `.grace`-скелета.** Скелет обязателен целиком: без любого из 5 context-файлов и без `changes/{active,archive}` движок отвечает ошибкой (`context.missing-artifact` / `project.missing-change-directory`).

```bash
mkdir -p .grace/context .grace/graph .grace/verification .grace/changes/active .grace/changes/archive
touch .grace/changes/active/.gitkeep .grace/changes/archive/.gitkeep
```

Затем создай через `Write` девять файлов **ровно в таком виде** (значения в угловых скобках замени своими; `graceVersion="4.0"` обязателен, семантические якоря — теги без атрибутов, служебные теги — PascalCase):

`.grace/context/requirements.xml`

```xml
<GraceRequirements graceVersion="4.0">
  <ProjectName>Project name</ProjectName>
  <Annotation>Заполняется из .doubled-graph/drafts/interview.md на шаге 02.</Annotation>
  <Goals>
    <Goal>Опиши главную цель продукта.</Goal>
  </Goals>
  <Users>
    <User>Опиши основного пользователя.</User>
  </Users>
  <Constraints>
    <Constraint>Опиши продуктовые, регуляторные и data-ограничения.</Constraint>
  </Constraints>
</GraceRequirements>
```

`.grace/context/technology.xml`

```xml
<GraceTechnology graceVersion="4.0">
  <Language>unknown</Language>
  <Runtime>unknown</Runtime>
  <Framework>unknown</Framework>
  <TestingStack>unknown</TestingStack>
  <Observability>unknown</Observability>
  <OperationalConstraints>
    <Constraint>Заполняется на шаге 03 из .doubled-graph/drafts/interview.md § Блок B.</Constraint>
  </OperationalConstraints>
</GraceTechnology>
```

`.grace/context/principles.xml`

```xml
<GracePrinciples graceVersion="4.0">
  <Principle>Контракты предшествуют реализации.</Principle>
  <Principle>Verification объявляется вместе с модулем.</Principle>
  <Principle>Код — источник истины; артефакты следуют за наблюдаемой реальностью.</Principle>
  <Principle>Изменения проходят через GraceChangeSpec и GraceChangePlan.</Principle>
</GracePrinciples>
```

`.grace/context/deployment.xml`

```xml
<GraceDeployment graceVersion="4.0">
  <Applicability>not-applicable</Applicability>
  <Reason>Не настроено: заполняется на шаге 03, если deployment-требований нет — оставь not-applicable.</Reason>
</GraceDeployment>
```

`.grace/context/ux-guidelines.xml`

```xml
<GraceUXGuidelines graceVersion="4.0">
  <Applicability>not-applicable</Applicability>
  <Reason>Не настроено: если у продукта есть UI — переключи на applicable и добавь гайдлайны.</Reason>
</GraceUXGuidelines>
```

`.grace/graph/index.xml`

```xml
<GraceGraphIndex graceVersion="4.0">
  <GraphDocuments>
    <GD-MAIN>
      <Path>graph/main.xml</Path>
      <Owns>
      </Owns>
    </GD-MAIN>
  </GraphDocuments>
</GraceGraphIndex>
```

`.grace/graph/main.xml`

```xml
<GraceGraphDocument graceVersion="4.0">
  <GD-MAIN>
  </GD-MAIN>
</GraceGraphDocument>
```

`.grace/verification/index.xml`

```xml
<GraceVerificationIndex graceVersion="4.0">
  <VerificationDocuments>
    <VD-MAIN>
      <Path>verification/main.xml</Path>
      <Owns>
      </Owns>
    </VD-MAIN>
  </VerificationDocuments>
</GraceVerificationIndex>
```

`.grace/verification/main.xml`

```xml
<GraceVerificationDocument graceVersion="4.0">
  <VD-MAIN>
  </VD-MAIN>
</GraceVerificationDocument>
```

> Эквивалент: `doubled-graph setup --repo .` создаёт такой же скелет автоматически (bootstrap на пустом репозитории). Если скелет создан вручную — `setup` не нужен, но проверь результат командой `doubled-graph status --repo .`: в JSON должно быть `"artifacts": {"project_kind": "grace4", "legacy_documents": []}`.

В `AGENTS.md` сразу добавь phase-блок (если файла нет — создай):

```markdown
<!-- doubled-graph:phase:start -->
## doubled-graph phase
phase: post_migration
updated: <сегодняшняя дата ISO>
<!-- doubled-graph:phase:end -->
```

**Шаг 2.** Заполни `.grace/context/requirements.xml` согласно ответам из Блока A scratchpad'а (`.doubled-graph/drafts/interview.md`).

Правила формата:

- `<Goals>` — по одной `<Goal>` на наблюдаемый результат. Цель формулируется прозой, но измеримо: не «быстро», а «подтверждение заказа за p95 < 3 с».
- `<Users>` — по одной `<User>` на актора из интервью (роли можно несколькими словами: `Buyer`, `Admin`, `CronScheduler`, `PaymentWebhook`).
- `<Constraints>` — нефункциональные и внешние ограничения: latency, throughput, regulatory, offline-first, приватность/PII, лицензии, интеграции.
- Никаких атрибутов у тегов, никаких `UC-*` / `REQ-*` и других выдуманных якорных семейств. Ссылки на цель — по её номеру внутри `<Goals>` (`третья цель`), не по якорю.

Пример заполненного файла:

```xml
<GraceRequirements graceVersion="4.0">
  <ProjectName>Orders API</ProjectName>
  <Annotation>Восстановлено из интервью 2026-04-18.</Annotation>
  <Goals>
    <Goal>Buyer оформляет заказ и получает подтверждение за p95 &lt; 3 с.</Goal>
    <Goal>Buyer отменяет заказ, refund инициируется автоматически.</Goal>
    <Goal>Admin отзывает пользователя: доступ прекращён в течение 60 с.</Goal>
  </Goals>
  <Users>
    <User>Buyer — покупатель</User>
    <User>Admin — администратор</User>
    <User>CronScheduler — плановые задачи</User>
  </Users>
  <Constraints>
    <Constraint>p95 подтверждения заказа &lt; 3 с, p99 &lt; 8 с.</Constraint>
    <Constraint>PII: email и адрес доставки в заказах; маскировать в логах.</Constraint>
    <Constraint>Refund — через внешний платёжный провайдер, ретраи идемпотентны.</Constraint>
  </Constraints>
</GraceRequirements>
```

**Шаг 3.** Покажи пользователю в **таком порядке**:

1. **Саммари**: количество целей, список акторов, по каждой цели одной строкой «Goal → измеримый критерий».
2. **⚠ Что требует особого внимания**:
   - цели, у которых критерий не измерим (нет числа, только проза);
   - цели и ограничения с PII — критичный путь для verification;
   - цели, которые я склеил/разделил относительно сказанного в интервью (интерпретация ИИ);
   - non-functional-ограничения, которые были упомянуты в интервью, но я не смог однозначно разместить.
   Если ничего — «отклонений нет».
3. **Чек-лист одобрения**:
   - [ ] нет целей, объединяющих два независимых результата (регистрация + вход — это две цели);
   - [ ] критерий измерим там, где это возможно на старте проекта;
   - [ ] все упомянутые в интервью акторы присутствуют в `<Users>`;
   - [ ] PII-ограничения зафиксированы в `<Constraints>`;
   - [ ] non-functional из интервью не потерялись;
   - [ ] в файле нет якорей `UC-*` и других не-канонических тегов.
4. **Вопрос** (Approval-gate, наш — перед технологией):

   > Это твои цели и ограничения? Чтобы одобрить — пройдись по чек-листу выше. Если нужно уточнить/добавить/удалить — назови номер цели и что изменить.

Пока пользователь не подтвердил явно — **не** переходи к `03-technology.md`. Ответ «ок» без упоминания чек-листа — просьба подтвердить явно.

**При revision**: показывай diff относительно предыдущей версии (добавленные/удалённые/изменённые `<Goal>`), не весь файл заново.

---

## Правила заполнения

- **Один результат — одна `<Goal>`.** Не объединяй «зарегистрироваться и войти» в одну цель.
- **Критерий измерим.** Не «быстро», а «p95 < 3s». Если на данном этапе цифры нет — пиши прозу, но возвращайся к измеримости на approval.
- **Приватность.** Если цель связана с PII — отдельный `<Constraint>` про маскирование в логах и хранение.
- **Файл — текст, не граф.** Связь требований с кодом в GRACE 4 идёт через `M-*` → `V-M-*`; на требования ссылаются прозой в `<Summary>` модуля (шаг 04).
- **Не правь `docs/*.xml`.** Их в GRACE 4 нет: если они остались от GRACE 3 — это legacy, перенос/архивация — отдельное решение (см. `prompts/migrate-existing-project/00-entry-prompt.md`).

---

## Переход к шагу 3

После подтверждения пользователя — прочитай `prompts/new-project/03-technology.md` через Read tool и следуй его инструкциям.
