# Артефакты doubled-graph

Формат — **GRACE 4**: XML-деревья в `.grace/` с корневым атрибутом `graceVersion="4.0"`. Пять обязательных context-файлов, граф и верификация — каждый по паре `index.xml` + `main.xml`, плюс бандлы изменений. Создаются агентом по сценарию из `prompts/new-project/` или `prompts/migrate-existing-project/` (через `Write`), эволюционируют через skills семейства `doubled-graph-*` (через `Edit`).

Раскладка GRACE 3 (`docs/*.xml`) движком 4.x не читается: `lint` на таком проекте отвечает `project.grace3-detected`, query-команды — `invalid-project`. Переход — `doubled-graph migrate apply` (§ «Миграция с GRACE 3»).

**Источник истины для XML-схем** — inline-примеры ниже и в `prompts/new-project/`. Они воспроизводят конвенции upstream grace-marketplace (якорь — имя тега, служебные теги PascalCase). **Не ходи в GitHub за шаблонами** — всё, что нужно для генерации артефактов, есть локально.

---

## Правила модели (общие для всех файлов)

- **Якоря — только теги, без атрибутов.** Семантические: `GD-*`, `VD-*`, `M-*`, `DF-*`, `V-M-*`, `C-*`, `T-###`. Всё остальное — служебные PascalCase-теги (`GraceGraphDocument`, `Path`, `Owns`, `Name`, `Summary`, …). Значение живёт текстом внутри тега, не в атрибуте.
- **`graceVersion="4.0"`** — на корне каждого файла.
- **`index.xml` — routing table.** Каждый маршрут (`GD-*` / `VD-*`) содержит ровно один `<Path>` (относительно `.grace/`) и `<Owns>` со списком якорей, которые документ обязан объявить. `Owns` должен перечислять **ровно** объявленные якоря: якорь в документе, но не в `Owns` — `unlisted-anchor`; якорь в `Owns`, но не в документе — `missing-anchor`.
- **Якоря — прямые дети маршрутизирующего тега.** Группирующая обёртка внутри `GD-*`/`VD-*` — ошибка `projection.graph.nested-anchors`.
- **Покрытие `M-*` → `V-M-*` обязательно.** Для каждого `M-*` должен существовать `V-<M-id>` (`M-AUTH` → `V-M-AUTH`), иначе `projection.verification.missing-module-coverage`. Обратное тоже проверяется: `V-M-*` без модуля — `projection.verification.dangling-module`; `TestFiles` с несуществующим файлом — `verification.test-file-missing`.
- **Якорей `UC-*` в GRACE 4 нет.** Требования живут свободным текстом в `.grace/context/requirements.xml`; трассировка только `M-*` → `V-M-*`. Связь файла кода с модулем — единственным способом: `LINKS: M-*` в `MODULE_CONTRACT` (§ «Разметка кода»). Значения `UC-*`/`V-M-*` в `LINKS` движок игнорирует — файл тогда не привязан к модулю.

---

## Карта артефактов

```
.grace/
├── context/
│   ├── requirements.xml        ← что делает продукт (свободный текст, без якорей)
│   ├── technology.xml          ← стек, версии, constraints
│   ├── principles.xml          ← принципы, которым следует проект
│   ├── deployment.xml          ← окружения и поставка (или not-applicable)
│   └── ux-guidelines.xml       ← UX-рамка (или not-applicable)
├── graph/
│   ├── index.xml               ← routing table: GD-* → Path + Owns
│   └── main.xml                ← GD-MAIN: модули M-*, data-flows DF-*
├── verification/
│   ├── index.xml               ← routing table: VD-* → Path + Owns
│   └── main.xml                ← VD-MAIN: контракты V-M-*
└── changes/
    ├── active/                 ← бандлы C-*/{spec.xml,plan.xml} в работе
    └── archive/                ← applied / rejected / cancelled / superseded

AGENTS.md                       ← протокол агента + phase-блок (см. drift-and-priority.md)
```

Все пять context-файлов обязательны: отсутствие любого — ошибка `context.missing-artifact`. Оба каталога изменений обязательны: отсутствие — `project.missing-change-directory`.

Плюс код с якорями разметки (ниже § «Разметка кода»).

---

## 1. `.grace/context/requirements.xml`

**Что содержит:** продуктовые цели и use-cases в нотации Actor–Action–Goal (AAG), свободным текстом. Каждый use case — атомарен. Якорей нет: ни `UC-*`, ни ссылок на них из графа или кода.

```xml
<GraceRequirements graceVersion="4.0">
  <Goals>
    <Goal>Покупатель получает подтверждение заказа не дольше 3 секунд (p95).</Goal>
  </Goals>
  <UseCases>
    <UseCase>
      <Actor>Buyer</Actor>
      <Action>place_order</Action>
      <Goal>получить подтверждение заказа</Goal>
      <NonFunctional>p95 &lt; 3s; JWT-auth required</NonFunctional>
    </UseCase>
  </UseCases>
  <Constraints>
    <Constraint>PII не попадает в логи.</Constraint>
  </Constraints>
</GraceRequirements>
```

**Кто меняет:** человек — напрямую или через ИИ с явной формулировкой. Изменение требования = новая формулировка, старая помечается словом `deprecated` в тексте.

**Связи:** требование упоминается свободным текстом в `<Summary>` реализующего модуля и в `<Scenario>` его `V-M-*`. Трассировка идёт по цепочке требование → `M-*` → `V-M-*`; отдельного якоря требования нет by design.

---

## 2. `.grace/context/technology.xml`

**Что содержит:** стек и constraints.

```xml
<GraceTechnology graceVersion="4.0">
  <Language>TypeScript</Language>
  <Runtime>Node 22 LTS</Runtime>
  <Libraries>
    <Library>fastify &gt;=5</Library>
    <Library>prisma ^6</Library>
  </Libraries>
  <Testing>
    <Framework>vitest</Framework>
    <Coverage>80%</Coverage>
  </Testing>
  <Deployment>Docker</Deployment>
</GraceTechnology>
```

**Правила версий:**
- Значение `<Runtime>` — обоснованный floor (напр., `Python 3.12` если нужен FalkorDB Lite). Не завышай.
- Для «предпочтительной» версии пиши `current-stable` или `LTS`. Конкретный `X.Y.Z` **не указывай** — устаревает.
- В `<Library>` используй диапазоны (`>=X.Y`, `^X`, `~X.Y`), не exact pins. Exact pins — lockfile'у.

**Approval-gate:** утверждение стека происходит до того, как `.grace/graph/main.xml` начнёт ссылаться на конкретные библиотеки. На момент approval актуальные версии сверяются через WebFetch/WebSearch — не берутся из памяти ИИ.

---

## 3. `.grace/graph/` — declared graph

**Что содержит:** routing table (`index.xml`) и сам граф (`main.xml`): модули `M-*`, data-flows `DF-*`, их зависимости и экспорты. Это единственный источник декларации архитектуры: прежние «план разработки» и «граф знаний» слиты в одну модель.

```xml
<GraceGraphIndex graceVersion="4.0">
  <GraphDocuments>
    <GD-MAIN>
      <Path>graph/main.xml</Path>
      <Owns>
        <M-AUTH-VALIDATE />
        <M-AUTH-TOKENS />
        <DF-LOGIN />
      </Owns>
    </GD-MAIN>
  </GraphDocuments>
</GraceGraphIndex>
```

```xml
<GraceGraphDocument graceVersion="4.0">
  <GD-MAIN>
    <M-AUTH-VALIDATE>
      <Name>AuthValidate</Name>
      <Status>existing</Status>
      <Summary>Validate incoming JWT and resolve User. JWT header must be present; returns User | null (never throws); clock-skew tolerance = 60s.</Summary>
      <Path>src/auth/validate.ts</Path>
      <Depends>
        <M-AUTH-TOKENS />
      </Depends>
      <Exports>
        <Export>validateUser</Export>
        <Export>validateToken</Export>
      </Exports>
    </M-AUTH-VALIDATE>

    <M-AUTH-TOKENS>
      <Name>AuthTokens</Name>
      <Status>existing</Status>
      <Summary>Token utilities: decode, verify signature, extract claims.</Summary>
      <Path>src/auth/tokens.ts</Path>
    </M-AUTH-TOKENS>

    <DF-LOGIN>
      <Summary>M-ROUTES-LOGIN → M-AUTH-VALIDATE → M-SESSION-CREATE</Summary>
    </DF-LOGIN>
  </GD-MAIN>
</GraceGraphDocument>
```

**Поля модуля:**
- `<Name>` — человекочитаемое имя.
- `<Status>` — состояние по конвенции: `existing` | `planned` | `deprecated`.
- `<Summary>` (допустимо `<Purpose>`) — назначение модуля. Единственное место для свободного текста контракта в артефакте.
- `<Path>` (дополнительные пути — `<AdditionalPath>`) — **справочный** путь файла. Авторитетная привязка файла к модулю — `LINKS: M-*` в коде; `Path` работает как fallback, когда `LINKS` нет.
- `<Depends>` — исходящие связи на другие `M-*`/`DF-*`. Используются навигацией и drift-проверкой зависимостей.
- `<Exports>` — публичные символы; сверяются с `MODULE_MAP` файла.

**`DF-*`** — декларация потока данных: последовательность модулей и evidence-точки. Покрытия `V-M-*` не требует (обязательно только для `M-*`), живёт в том же `<Owns>`, что и модули.

**Разбиение на документы:** один `GD-MAIN` — норма. Несколько `GD-*` нужны, когда граф физически велик или делится по подсистемам; каждый такой документ получает свой маршрут в `index.xml` и свой `<Owns>`. Один якорь — ровно один документ: повторное объявление даёт `projection.graph.duplicate-anchor`, а второй маршрут — `projection.graph.missing-anchor`.

**Приоритет полей:** «важность» модуля отдельного атрибута больше не имеет — она читается из `<Priority>` его `V-M-*`, а `risk.level` в `impact` считается движком от числа callers и попадания правки в `V-M-*`.

---

## 4. `.grace/verification/`

**Что содержит:** routing table (`index.xml`) и контракты проверки `V-M-*` (`main.xml`): тестовые файлы, команды, сценарии, markers (имена логов), trace-assertions.

```xml
<GraceVerificationIndex graceVersion="4.0">
  <VerificationDocuments>
    <VD-MAIN>
      <Path>verification/main.xml</Path>
      <Owns>
        <V-M-AUTH-VALIDATE />
        <V-M-AUTH-TOKENS />
      </Owns>
    </VD-MAIN>
  </VerificationDocuments>
</GraceVerificationIndex>
```

```xml
<GraceVerificationDocument graceVersion="4.0">
  <VD-MAIN>
    <V-M-AUTH-VALIDATE>
      <Priority>high</Priority>
      <Cwd>.</Cwd>
      <TestFiles>
        <File>tests/auth/validate.test.ts</File>
      </TestFiles>
      <Command>pnpm test auth/validate</Command>
      <Scenario>valid JWT returns User</Scenario>
      <Marker>[AuthValidate][validateUser][BLOCK_DECODE_JWT] VALIDATE_SUCCESS</Marker>
      <TraceAssertion>validateUser:BLOCK_DECODE_JWT emitted with event=jwt_decoded</TraceAssertion>
    </V-M-AUTH-VALIDATE>
    <V-M-AUTH-TOKENS>
      <Priority>standard</Priority>
      <Cwd>.</Cwd>
      <TestFiles>
        <File>tests/auth/tokens.test.ts</File>
      </TestFiles>
      <Command>pnpm test auth/tokens</Command>
      <Scenario>expired token verifies as null</Scenario>
    </V-M-AUTH-TOKENS>
  </VD-MAIN>
</GraceVerificationDocument>
```

В примере выше граф объявляет два модуля — значит, в verification обязаны быть оба `V-M-*`; один модуль без своей записи — ошибка покрытия.

**Правила:**
- ID — всегда `V-<M-id>`: `module_id` выводится из имени тега, отдельного поля-ссылки нет.
- `<Priority>` — приоритет прогона (`high` / `standard` / метка проекта); это же значение всплывает как `kind` в health/detect-changes.
- `<Cwd>` — рабочая директория прогона относительно корня проекта.
- `<Command>`, `<Scenario>`, `<Marker>`, `<TraceAssertion>` — содержательная часть. `<Marker>` — имя, которое обязано появиться в structured log, когда код проходит соответствующую точку; `<TraceAssertion>` — проверяемое утверждение о трейсе.
- **Пустая заглушка** (только `<Priority>`) валидна по структуре, но даёт warning `verification.placeholder`: `grace module health` и drift будут указывать на неё, пока не заполнена реальными `TestFiles`/`Command`/`Scenario`.

**Связь с кодом:** `M-*` без `V-M-*` — блокирующая ошибка покрытия; `V-M-*` с несуществующим `TestFiles` — `verification.test-file-missing`. Прогон pre-merge gate = `Command` всех `high`-приоритетных `V-M-*`.

---

## 5. Остальные context-файлы: `principles.xml`, `deployment.xml`, `ux-guidelines.xml`

**`principles.xml`** — принципы, которым следует проект. Bootstrap кладёт сюда копию 10 принципов doubled-graph; дальше файл правится редко.

```xml
<GracePrinciples graceVersion="4.0">
  <Principle>Контракты предшествуют реализации.</Principle>
  <Principle>Верификация объявляется вместе с модулем.</Principle>
  <Principle>Изменения кода идут через GraceChangeSpec и GraceChangePlan.</Principle>
</GracePrinciples>
```

**`deployment.xml`** — окружения, способ поставки, эксплуатационные ограничения.

```xml
<GraceDeployment graceVersion="4.0">
  <Environments>
    <Environment>local</Environment>
    <Environment>staging</Environment>
    <Environment>production</Environment>
  </Environments>
  <Delivery>Docker image, deploy по тегу</Delivery>
  <OperationalConstraints>
    <Constraint>Миграции БД только forward-only.</Constraint>
  </OperationalConstraints>
</GraceDeployment>
```

**`ux-guidelines.xml`** — UX-рамка: паттерны, тон, ограничения интерфейса.

Если артефакт к проекту неприменим (библиотека без UI, поставка через пакетный менеджер), файл всё равно создаётся — с явной пометкой неприменимости:

```xml
<GraceUxGuidelines graceVersion="4.0">
  <Applicability>not-applicable</Applicability>
  <Reason>Продукт без пользовательского интерфейса: CLI и библиотека.</Reason>
</GraceUxGuidelines>
```

Пустой файл или отсутствие файла — ошибка; `not-applicable` с причиной — легитимный артефакт.

---

## 6. `.grace/changes/` — бандлы изменений

Любое изменение кода оформляется бандлом `C-*`: каталог `.grace/changes/active/C-<slug>/` с двумя файлами — `spec.xml` (что и зачем) и `plan.xml` (как и в каких границах). После завершения бандл переносится в `.grace/changes/archive/`.

**`spec.xml`** — `GraceChangeSpec`:

```xml
<GraceChangeSpec graceVersion="4.0" status="approved">
  <C-AUDIT-LINKS>
    <Summary>Привязать файлы, разметившиеся без модуля, к их M-*.</Summary>
    <Goals>
      <Goal>Убрать code_without_module в src/auth.</Goal>
    </Goals>
    <Constraints>
      <Constraint>Не менять логику — только MODULE_CONTRACT.</Constraint>
    </Constraints>
    <NonGoals>
      <NonGoal>Пересборка графа модулей аутентификации.</NonGoal>
    </NonGoals>
    <AcceptanceCriteria>
      <Criterion>grace lint --path . --format json даёт summary.errors = 0.</Criterion>
    </AcceptanceCriteria>
    <AffectedAreas>
      <M-AUTH-VALIDATE />
    </AffectedAreas>
    <VerificationIntent>
      <Intent>Прогнать tests/auth/validate.test.ts и V-M-AUTH-VALIDATE.</Intent>
    </VerificationIntent>
  </C-AUDIT-LINKS>
</GraceChangeSpec>
```

**Статус — атрибут корня** (`status="..."`), не элемент: `draft` | `approved` (в `changes/active`) и `applied` | `rejected` | `cancelled` | `superseded` (в `changes/archive`). Элемент `<Status>` внутри бандла движок не читает. Секции `Summary`, `Goals`, `Constraints`, `NonGoals`, `AcceptanceCriteria`, `AffectedAreas`, `VerificationIntent` — обязательны и должны быть прямыми детьми `C-*`-обёртки: бандл без них не принимается (`change.spec-missing-section`), дубли — `change.spec-duplicate-section`.

**`plan.xml`** — `GraceChangePlan`:

```xml
<GraceChangePlan graceVersion="4.0" status="approved">
  <C-AUDIT-LINKS>
    <IntentSummary>Дописать LINKS: M-* в три файла и прогнать lint.</IntentSummary>
    <BaselineAssertions>
      <MustVerify>
        <Module>M-AUTH-VALIDATE</Module>
      </MustVerify>
      <MustPassCommand>
        <Command>pytest tests/auth/validate.test.ts</Command>
      </MustPassCommand>
    </BaselineAssertions>
    <TargetAssertions>
      <MustLink>
        <From>M-AUTH-VALIDATE</From>
        <To>M-AUTH-TOKENS</To>
      </MustLink>
      <MustExist>
        <Value>.grace/graph/main.xml</Value>
      </MustExist>
    </TargetAssertions>
    <DurableScope>
      <GraphAnchors>
        <M-AUTH-VALIDATE />
      </GraphAnchors>
    </DurableScope>
    <ObservedWriteScope>
      <Path>src/auth/validate.ts</Path>
      <Path>src/auth/tokens.ts</Path>
    </ObservedWriteScope>
    <ImplementationPlan>
      <T-001>
        <Title>Дописать LINKS: M-AUTH-VALIDATE</Title>
        <DependsOn></DependsOn>
        <AcceptanceCriteria>
          <Criterion>В src/auth/validate.ts есть LINKS: M-AUTH-VALIDATE.</Criterion>
        </AcceptanceCriteria>
        <Verification>
          <Command>pytest tests/auth/validate.test.ts</Command>
        </Verification>
      </T-001>
      <T-002>
        <Title>Прогнать lint и detect-changes</Title>
        <DependsOn>T-001</DependsOn>
        <AcceptanceCriteria>
          <Criterion>grace lint --path . --format json: summary.errors = 0.</Criterion>
        </AcceptanceCriteria>
        <Verification>
          <Command>doubled-graph lint</Command>
        </Verification>
      </T-002>
    </ImplementationPlan>
  </C-AUDIT-LINKS>
</GraceChangePlan>
```

**Секции плана:** `IntentSummary`, `BaselineAssertions`, `TargetAssertions`, `DurableScope`, `ObservedWriteScope`, `ImplementationPlan` — прямые дети `C-*`-обёртки, ровно по одному. `BaselineAssertions`/`TargetAssertions` принимают только утверждения из словаря: `MustExist`, `MustNotExist`, `MustOwn`, `MustLink`, `MustVerify`, `MustPassCommand`, `MustContain`, `MustNotContain` (произвольный текст или `<Assertion>` движок отклонит: `change.plan-invalid-section-shape`). Задачи `T-###` — прямые дети `ImplementationPlan`, у каждой ровно один `Title`, один `DependsOn` (пустой — без предшественников), один `AcceptanceCriteria` (≥1 непустой `Criterion`) и один `Verification` (≥1 непустой `Command`); зависимости проверяются на дубли, неизвестные ссылки и циклы.

**Архив:** `applied`, `rejected`, `cancelled`, `superseded` живут в `.grace/changes/archive/`; `draft` и `approved` — в `active/`. Активный бандл без `plan.xml` не считается готовым к исполнению.

---

## 7. `AGENTS.md`

Создаётся при bootstrap проекта (см. `prompts/new-project/02-requirements.md`). Содержит:

- Keywords и Annotation проекта.
- Копию 10 принципов doubled-graph.
- Справочник якорей (см. § «Разметка кода» ниже) и карту `.grace/`.
- Конвенцию логов и verification.
- **phase-блок** (см. `drift-and-priority.md`):

```markdown
<!-- doubled-graph:phase:start -->
## doubled-graph phase
phase: post_migration
updated: 2026-04-18
<!-- doubled-graph:phase:end -->
```

ИИ-ассистент читает `AGENTS.md` первым при входе в репозиторий.

---

## Разметка кода (якоря)

Синтаксис комментариев адаптируется под язык (см. `language-adapters/*.md`). Ниже — в TypeScript-варианте.

```ts
// START_MODULE_CONTRACT
// PURPOSE: validate JWT and resolve User
// SCOPE: src/auth/validate.ts
// DEPENDS: M-AUTH-TOKENS
// LINKS: M-AUTH-VALIDATE
// ROLE: RUNTIME
// MAP_MODE: EXPORTS
// END_MODULE_CONTRACT

// START_MODULE_MAP
// validateUser - validates JWT, resolves User
// validateToken - low-level token check
// END_MODULE_MAP

// START_CONTRACT: validateUser
// PURPOSE: validate JWT, resolve user
// INPUTS: req: Request (with Authorization: Bearer header)
// OUTPUTS: User | null (null if invalid, never throws)
// SIDE_EFFECTS: none
// LINKS: M-AUTH-VALIDATE
// END_CONTRACT: validateUser
export function validateUser(req: Request): User | null {
  // START_BLOCK_DECODE_JWT
  const token = extractToken(req);
  const payload = decodeJwt(token);
  // END_BLOCK_DECODE_JWT

  // START_BLOCK_CHECK_CLOCK_SKEW
  if (Math.abs(Date.now() - payload.iat * 1000) > 60_000) return null;
  // END_BLOCK_CHECK_CLOCK_SKEW

  return payload.user;
}

// START_CHANGE_SUMMARY
// LAST_CHANGE: 2026-04-12 — tightened JWT clock-skew tolerance to 60s (DG-Authored: ai)
// END_CHANGE_SUMMARY
```

**Правила:**

- **Модуль-контракт** — все ключи UPPERCASE. Обязательные: `PURPOSE`, `SCOPE`, `DEPENDS`, `LINKS`. Lint парсит только строки `^([A-Z_]+):\s*(.+)$` — ключи в lowercase молча игнорируются.
- **`LINKS` — только `M-*`.** Движок фильтрует значение по `^M-[A-Z0-9-]+$`: `UC-*` и `V-M-*` там игнорируются, и файл остаётся непривязанным к модулю (в drift это `code_without_module`). Несколько модулей — через запятую.
- **`ROLE` и `MAP_MODE`.** `ROLE` ∈ `RUNTIME | TEST | BARREL | CONFIG | TYPES | SCRIPT`. `MAP_MODE`, если указан, обязан соответствовать роли: `RUNTIME→EXPORTS`, `TEST→LOCALS`, `BARREL→SUMMARY`, `CONFIG→NONE`, `TYPES→EXPORTS`, `SCRIPT→LOCALS`. Расхождение — ошибка `markup.role-map-mode-mismatch`; при отсутствии `MAP_MODE` он выводится из `ROLE`.
- **MODULE_MAP** — по одному экспорту на строку, формат `symbolName - description`. Lint извлекает имя символа для проверки паритета с реальными экспортами файла (в режиме `EXPORTS`).
- **Function-контракт** — перед определением функции (для TS/Java/Go); в Python — в docstring под `def` (см. `language-adapters/python.md`).
- **Блок** — ≤ 500 токенов, имена уникальны **в файле**, но могут совпадать между файлами.
- **CHANGE_SUMMARY** — опционален. `LAST_CHANGE:` больше не обязателен: история правок живёт в git и в бандлах `C-*`, а не в файле.

`doubled-graph lint` (обёртка `grace lint`) проверяет парность открывающих/закрывающих якорей, уникальность в файле, соответствие имени функции в `START_CONTRACT:`/`END_CONTRACT:`, наличие UPPERCASE-ключей модуль-контракта (`PURPOSE`, `SCOPE`, `DEPENDS`, `LINKS`), существование `M-*` из `LINKS` в `.grace/graph`, паритет `MODULE_MAP` ↔ реальных экспортов файла и соответствие `ROLE`/`MAP_MODE`.

---

## Structured logs

Каждое лог-событие имеет минимум полей (см. § 13 методологии draft):

```json
{
  "ts": "2026-04-18T10:22:04.123Z",
  "level": "info",
  "anchor": "validateUser:BLOCK_DECODE_JWT",
  "module": "M-AUTH-VALIDATE",
  "requirement": "place_order: подтверждение заказа ≤ 3s",
  "correlation_id": "req_abc123",
  "event": "jwt_decoded",
  "belief": "payload trusted, skew=0"
}
```

`anchor` имеет формат `<function>:<block>` (или просто `<function>` для function-level события) и **должен** совпадать с именем якоря в коде. Поле `requirement` — свободная ссылка на формулировку из `.grace/context/requirements.xml` или на id бандла `C-*`: якоря `UC-*` в GRACE 4 нет.

**Privacy-правила** — `drift-and-priority.md § Logs privacy` + `runtime-adapters/*.md`.

**OpenTelemetry GenAI — НЕ обязателен.** Команды могут использовать свой observability-стек; маркирование лог-полей выше — достаточный baseline. См. `memory/project_otel_dropped.md`.

---

## Миграция с GRACE 3

GRACE 3 держал состояние в шести `docs/*.xml` (`requirements.xml`, `technology.xml`, `development-plan.xml`, `knowledge-graph.xml`, `verification-plan.xml`, `operational-packets.xml`). Движок 4.x такие проекты не конвертирует и не читает — он их отвергает. Мост — `doubled-graph migrate`.

**`doubled-graph migrate check`** — read-only инвентаризация: какие legacy-документы найдены, сколько модулей/верификаций переносится, какие `MODULE_CONTRACT` нужно починить. Ничего не пишет.

**`doubled-graph migrate apply [--dry-run] [--no-markup-fix]`** — копирует legacy-модель в `.grace`:

- создаёт все пять `context/*.xml`, `.grace/graph/{index,main}.xml`, `.grace/verification/{index,main}.xml`, `changes/active/`, `changes/archive/`;
- переносит модули (`Name`, `Status`, `Summary`, `Path`, `Exports`, `Depends`), переименовывает verification-записи под схему `V-<M-id>`, а для модулей без верификации создаёт **пустые** заглушки `V-<M>`;
- автоматически дописывает `LINKS: M-*` в `MODULE_CONTRACT` файлов, потерявших связь (это единственная привязка файла к модулю; отключается `--no-markup-fix`);
- записывает отчёт `.doubled-graph/migrations/grace3-to-grace4.json` со списками `placeholders`, `ambiguous_links`, `ambiguities`, `unsupported`;
- **legacy `docs/*.xml` только читает** — не удаляет и не переписывает; существующий `.grace` не перезаписывает.

`--dry-run` печатает тот же отчёт без записи на диск.

**Что останется сделать руками:**

1. **Заполнить пустые `V-<M>`.** Заглушки проходят структурный gate (покрытие формально есть), но `grace module health` и warning `verification.placeholder` продолжают на них указывать. Вписывать нужно реальные `TestFiles`/`Command`/`Scenario` — придуманная команда превращает «не проверено» в «проверено», это ровно тот отказ, против которого методология и существует.
2. **Проверить миграционные `unknown`** в `technology.xml` (и в `requirements.xml`, где текст собран эвристикой) — в отчёте они помечены `ambiguities`.
3. **Дозакрыть `LINKS: M-*`** там, где автоматика не справилась: файлы из `ambiguous_links`, файлы без модуля в `graph/main.xml`.
4. **Заархивировать `docs/`** — перенос в `docs/legacy/` или удаление. Только после отдельного одобрения человеком: до этого два источника истины сосуществуют, и агент обязан считать источником `.grace`.
5. **Подтвердить результат:** `grace lint --path . --format json` → `summary.errors = 0`; `grace status --path . --json` → `projectKind = grace4`, `integrity.errors` пуст, `derivedStates` без висящих бандлов.
6. **Переключить phase** — `doubled-graph phase set post_migration --reason "migration complete"` (см. `drift-and-priority.md`).

Порядок шагов и approval-gates — в `workflow.md § Сценарий 2`.

---

## Жизненный цикл артефактов

| Артефакт | bootstrap (intent-интервью + `Write` шаблона) | architecture-gate (`Edit` модулей) | execute-фаза (после кодогенерации) | поддержка |
|---|---|---|---|---|
| `context/requirements.xml` | шаблон + ответы пользователя | + детальные use-cases текстом | обычно не меняется | `Edit` при новой фиче |
| `context/technology.xml` | шаблон | стек утверждён | не меняется | `Edit` при апгрейде стека |
| `context/principles.xml` | копия 10 принципов | не меняется | не меняется | редко |
| `context/deployment.xml` | шаблон или `not-applicable` | уточняется | не меняется | `Edit` при смене поставки |
| `context/ux-guidelines.xml` | шаблон или `not-applicable` | уточняется | не меняется | редко |
| `graph/index.xml` + `graph/main.xml` | шаблон | модули + `Depends` + `Exports` | контракты сверены с реальным кодом, `Owns` закрыт | `Edit` через skill `doubled-graph-after-edit` шаг 2 |
| `verification/index.xml` + `verification/main.xml` | шаблон + заглушки `V-<M>` | черновики сценариев | заполнено после прогонов | `Edit` через skill `doubled-graph-verify` |
| `changes/active/C-*/` | — | `spec.xml` + approval | `plan.xml` + `T-###` по факту | бандл на каждое изменение, затем архив |
| `AGENTS.md` | копия шаблона + phase-блок | не меняется | не меняется | `doubled-graph phase set` при переключении режима |
