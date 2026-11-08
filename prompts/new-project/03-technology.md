# 03 — Technology

**Роль ИИ:** заполнить `.grace/context/technology.xml` и (при необходимости) `.grace/context/deployment.xml`. Источник — `.doubled-graph/drafts/interview.md § Блок B` (стек проговорен в интервью). Читай scratchpad, не chat history.

---

## Инструкция

**Шаг 1.** На основе ответов интервью + целей из `.grace/context/requirements.xml` (особенно `<Constraints>`) предложи стек:

- Runtime (язык + current-stable / LTS на момент сессии; конкретный minor **не пинь**).
- Key libraries (framework, DB driver, auth, validation).
- Testing framework (см. language-adapter из `methodology/language-adapters/`).
- Deployment target (Docker / k8s / serverless / …).

Stack заполняется **полностью**: все позиции, диапазоны версий, compatibility matrix. Для крошечных проектов список будет короче естественно (меньше библиотек), но формат полный.

**Правило выбора версий.** Методология **не диктует конкретные версии** — они устаревают за недели.
- **Нижний floor** — только там, где его навязывает зависимость (напр., «Python 3.12+» потому что FalkorDB Lite требует). Обосновывай, если floor появляется.
- **Верх** — не фиксируй «ровно X.Y.Z». Используй диапазоны (`^`, `~`, `>=`) или формулировку «current stable на момент setup». Exact pins — задача lockfile, не `technology.xml`.
- На момент сессии ИИ **сверяет актуальные версии** через WebFetch/WebSearch на официальных registry/docs, не полагается на знания из претрейна.

**Шаг 2.** Покажи предложение пользователю **как саммари**, не сразу как XML:

```
Предлагаю стек (current stable на момент выбора, конкретные версии — из registry):
- Runtime: <язык> <LTS или current stable>
- Framework: <web-фреймворк>, последняя major
- DB: <СУБД> через <ORM/driver>, последняя major
- Auth: <решение> (custom JWT | external IdP)
- Validation: <runtime-schema-lib из language-adapter>
- Testing: <framework из language-adapter>
- Deployment: <Docker | k8s | serverless | bare-metal>
Принимаешь? Хочешь заменить что-то?
```

ИИ подставляет конкретные имена и диапазоны версий из актуальных источников, **не** копирует из этого шаблона как есть.

**Шаг 3.** После согласования — заполни `.grace/context/technology.xml`.

Обязательные поля (ровно эти теги, без атрибутов): `<Language>`, `<Runtime>`, `<Framework>`, `<TestingStack>`, `<Observability>`, `<OperationalConstraints>`. Библиотек отдельного списка в GRACE 4 нет — каждая значимая зависимость и её диапазон версий идут отдельной `<Constraint>` внутри `<OperationalConstraints>`.

```xml
<GraceTechnology graceVersion="4.0">
  <Language>Python</Language>
  <Runtime>3.12 (floor: 3.12 из-за FalkorDB Lite)</Runtime>
  <Framework>FastAPI, последняя major</Framework>
  <TestingStack>pytest + pytest-asyncio; тесты в tests/</TestingStack>
  <Observability>structlog, JSON-формат; OpenTelemetry не подключаем без явного запроса</Observability>
  <OperationalConstraints>
    <Constraint>PostgreSQL &gt;= 16 через asyncpg, драйвер без ORM</Constraint>
    <Constraint>Pydantic &gt;= 2.8 для валидации на границе</Constraint>
    <Constraint>Runtime-зависимости — только диапазоны; exact pins живут в lockfile</Constraint>
    <Constraint>Деплой — Docker-образ, локально docker compose</Constraint>
  </OperationalConstraints>
</GraceTechnology>
```

**Шаг 3b — `.grace/context/deployment.xml`.**

- Если deployment-требований и окружений нет: `<Applicability>not-applicable</Applicability>` + `<Reason>…</Reason>` (обязателен при not-applicable).
- Если есть: `<Applicability>applicable</Applicability>`, дальше — произвольные PascalCase-теги без атрибутов (семантических якорей в этом файле нет).

```xml
<GraceDeployment graceVersion="4.0">
  <Applicability>applicable</Applicability>
  <Summary>Один Docker-образ, окружения dev и prod.</Summary>
  <Environments>
    <Environment>dev — docker compose, локальная БД</Environment>
    <Environment>prod — тот же образ, managed PostgreSQL</Environment>
  </Environments>
  <Constraints>
    <Constraint>Переменные окружения через .env, секреты не в образе</Constraint>
  </Constraints>
</GraceDeployment>
```

Тот же код применимости действует для `.grace/context/ux-guidelines.xml`: если у продукта есть UI — `<Applicability>applicable</Applicability>` и содержимое гайдлайнов; если его нет — `not-applicable` + обязательный `<Reason>`.

**Шаг 4 — Approval gate (technology stack):**

> «Technology зафиксирован. Можем ли переходить к Development Plan?»

Ждёшь подтверждения, прочитай `prompts/new-project/04-development-plan.md` через Read tool и следуй его инструкциям.

---

## Анти-паттерны

- Не предлагай стек, который **ты** считаешь «модным», если он не соответствует опыту пользователя. Лучше boring stack, который команда знает.
- Не вноси exact pin'ы версий (`X.Y.Z` ровно) в `technology.xml` — это задача lockfile. В артефакте — только диапазоны.
- Не копируй устаревшие версии из своего претрейна — **проверь** актуальный релиз через WebFetch/WebSearch на официальном источнике в момент сессии.
- Не добавляй observability-стек, если не было явного запроса (OTel GenAI не обязателен — см. `memory/project_otel_dropped.md`).
- Не оставляй `deployment.xml` в `not-applicable` без `<Reason>` — движок такое не примет.
- Не создавай `docs/technology.xml` — артефакт живёт только в `.grace/context/technology.xml`.
