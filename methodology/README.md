# doubled-graph — методология разработки с ИИ

> **Статус:** Phase 2 draft, 2026-04-18.
> Часть целого проекта; корневой плавающий вход — `../INDEX.md` (будет в Phase 4). Для людей-новичков см. `../for-humans/getting-started.md`.
> Модель артефактов — **GRACE 4** (`.grace/`, `@osovv/grace-cli` >= 4.1).

## Что это

doubled-graph — методология разработки программного обеспечения с ИИ-ассистентом. Расширяет публичную методологию **GRACE** ([osovv/grace-marketplace](https://github.com/osovv/grace-marketplace), MIT) тремя добавками, которых в upstream нет:

1. **Сценарий миграции legacy-кода.** Upstream GRACE предполагает генерацию с нуля; doubled-graph даёт пошаговый процесс для кодовых баз, которые уже существуют.
2. **Политика дрейфа «код ↔ артефакты».** Два режима (`migration`, `post_migration`), чёткие правила разрешения конфликтов. См. `drift-and-priority.md`.
3. **Facade-слой `doubled-graph`.** Тонкая MIT-обёртка над CodeGraphContext и grace-marketplace, выставляет ИИ только 4 инструмента методологии. См. `../docs/SPEC.md`.

## Для кого

- **Инженеры-одиночки и команды**, которым нужна предсказуемая работа с ИИ-ассистентом — чтобы правки не ломали соседние модули и документация не отставала от кода.
- **Любой размер проекта.** Методика универсальна; объём артефактов **не масштабируется** — всегда максимальная глубина. См. `auto-scaling.md` (обоснование).
- **Любой язык**, у которого есть парсер в CodeGraphContext (19 языков на 2026-04). Специфика — в `language-adapters/`.
- **Любой IDE с поддержкой MCP + tools** (Claude Code, Cursor, Codex, Continue, Windsurf, Cline, aider, roo-code, …). Специфика запуска — в `runtime-adapters/`.

**Целевые модели — локальные среднего размера** (Qwen 3, DeepSeek V3, GLM-4.5, Llama 4). На frontier-моделях тоже работает, но методология под них не оптимизируется.

## Что в этой папке

| Файл | О чём |
|---|---|
| `principles.md` | 10 принципов doubled-graph (адаптированы из GRACE с обоснованиями) |
| `workflow.md` | Общий скелет процесса + 3 сценария (новый / миграция / поддержка) |
| `artifacts.md` | Артефакты `.grace`: поля, примеры, жизненный цикл |
| `auto-scaling.md` | Почему не масштабируем под размер проекта — всегда максимальная глубина |
| `tools.md` | grace-marketplace + doubled-graph: когда и что использовать |
| `drift-and-priority.md` | Режимы `migration`/`post_migration`, политика конфликтов |
| `approval-checkpoints.md` | Реальные upstream-точки одобрения + 3 профиля multiagent |
| `roles.md` | Разделение работы человек/ИИ |
| `language-adapters/` | Специфика для Python, TypeScript, Java, Rust, Go, C#, Swift + шаблон |
| `runtime-adapters/` | Конкретные конфиги для Claude Code / Cursor / Codex / Continue / Windsurf / local-llm |
| `ci-templates/` | Готовые CI-workflow (в Phase 4) |

## Структура `.grace`

Всё состояние проекта живёт в `.grace/` — плоских `docs/*.xml` в модели 4.x нет.

```
.grace/
├── context/
│   ├── requirements.xml      ← требования свободным текстом (UC-* больше нет)
│   ├── technology.xml        ← стек, зависимости, ограничения
│   ├── principles.xml        ← проектные принципы
│   ├── deployment.xml        ← deployment-гайд или <Applicability>not-applicable</Applicability>
│   └── ux-guidelines.xml     ← UX-гайд или not-applicable
├── graph/
│   ├── index.xml             ← маршруты GD-* → документы графа
│   └── main.xml              ← записи M-* (модули) и DF-* (data flows)
├── verification/
│   ├── index.xml             ← маршруты VD-* → документы verification
│   └── main.xml              ← записи V-M-* — по одной на каждый M-*
└── changes/
    ├── active/C-*/           ← бандлы изменений: spec.xml + plan.xml
    └── archive/C-*/          ← applied / rejected / cancelled / superseded
```

Бандл изменения (`C-*`) — это директория с двумя документами: `spec.xml` (`GraceChangeSpec` — что и зачем меняется, какие `M-*` затронуты) и `plan.xml` (`GraceChangePlan` — шаги и критерии приёмки). Статус — атрибут корня (`status="draft"` → `status="approved"`); в архиве — `applied` / `rejected` / `cancelled` / `superseded`.

Правила разметки 4.x:

- в каждом XML — корневой атрибут `graceVersion="4.0"`;
- семантические якоря — только теги **без атрибутов**: `GD-*`, `VD-*`, `M-*`, `DF-*`, `V-M-*`, `C-*`, `T-###`; остальные теги — PascalCase (`Name`, `Status`, `Path`, `Command`);
- трассировка: `M-*` → `V-<M-id>`; `UC-*` в 4.x нет — требования живут текстом в `context/requirements.xml`;
- связь «файл ↔ модуль» — только через `MODULE_CONTRACT` в коде: `LINKS: M-*`.

Пример записи модуля (`.grace/graph/main.xml`):

```xml
<M-AUTH-VALIDATE>
  <Name>Auth Validate</Name>
  <Status>existing</Status>
  <Summary>validate JWT and resolve User</Summary>
  <Path>src/auth/validate.py</Path>
  <Depends>
    <M-AUTH-TOKENS />
  </Depends>
</M-AUTH-VALIDATE>
```

Пример записи verification (`.grace/verification/main.xml`):

```xml
<V-M-AUTH-VALIDATE>
  <Priority>high</Priority>
  <Cwd>.</Cwd>
  <TestFiles>
    <File>tests/test_auth_validate.py</File>
  </TestFiles>
  <Command>pytest tests/test_auth_validate.py</Command>
  <Scenario>valid JWT with fresh iat → returns User</Scenario>
  <Marker>[AuthValidate][validate_user][BLOCK_DECODE_JWT]</Marker>
  <TraceAssertion>log anchor validate_user:BLOCK_DECODE_JWT present exactly twice</TraceAssertion>
</V-M-AUTH-VALIDATE>
```

## Предусловия (precondition, не рекомендация)

Методология **не работает** без стека:

- `grace` CLI — `@osovv/grace-cli` **>= 4.1** (понимает `.grace`; 3.x-линия не умеет) — `bun add -g @osovv/grace-cli`.
- `doubled-graph` (MCP facade, Python, этот репозиторий) — `pipx install doubled-graph`.
- IDE с поддержкой **tools + MCP**. Без них промпты `../prompts/**` нельзя исполнить.

Это — осознанный компромисс (см. `tools.md §1`). Методология отказывается от tool-agnostic-риторики в пользу робастности: автоматизация через инструменты даёт одинаковый результат вне зависимости от опыта пользователя.

## Запуск: `setup`, затем `migrate` (если проект был на GRACE 3)

1. **`doubled-graph setup`** — ставит (и обновляет) `grace` CLI, копирует `prompts/` и `methodology/`, регистрирует MCP и hooks, запускает первый `analyze`. Шаг «prepare `.grace` artifacts» внутри setup сам выбирает путь: на пустом репозитории bootstrap-ит скелет `.grace`, на проекте с `docs/*.xml` вызывает мигратор.
2. **Если в репозитории остались артефакты GRACE 3** (`docs/*.xml`), линтер отказывается работать: `grace lint --path . --format json` возвращает ошибку `project.grace3-detected` и ноль записей. Это не поломка, а сигнал миграции.
3. **Явная последовательность миграции** (то же, что делает setup, но под контролем):

```bash
doubled-graph migrate check --repo .   # read-only инвентарь: что будет создано, что мешает
doubled-graph migrate apply --repo .   # запись .grace; legacy-доки только читаются
grace lint --path . --format json      # проверка структуры новой модели
grace status --path . --json           # projectKind должен стать grace4
```

Мигратор **копирует, не удаляет**: `docs/*.xml` остаются на месте до отдельного решения о чистке. Каждому `M-*` без verification он создаёт явно пустой `V-<M-id>` (заглушка видна в `grace module health` — придуманных команд он не пишет), а `LINKS: M-*` в `MODULE_CONTRACT` правит автоматически (`--no-markup-fix` отключает это). Всё, чему в 4.x нет пары — `docs/operational-packets.xml`, `ExecutionPacket`/`GraphDelta`/`FailurePacket`, `UC-*`-якоря, атрибут `VERSION=` на корне, — попадает в отчёт как `unsupported` и переносится вручную.

## 10-минутная ориентация

1. Прочитай `principles.md` (4 мин).
2. Прочитай соответствующий сценарий из `workflow.md` (новый / миграция / поддержка, 3 мин).
3. Открой `../prompts/<сценарий>/00-entry-prompt.md` и вставь в ИИ (3 мин).

Детали — по мере необходимости. Все ссылки на разделы — относительные, файл открывается как standalone.

## Лицензия и источники

- doubled-graph (эта методология и `doubled-graph`) — MIT.
- Использует GRACE (osovv, MIT) и CodeGraphContext (MIT) как внешние зависимости. Не форкает их.
