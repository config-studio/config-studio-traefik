# 04 — Development Plan

**Роль ИИ:** построить `.grace/graph/main.xml` (модули `M-*`, data flows `DF-*`) с маршрутом `Owns` в `.grace/graph/index.xml`, создать активный бандл `.grace/changes/active/C-001-INITIAL-BUILD/` (`spec.xml` + `plan.xml` с задачами `T-###`). Approval-gates: архитектура модулей + verification draft.

---

## Externalize state

Плановая стадия — итеративная: декомпозиция на модули → контракты → фазы → verification draft. Каждый шаг ревьюит пользователь, между итерациями легко набирается 30+ минут диалога. Веди:

- `.doubled-graph/drafts/plan.md` — append-only, собирается на шагах 1–6 **до** финального рендеринга `.grace/graph/main.xml`, `spec.xml`, `plan.xml`.
- **Читает input**: `.doubled-graph/drafts/interview.md` (из шага 01) и `.grace/context/requirements.xml` (из шага 02).
- **Продолжается на шаге 05** (verification-plan) — тот же файл обогащается черновиками `V-M-*`.
- Финальный рендеринг в `.grace/**` (шаги 5–6 ниже) — из scratchpad'а, не истории чата.

Формат:

```markdown
# Plan draft
Started: <ISO>
Status: in-progress | completed
Reads-from: .doubled-graph/drafts/interview.md, .grace/context/requirements.xml

## Modules
- M-AUTH-VALIDATE (critical): обслуживает цель 1, Summary: «валидирует JWT»; deps: M-AUTH-TOKENS
- ...

## Phases
- Phase-1: [M-AUTH-TOKENS] → T-001
- Phase-2: [M-AUTH-VALIDATE, M-ROUTES-LOGIN] → T-002

## Data flows
- DF-LOGIN: M-ROUTES-LOGIN → M-AUTH-VALIDATE → M-SESSION-CREATE

## Approvals
- <ISO>: architecture approved (Step 7)
- <ISO>: verification draft approved (Step 8)
- <ISO>: execution plan approved (06-generate Step 0)

## V-M-* drafts (step 05)
- V-M-AUTH-VALIDATE: priority high; scenario success «valid JWT → User»; marker VALIDATE_SUCCESS
```

---

## Инструкция

**Шаг 1 — декомпозиция на модули.**

Для каждой цели из `.grace/context/requirements.xml` спроси: какие модули нужны? Не пиши код, описывай **интерфейсы**.

Правила:
- Имя модуля: `M-DOMAIN-PURPOSE`, напр. `M-AUTH-VALIDATE`, `M-ORDERS-CREATE`. Только заглавные буквы, цифры и дефис: `^M-[A-Z0-9-]+$` — иначе якорь считается malformed и `grace lint` его не увидит.
- Один модуль = один смысловой компонент. Не «utils», не «helpers» в начальном плане (потом выделится).
- Риск-класс модуля (живёт в scratchpad'е, в XML отдельного поля нет):
  - `critical` — auth, payments, data-integrity, PII-flow → в шаге 05 станет `<Priority>high</Priority>`;
  - `standard` — обычная бизнес-логика → `<Priority>medium</Priority>`;
  - `helper` — форматтеры, парсеры, глупые обёртки → `<Priority>low</Priority>`.

**Шаг 2 — контракты модулей (прозой в scratchpad).**

Для каждого `M-*` зафиксируй в `.doubled-graph/drafts/plan.md`:

```markdown
### M-AUTH-VALIDATE
- Смысл: валидировать входящий JWT и вернуть аутентифицированного пользователя.
- Входы: request (HTTP-запрос с Authorization).
- Выходы: User | null.
- Ошибки: INVALID_JWT, CLOCK_SKEW_EXCEEDED.
- Pre/post/invariants: iat не старше 60 с; секрет не логируется.
- Обслуживает: третью `<Goal>` из .grace/context/requirements.xml.
```

Pre/post/invariants — прозой, но точной. Это ground-truth для bug-fix workflow в будущем (skill `doubled-graph-drift` § B.6 будет проверять реальную сигнатуру против этого контракта).

В `.grace` отсюда попадает `<Summary>` модуля; окончательная форма контракта — это `MODULE_CONTRACT` в коде (пишется на шаге 06, поля `PURPOSE`/`SCOPE`/`DEPENDS`/`LINKS`).

**Шаг 3 — фазы → задачи `T-###`.**

Разбей модули на фазы исполнения. Правило: модули одной фазы могут выполняться **параллельно** (нет зависимостей между ними). Зависимости — между фазами. Каждая фаза становится задачей `T-###` в `ImplementationPlan` (шаг 6). Нумерация с нулями: `T-001`, `T-002`, … — это единственный допустимый формат id задачи.

Для MVP обычно 2–4 фазы. Больше — скорее всего переусложнение.

**Шаг 4 — data flows для критических целей.**

Для критических потоков опиши `DF-*` (data flow) в `.grace/graph/main.xml`:

- `DF-*` — прямой ребёнок `GD-*`, рядом с модулями; имя `^DF-[A-Z0-9-]+$`;
- шаги потока — **текст** внутри `<Steps><Step>…</Step></Steps>`; не вкладывай в `DF-*` теги `M-*`/`DF-*` — вложенный якорь создаёт связь, и `grace lint` потребует, чтобы модуль существовал (`projection.graph.dangling-link`).

Обязательно для критических целей (всегда максимальная глубина — см. `methodology/auto-scaling.md`).

**Шаг 5 — рендеринг `.grace/graph/main.xml` и `Owns` в `.grace/graph/index.xml`.**

`.grace/graph/main.xml`:

```xml
<GraceGraphDocument graceVersion="4.0">
  <GD-MAIN>
    <M-AUTH-TOKENS>
      <Name>Auth tokens</Name>
      <Status>planned</Status>
      <Summary>Выпускает и обновляет JWT-токены.</Summary>
      <Path>src/auth/tokens.py</Path>
    </M-AUTH-TOKENS>
    <M-AUTH-VALIDATE>
      <Name>Auth validate</Name>
      <Status>planned</Status>
      <Summary>Валидирует входящий JWT и возвращает пользователя. Обслуживает цель 1.</Summary>
      <Path>src/auth/validate.py</Path>
      <Depends>
        <M-AUTH-TOKENS />
      </Depends>
    </M-AUTH-VALIDATE>
    <M-ROUTES-LOGIN>
      <Name>Routes login</Name>
      <Status>planned</Status>
      <Summary>Принимает POST /login и вызывает валидацию.</Summary>
      <Path>src/routes/login.py</Path>
      <Depends>
        <M-AUTH-VALIDATE />
      </Depends>
    </M-ROUTES-LOGIN>
    <DF-LOGIN>
      <Summary>Логин: маршрут принимает запрос, валидация проверяет креды, сессия создаётся.</Summary>
      <Steps>
        <Step>M-ROUTES-LOGIN принимает POST /login</Step>
        <Step>M-AUTH-VALIDATE проверяет креды</Step>
        <Step>M-SESSION-CREATE создаёт сессию</Step>
      </Steps>
    </DF-LOGIN>
  </GD-MAIN>
</GraceGraphDocument>
```

`.grace/graph/index.xml` — `Owns` обязан перечислять **ровно те якоря**, что объявлены в `main.xml` (ни больше, ни меньше; расхождения — ошибки `projection.graph.unlisted-anchor` / `projection.graph.missing-anchor`):

```xml
<GraceGraphIndex graceVersion="4.0">
  <GraphDocuments>
    <GD-MAIN>
      <Path>graph/main.xml</Path>
      <Owns>
        <M-AUTH-TOKENS />
        <M-AUTH-VALIDATE />
        <M-ROUTES-LOGIN />
        <DF-LOGIN />
      </Owns>
    </GD-MAIN>
  </GraphDocuments>
</GraceGraphIndex>
```

Правила рендеринга:
- `M-*` и `DF-*` — **прямые дети** `GD-MAIN`; группировать их нельзя (`projection.graph.nested-anchors`).
- Поля модуля: `<Name>`, `<Status>`, `<Summary>`, `<Path>`, `<Depends>`. `<Status>` — свободный текст; используй `planned` до появления файла и `existing` после (шаг 06).
- Зависимость — вложенный тег модуля внутри `<Depends>`: `<M-AUTH-TOKENS />`.
- Каждое добавление/удаление якоря в `main.xml` — тем же коммитом правка `Owns` в `index.xml`.
- До шага 05 `grace lint` будет закономерно сообщать `projection.verification.missing-module-coverage` для каждого модуля — V-записи появляются на шаге 05.

**Шаг 6 — активный бандл `C-001-INITIAL-BUILD`.**

Любое изменение кода в GRACE 4 идёт через бандл: `spec.xml` (что и зачем) + `plan.xml` (как и в каком порядке). Первая сборка проекта — тоже изменение.

```bash
mkdir -p .grace/changes/active/C-001-INITIAL-BUILD
```

`.grace/changes/active/C-001-INITIAL-BUILD/spec.xml`:

```xml
<GraceChangeSpec graceVersion="4.0" status="draft">
  <C-001-INITIAL-BUILD>
    <Summary>Собрать MVP: инфраструктура токенов, валидация, маршрут логина.</Summary>
    <Goals>
      <Goal>Реализовать цели 1–3 из .grace/context/requirements.xml.</Goal>
    </Goals>
    <Constraints>
      <Constraint>Стек — только из .grace/context/technology.xml.</Constraint>
      <Constraint>Артефакты — только в .grace/; docs/*.xml не создаём.</Constraint>
    </Constraints>
    <NonGoals>
      <NonGoal>Оптимизации и рефакторинг сверх MVP.</NonGoal>
      <NonGoal>Интеграции, которых нет в requirements.xml.</NonGoal>
    </NonGoals>
    <AcceptanceCriteria>
      <Criterion>Каждый M-* имеет V-M-* с непустым Command и проходящим тестом.</Criterion>
      <Criterion>grace lint --path . --format json возвращает 0 ошибок.</Criterion>
      <Criterion>doubled-graph detect-changes --scope all возвращает пустой drift.</Criterion>
    </AcceptanceCriteria>
    <AffectedAreas>
      <M-AUTH-TOKENS />
      <M-AUTH-VALIDATE />
      <M-ROUTES-LOGIN />
    </AffectedAreas>
    <VerificationIntent>
      <Intent>На каждый модуль — success- и failure-сценарий, плюс marker в structured log.</Intent>
    </VerificationIntent>
  </C-001-INITIAL-BUILD>
</GraceChangeSpec>
```

`.grace/changes/active/C-001-INITIAL-BUILD/plan.xml`:

```xml
<GraceChangePlan graceVersion="4.0" status="draft">
  <C-001-INITIAL-BUILD>
    <IntentSummary>Собрать MVP по фазам: токены → валидация → маршрут логина.</IntentSummary>
    <BaselineAssertions>
      <MustExist>
        <Value>.grace/graph/main.xml</Value>
      </MustExist>
      <MustOwn>
        <Owner>GD-MAIN</Owner>
        <Anchor>M-AUTH-TOKENS</Anchor>
      </MustOwn>
      <MustPassCommand>
        <Command>grace lint --path . --format json</Command>
      </MustPassCommand>
    </BaselineAssertions>
    <TargetAssertions>
      <MustVerify>
        <Module>M-AUTH-TOKENS</Module>
      </MustVerify>
      <MustVerify>
        <Module>M-AUTH-VALIDATE</Module>
      </MustVerify>
      <MustLink>
        <From>M-AUTH-VALIDATE</From>
        <To>M-AUTH-TOKENS</To>
      </MustLink>
      <MustPassCommand>
        <Command>pytest tests/auth/ -v</Command>
      </MustPassCommand>
    </TargetAssertions>
    <DurableScope>
      <GraphAnchors>
        <M-AUTH-TOKENS />
        <M-AUTH-VALIDATE />
        <M-ROUTES-LOGIN />
      </GraphAnchors>
      <VerificationAnchors>
        <V-M-AUTH-TOKENS />
        <V-M-AUTH-VALIDATE />
        <V-M-ROUTES-LOGIN />
      </VerificationAnchors>
    </DurableScope>
    <ObservedWriteScope>
    </ObservedWriteScope>
    <ImplementationPlan>
      <T-001>
        <Title>Фаза 1: инфраструктура токенов (M-AUTH-TOKENS)</Title>
        <DependsOn></DependsOn>
        <AcceptanceCriteria>
          <Criterion>src/auth/tokens.py содержит MODULE_CONTRACT с LINKS: M-AUTH-TOKENS.</Criterion>
          <Criterion>V-M-AUTH-TOKENS проходит по своему Command.</Criterion>
        </AcceptanceCriteria>
        <Verification>
          <Command>pytest tests/auth/test_tokens.py -v</Command>
        </Verification>
      </T-001>
      <T-002>
        <Title>Фаза 2: валидация и маршрут логина (M-AUTH-VALIDATE, M-ROUTES-LOGIN)</Title>
        <DependsOn>T-001</DependsOn>
        <AcceptanceCriteria>
          <Criterion>Валидация возвращает User | null и логирует VALIDATE_SUCCESS / VALIDATE_CLOCK_SKEW.</Criterion>
          <Criterion>V-M-AUTH-VALIDATE и V-M-ROUTES-LOGIN проходят.</Criterion>
        </AcceptanceCriteria>
        <Verification>
          <Command>pytest tests/auth/test_validate.py tests/routes/test_login.py -v</Command>
        </Verification>
      </T-002>
    </ImplementationPlan>
  </C-001-INITIAL-BUILD>
</GraceChangePlan>
```

Правила бандла:
- Имя каталога — `C-NNN-UPPER-SLUG` (`C-001-INITIAL-BUILD`); только заглавные буквы, цифры и дефис. Ровно один прямой `C-*` wrapper на документ — два бандла в одном файле движок не примет.
- Статус — **атрибут корня**, не элемент: `<GraceChangeSpec graceVersion="4.0" status="draft">` и `<GraceChangePlan graceVersion="4.0" status="draft">`. Внутри бандла `<Status>` движок не читает.
- Жизненный цикл статуса: `active/` держит `draft` и `approved`; `applied` / `rejected` / `cancelled` / `superseded` живут только в `archive/`. Других значений нет.
- Обязательные секции `spec.xml` (прямые дети wrapper'а, все непустые): `Summary`, `Goals`, `Constraints`, `NonGoals`, `AcceptanceCriteria`, `AffectedAreas`, `VerificationIntent`.
- Обязательные секции `plan.xml` (прямые дети wrapper'а): `IntentSummary`, `BaselineAssertions`, `TargetAssertions`, `DurableScope`, `ObservedWriteScope`, `ImplementationPlan`.
- Утверждения в `BaselineAssertions`/`TargetAssertions` — только типизированные элементы: `MustExist{Value}`, `MustNotExist{Value}`, `MustOwn{Owner,Anchor}`, `MustLink{From,To}`, `MustVerify{Module}`, `MustPassCommand{Command}`, `MustContain{File,Text}`, `MustNotContain{File,Text}`. Свободный текст или `<Assertion>` = `change.plan-invalid-section-shape`.
- Задача `T-###` (прямой ребёнок `ImplementationPlan`) содержит ровно: один `Title`, один `DependsOn` (пустой = без предшественников, либо `T-001, T-002`), один `AcceptanceCriteria` (≥1 `Criterion`), один `Verification` (≥1 `Command`).
- `DurableScope` — из набора `GraphAnchors` / `VerificationAnchors` / `GraphDocuments` / `VerificationDocuments` / `ContextArtifacts` / `ContextArtifact` / `Context` / `Artifact` / `None`, внутри — прямые якоря (`<M-… />`, `<V-M-… />`).
- `ObservedWriteScope` — только `File` / `Path` / `Glob` / `None`; заполняется по факту — после каждой волны кода (шаг 06), не заранее.

**Шаг 7 — approval gate (архитектура модулей):**

Покажи пользователю в таком порядке:

1. Список модулей (id, Summary, риск-класс) таблицей + ASCII-граф фаз.
2. **⚠ Особое внимание** (если применимо, иначе «отклонений нет»): новые/удалённые модули при revision; смена риск-класса; модули, обслуживающие несколько целей; `critical` без verification-стратегии; сложные/циклические зависимости.
3. **Чек-лист одобрения**:
   - [ ] каждая `<Goal>` покрыта хотя бы одним `M-*`;
   - [ ] риск-класс расставлен осознанно (не всё `critical`);
   - [ ] scope каждого модуля ясен;
   - [ ] циклических зависимостей нет;
   - [ ] orphan-модулей нет;
   - [ ] `Owns` в `graph/index.xml` совпадает с набором якорей `graph/main.xml`.
4. Вопрос:

   > Архитектура модулей и бандл `C-001-INITIAL-BUILD`. Чтобы одобрить — подтвердите по чек-листу. Если есть правки — назовите модуль и что изменить.

**Не переходи** к шагу 8 без явного подтверждения. Ответ «ок» без упоминания чек-листа — просьба пройти его явно.

**При revision**: покажи diff (`+ added`, `- removed`, `~ changed: old → new`), не полный план заново.

**Шаг 8 — черновик verification (approval-gate №2).**

Для каждого модуля предложи **ровно одну** запись `V-<M-id>` (это канон GRACE 4: `M-AUTH` → `V-M-AUTH`; несколько сценариев — несколько `<Scenario>` внутри одной записи, а не несколько `V-M-*`). Критические — минимум success + failure сценарий.

Черновик пишется в `.doubled-graph/drafts/plan.md § V-M-* drafts`; в `.grace/verification/main.xml` записи попадут на шаге 05.

```xml
<V-M-AUTH-VALIDATE>
  <Priority>high</Priority>
  <Cwd>.</Cwd>
  <TestFiles>
    <File>tests/auth/test_validate.py</File>
  </TestFiles>
  <Command>pytest tests/auth/test_validate.py -v</Command>
  <Scenario>valid JWT with fresh iat возвращает User</Scenario>
  <Marker>[auth][VALIDATE_SUCCESS]</Marker>
  <TraceAssertion>лог содержит VALIDATE_SUCCESS и user_id</TraceAssertion>
</V-M-AUTH-VALIDATE>
```

Команды запуска и markers уточняются на шаге 05.

**Шаг 9 — approval gate (verification draft):**

Покажи:

1. Список `V-M-*` по модулям (id, priority, сценарий).
2. **⚠ Особое внимание**: `critical`-модули только с unit (без integration); `critical`/`standard` без единого сценария; сценарии покрывают только happy path. Иначе — «отклонений нет».
3. **Чек-лист**:
   - [ ] у каждого `M-*` есть ровно один `V-<M-id>`;
   - [ ] `critical`-модули имеют ≥ 1 integration-проверку;
   - [ ] каждый сценарий конкретен (не абстрактный);
   - [ ] failure-сценарии есть для критических.
4. Вопрос:

   > Verification draft. Подтвердите по чек-листу; если нужно добавить — назовите модуль и сценарий.

**Переходим** к `05-verification-plan.md` только после явного подтверждения. При revision — diff, не полный список.

---

## Правила

- **Каждая `<Goal>` должна иметь** минимум один `M-*`, который её реализует. Проверь.
- **Каждый критический модуль** должен иметь минимум success+ failure сценарий в draft.
- **Циклические зависимости недопустимы.** Если появились — декомпозируй дальше.
- **Не изобретай модули без цели.** Каждый `M-*` ↔ минимум одна цель из `requirements.xml`.
- **Только `.grace/`.** Никаких `docs/development-plan.xml` и `docs/knowledge-graph.xml` — этих артефактов в GRACE 4 нет.

---

## Переход

После двух approval gates — прочитай `prompts/new-project/05-verification-plan.md` через Read tool и следуй его инструкциям.
