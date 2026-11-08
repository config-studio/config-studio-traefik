# 03 — Draft Development Plan

**Роль ИИ:** построить `.grace/graph/main.xml` (модули `M-*`, data flows `DF-*`) с `Owns` в `.grace/graph/index.xml` поверх существующего кода и завести активный бандл миграции `.grace/changes/active/C-001-LEGACY-MARKUP/` с задачами `T-###`.

---

## Externalize state

Плана на 10+ модулей + зависимости + риск-классы + фазы + data flows — легко 200+ решений. Локальная модель точно потеряет часть к концу. Веди:

- `.doubled-graph/drafts/plan-draft.md` — accumulate cluster→module mapping, risk class decisions, dependencies, phases.
- **Источник входных данных**: `.doubled-graph/drafts/discover.md` (из шага 01) и `.doubled-graph/drafts/intent-recovery.md` (из шага 02) — читай их, не память.
- После approval — финальный XML генерируется из scratchpad'а.

Формат:

```markdown
# Plan draft
Started: <ISO>
Status: in-progress | completed
Reads-from: .doubled-graph/drafts/discover.md, .doubled-graph/drafts/intent-recovery.md

## Cluster → Module mapping (user-confirmed)
- cluster_1 (12 файлов: src/auth/*) → M-AUTH-CORE (risk: critical, reason: PII+auth)
- cluster_2 → M-AUTH-VALIDATE (risk: critical)
- уже в .grace/graph после migrate: M-ORDERS-CORE — подтверждён, без изменений
- ...

## Technology (from pyproject.toml/package.json/...)
- Runtime: ...
- Main libs: ...

## Dependencies between modules (from computed graph)
- M-AUTH-VALIDATE → M-AUTH-TOKENS
- ...

## Phases (markup order)
- T-001: M-AUTH-VALIDATE, M-PAYMENTS-CHARGE
- T-002: ...

## Data flows (for critical goals)
- DF-LOGIN: M-ROUTES-LOGIN → M-AUTH-VALIDATE → M-SESSION-CREATE

## User approvals
- 2026-04-18T14:12: module list approved
- 2026-04-18T14:20: risk classes approved
```

---

## Шаги

**Шаг 1 — cluster-to-module mapping.**

`doubled-graph analyze --mode full --repo .` (шаг 01) уже построил computed graph с кластерами (Leiden-like grouping). Для каждого кластера:

- имя → эвристическое `M-DOMAIN-PURPOSE` на основе имён файлов в кластере (заглавные буквы, цифры, дефис: `^M-[A-Z0-9-]+$`);
- `<Path>` — главный файл кластера (остальные — производные, в GRACE 4 у модуля одно основное `<Path>`);
- `<Summary>` — пустой: заполняется на шаге 04 через markup.

**Ветка (б):** `migrate apply` уже создал модули из `docs/knowledge-graph.xml`/`docs/development-plan.xml`. Их не пересоздавай — **сверь** с computed graph и исправь расхождения (лишние/недостающие), а не набирай заново.

Покажи пользователю маппинг:

```
Computed clusters → M-* candidates:

cluster_1 [12 файлов]: src/auth/*
  → M-AUTH-CORE?

cluster_2 [4 файла]: src/auth/validate.py + 3 теста
  → M-AUTH-VALIDATE?

cluster_3 [18 файлов]: src/orders/*
  → M-ORDERS-CORE?

...
```

Пользователь подтверждает / переименовывает. Модульная декомпозиция — его решение, не твоё.

**Шаг 2 — `.grace/context/technology.xml`.**

Из computed graph извлеки импорты и зависимости. Сопоставь с `pyproject.toml` / `package.json` / `go.mod` / `Cargo.toml` / `*.csproj`. Заполни поля:

- `<Language>`, `<Runtime>` — из lockfile / фактического runtime;
- `<Framework>` — основной фреймворк (или `none`, если его нет);
- `<TestingStack>` — из findings на шаге 01 (какая команда реально гоняет тесты);
- `<Observability>` — что есть по факту (structured logs / stdlib logging / нет);
- `<OperationalConstraints>` — по одной `<Constraint>` на значимую библиотеку с диапазоном версии, плюс ограничения из README/Dockerfile.

`.grace/context/deployment.xml` — `<Applicability>applicable</Applicability>`, если есть Dockerfile / compose / k8s / serverless-конфиг (перечисли окружения); иначе `not-applicable` + обязательный `<Reason>`. То же для `ux-guidelines.xml` (есть UI — `applicable`).

**Шаг 3 — риск-класс для каждого `M-*`.**

Эвристика:
- hotspot (> 10 callers) → `critical`;
- touches PII / auth / payments / secrets → `critical`;
- остальные — `standard`;
- чистые helpers/formatters без вызывающих, кроме соседа в том же кластере → `helper`.

Отдельного поля `criticality` в GRACE 4 нет. Риск-класс живёт в scratchpad'е и превращается в `<Priority>` записи `V-<M-id>` на шаге 05: `critical` → `high`, `standard` → `medium`, `helper` → `low`.

Покажи пользователю, он корректирует.

**Шаг 4 — зависимости между модулями.**

Из computed graph (CALLS, IMPORTS между кластерами) построй `<Depends>` для каждого модуля:

```xml
<M-AUTH-VALIDATE>
  <Name>Auth validate</Name>
  <Status>existing</Status>
  <Summary>Валидирует входящий JWT и возвращает пользователя.</Summary>
  <Path>src/auth/validate.py</Path>
  <Depends>
    <M-AUTH-TOKENS />
  </Depends>
</M-AUTH-VALIDATE>
```

Эти данные уже в `doubled-graph` — просто отрази их. Вложенный `<M-*>`, на который нет объявления в том же документе, даёт `projection.graph.dangling-link`.

**Шаг 5 — фазы (порядок markup-а) и бандл миграции.**

Для миграции фазы соответствуют **порядку markup-а** (см. шаг 04), не генерации. Правило: критические модули первыми, standard — дальше, helpers — последними.

Фазы оформляются задачами `T-###` в активном бандле — другого места для `T-###` в GRACE 4 нет:

```bash
mkdir -p .grace/changes/active/C-001-LEGACY-MARKUP
```

`.grace/changes/active/C-001-LEGACY-MARKUP/spec.xml`:

```xml
<GraceChangeSpec graceVersion="4.0" status="draft">
  <C-001-LEGACY-MARKUP>
    <Summary>Разметить существующий код якорями M-* → V-* без изменения поведения.</Summary>
    <Goals>
      <Goal>Каждый M-* из .grace/graph/main.xml имеет код с LINKS: M-* и заполненную V-&lt;M-id&gt;.</Goal>
    </Goals>
    <Constraints>
      <Constraint>Поведение кода не меняется: только комментарии-якоря и артефакты .grace.</Constraint>
      <Constraint>Legacy docs/*.xml остаются на месте и только читаются.</Constraint>
    </Constraints>
    <NonGoals>
      <NonGoal>Рефакторинг и смена архитектуры — отдельный проект после миграции.</NonGoal>
      <NonGoal>Написание новых тестов для standard-модулей (только фиксация TODO).</NonGoal>
    </NonGoals>
    <AcceptanceCriteria>
      <Criterion>grace lint --path . --format json: 0 ошибок.</Criterion>
      <Criterion>У каждого M-* есть V-&lt;M-id&gt; с непустым Command/Scenario.</Criterion>
      <Criterion>doubled-graph detect-changes --scope all пуст (кроме разрешённых исключений).</Criterion>
    </AcceptanceCriteria>
    <AffectedAreas>
      <M-AUTH-VALIDATE />
      <M-ORDERS-CORE />
    </AffectedAreas>
    <VerificationIntent>
      <Intent>Существующие тесты привязать к V-&lt;M-id&gt;; прогон — команда из V-M-*.</Intent>
    </VerificationIntent>
  </C-001-LEGACY-MARKUP>
</GraceChangeSpec>
```

`.grace/changes/active/C-001-LEGACY-MARKUP/plan.xml`:

```xml
<GraceChangePlan graceVersion="4.0" status="draft">
  <C-001-LEGACY-MARKUP>
    <IntentSummary>Разметка по фазам: критическое → стандартное → helpers.</IntentSummary>
    <BaselineAssertions>
      <MustExist>
        <Value>.grace/verification/main.xml</Value>
      </MustExist>
      <MustPassCommand>
        <Command>pytest -q</Command>
      </MustPassCommand>
    </BaselineAssertions>
    <TargetAssertions>
      <MustVerify>
        <Module>M-AUTH-VALIDATE</Module>
      </MustVerify>
      <MustPassCommand>
        <Command>pytest tests/ -q</Command>
      </MustPassCommand>
    </TargetAssertions>
    <DurableScope>
      <GraphAnchors>
        <M-AUTH-VALIDATE />
        <M-ORDERS-CORE />
      </GraphAnchors>
      <VerificationAnchors>
        <V-M-AUTH-VALIDATE />
      </VerificationAnchors>
    </DurableScope>
    <ObservedWriteScope>
    </ObservedWriteScope>
    <ImplementationPlan>
      <T-001>
        <Title>Фаза 1: разметка критических модулей (auth, payments)</Title>
        <DependsOn></DependsOn>
        <AcceptanceCriteria>
          <Criterion>M-AUTH-VALIDATE и M-PAYMENTS-CHARGE размечены, lint по файлам чистый.</Criterion>
        </AcceptanceCriteria>
        <Verification>
          <Command>pytest tests/auth/test_validate.py -v</Command>
        </Verification>
      </T-001>
      <T-002>
        <Title>Фаза 2: разметка стандартной бизнес-логики (orders, users)</Title>
        <DependsOn>T-001</DependsOn>
        <AcceptanceCriteria>
          <Criterion>M-ORDERS-CORE размечен, V-&lt;M-id&gt; заполнена.</Criterion>
        </AcceptanceCriteria>
        <Verification>
          <Command>pytest tests/orders/ -v</Command>
        </Verification>
      </T-002>
    </ImplementationPlan>
  </C-001-LEGACY-MARKUP>
</GraceChangePlan>
```

Правила бандла:
- Имя каталога `C-NNN-UPPER-SLUG` (`C-001-LEGACY-MARKUP`); ровно один прямой `C-*` wrapper на документ.
- Статус — **атрибут корня**: `<GraceChangeSpec graceVersion="4.0" status="draft">`, `<GraceChangePlan graceVersion="4.0" status="draft">`. Элемент `<Status>` внутри бандла движок не читает.
- `active/` держит `draft` и `approved`; `applied` / `rejected` / `cancelled` / `superseded` — только в `archive/`.
- Обязательные секции `spec.xml`: `Summary`, `Goals`, `Constraints`, `NonGoals`, `AcceptanceCriteria`, `AffectedAreas`, `VerificationIntent` (все непустые, прямые дети wrapper'а).
- Обязательные секции `plan.xml` (прямые дети wrapper'а): `IntentSummary`, `BaselineAssertions`, `TargetAssertions`, `DurableScope`, `ObservedWriteScope`, `ImplementationPlan`.
- `BaselineAssertions`/`TargetAssertions` — только типизированные утверждения: `MustExist{Value}`, `MustNotExist{Value}`, `MustOwn{Owner,Anchor}`, `MustLink{From,To}`, `MustVerify{Module}`, `MustPassCommand{Command}`, `MustContain{File,Text}`, `MustNotContain{File,Text}`. Свободный текст или `<Assertion>` → `change.plan-invalid-section-shape`.
- `T-###`: один `Title`, один `DependsOn` (пустой или `T-001, T-002`), один `AcceptanceCriteria` (≥1 `Criterion`), один `Verification` (≥1 `Command`).
- `DurableScope` — `GraphAnchors`/`VerificationAnchors`/`GraphDocuments`/`VerificationDocuments`/`ContextArtifacts`/`ContextArtifact`/`Context`/`Artifact`/`None` + прямые якоря; `ObservedWriteScope` — `File`/`Path`/`Glob`/`None`. Заполняется по факту, после фаз markup.

**Шаг 6 — data flows.**

Для критических целей — `DF-*` по computed graph. Инструмент уже знает процессы (execution flows). `DF-*` — прямой ребёнок `GD-MAIN`; шаги — текстом внутри `<Steps><Step>…</Step></Steps>`, без вложенных якорей.

**Шаг 7 — рендеринг `.grace/graph/main.xml` и `Owns`.**

Допиши/обнови модули и flows в `.grace/graph/main.xml`, затем приведи `Owns` в `.grace/graph/index.xml` в точное соответствие: `Owns` перечисляет **ровно** те якоря, что объявлены в документе (расхождение — `projection.graph.unlisted-anchor` / `projection.graph.missing-anchor`).

```xml
<GraceGraphIndex graceVersion="4.0">
  <GraphDocuments>
    <GD-MAIN>
      <Path>graph/main.xml</Path>
      <Owns>
        <M-AUTH-TOKENS />
        <M-AUTH-VALIDATE />
        <M-ORDERS-CORE />
        <DF-LOGIN />
      </Owns>
    </GD-MAIN>
  </GraphDocuments>
</GraceGraphIndex>
```

**Шаг 8 — approval gate (architecture):**

Покажи пользователю в **таком порядке**:

1. **Компактный обзор плана**:
   - N модулей, разбивка по риск-классу (например: 5 critical / 12 standard / 8 helper);
   - граф зависимостей ASCII;
   - фазы markup-а (какие модули — в `T-001`, какие — дальше).
2. **⚠ Что требует особого внимания** (специфика миграции):
   - модули, чьи границы восстановлены по computed-graph, но **не подтверждены** пользователем в discover-шаге;
   - модули с неочевидным scope (несколько файлов, несколько кластеров);
   - любой `critical`-модуль без сохранённой legacy-тестовой базы (markup без теста = risk);
   - orphan-кластеры в computed graph, не вошедшие ни в один `M-*`;
   - модули, у которых recovered `<Summary>` расходится с docstring-ами/README legacy-проекта;
   - пустые `V-<M>` заглушки из отчёта миграции (`placeholders`).
   Если ничего — «отклонений нет».
3. **Чек-лист одобрения** (режим `migration`, см. `methodology/drift-and-priority.md`):
   - [ ] план описывает **фактическое** состояние кода, не желаемое;
   - [ ] все bounded contexts покрыты модулями (нет orphan-кластеров);
   - [ ] риск-класс расставлен по реальной зоне ответственности, не по догадке;
   - [ ] порядок markup-фаз: critical → standard → helpers;
   - [ ] `Owns` совпадает с якорями `graph/main.xml`;
   - [ ] рефакторинг-идеи вынесены в отдельный список на **после** миграции, не в этот план.
4. **Вопрос**:

   > План миграции. Чтобы одобрить — подтвердите явно по чек-листу выше. Если какой-то модуль не соответствует реальному коду — назовите его и что нужно поправить.

**При revision**: показывай diff (добавлены/удалены/изменены модули и границы), не полный план заново.

---

## Критическое правило миграции

Этот план **не описывает желаемое будущее состояние**. Он отражает **текущее фактическое состояние**. В режиме `migration` артефакт догоняет код. Если пользователь хочет **изменить** архитектуру — это отдельный проект (рефакторинг), **после** миграции в `post_migration`.

---

## Переход

После approval — прочитай `prompts/migrate-existing-project/04-markup-codebase.md` через Read tool и следуй его инструкциям.
