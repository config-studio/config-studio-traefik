# 01 — Закрытие содержательных пробелов (детерминированный промпт)

**Роль ИИ:** довести `.grace` из «структурно валидного» до «содержательно заполненного»: дописать `MODULE_MAP`, заполнить пустые `V-<M-id>` командами из **реально существующих** тестов, починить `LINKS: M-*`. Решения принимаются по выводу команд, а не по догадке; если команда не подтверждает данные — применяется описанный ниже fallback, без вопросов пользователю и без выдуманных значений.

**Когда запускать:** (1) после `doubled-graph setup` / `doubled-graph migrate apply`; (2) при любом последующем запуске, когда `doubled-graph migrate check` показывает непустые `map_pending` / `placeholders` / `markup_pending`. Признак запуска — вывод команды, а не предположение.

**Принцип:** сначала проверка — потом запись. У каждого поля артефакта есть источник: проверяемый факт (существует ли файл теста, проходит ли `Command` с `rc=0`, есть ли маркер в `src/`, есть ли `MODULE:` в контракте) берётся из вывода команды; смысловое утверждение (`PURPOSE`, `Scope`, `Summary`, `Scenario`) — из процитированной строки контракта, docstring или README. Поиск (`grep`) — указатель, а не доказательство: отрицательный результат проверяется чтением файла. Если ни команда, ни цитата значения не дают, поле не заполняется (или помечается `(not described)`), а причина попадает в `docs/DRIFT.md` и итоговый отчёт. Выдумывать значения запрещено — это единственное жёсткое правило.

---

## Вход: собери картину командами

Поиск в этом промпте — `grep` (есть в любой системе). В IDE без shell используйте встроенный поиск с теми же шаблонами.

```bash
doubled-graph status --repo .          # artifacts.project_kind (grace4), grace_engine.upgrade_required
doubled-graph migrate check --repo .   # map_pending / placeholders / markup_pending / unsupported
doubled-graph lint --repo .            # summary.errors, коды markup.*
doubled-graph health --repo .          # модули без verification
```

Дальше работай **строго по спискам из этого вывода**: `map_pending`, `placeholders`, `markup_pending`. Ничего не добавляй «на глаз».

---

## Шаг 0 — context-документы (до всего остального)

Мигратор копирует старые `requirements.xml`/`technology.xml` в `.grace/context/`, но если legacy объявлял 0–1 поле, документ остаётся скелетом: `migrate check` показывает `context_gaps` и warning `migration.context-skeleton`, а поля помечены `not specified`. Пока это не заполнено, из `technology.xml` нельзя вывести `<Command>` для `V-<M>` (шаг 2) — поэтому шаг 0 обязателен и идёт первым.

1. Проверь маркеры командой:

```bash
grep -n "not specified\|unknown\|Migrated project" .grace/context/*.xml
```

2. Заполняй поля в этом порядке (первый источник, который даёт факт, — истина):

| Поле | Источник 1 | Источник 2 | Источник 3 |
|---|---|---|---|
| `Language`, `Runtime`, `Framework`, `TestingStack`, `Observability` (`technology.xml`) | legacy-значения внутри `<LegacySource>` (там лежит старый `docs/technology.xml` целиком) | манифесты проекта: `*.csproj`/`*.sln`, `package.json`, `pyproject.toml`/`pytest.ini`, `go.mod`, `Cargo.toml`, `pom.xml`/`build.gradle`, `Gemfile`, `composer.json`, `Package.swift`, `mix.exs`, `CMakeLists.txt`/`Makefile` — найденные `find . -maxdepth 3 -name '<manifest>'` | README / CI (`.github/workflows/*`, `.gitlab-ci.yml`) |
| `ProjectName`, `Goals`, `Users`, `Constraints` (`requirements.xml`) | legacy `<LegacySource>`: `UC-*` → `Goal` текстом, `ACTOR`/`User` → `Users`, `Constraint`/`NFR` → `Constraints` | README (первый абзац/раздел «О проекте») и существующие issue/ADR | — |
| `deployment.xml` | манифесты инфраструктуры: `Dockerfile`, `docker-compose*.yml`, `k8s/*.yaml`, `helm/`, `Chart.yaml`, `Procfile`, `fly.toml`, `*.tf`, `serverless.yml`, `vercel.json` | README/CI deploy-шаг | `not-applicable` + `<Reason>infrastructure manifests not found</Reason>` |
| `ux-guidelines.xml` | манифесты фронтенда: `index.html`, `*.xaml`/`*.razor`/`*.vue`/`*.svelte`, `package.json` с react/vue/angular/svelte | README/скриншоты | `not-applicable` + `<Reason>frontend manifests not found</Reason>` |

3. Правила:
   - значения **копируются** из legacy/манифестов, не придумываются; язык — по манифестам проекта, а не по типу задачи;
   - `TestingStack` — команда раннера из манифеста (`package.json → scripts.test`, `pyproject/pytest.ini → pytest`, `*proj/*sln → dotnet test`, `go.mod → go test ./...`, `Cargo.toml → cargo test`, `pom.xml → mvn test`, `build.gradle → ./gradlew test`, `Gemfile → bundle exec rspec`, `composer.json → phpunit`, `Package.swift → swift test`, `mix.exs → mix test`, `CMakeLists.txt/Makefile → ctest/make test`);
   - если факт не найден ни в одном источнике — поле остаётся `not specified`, строка в `docs/DRIFT.md`; шаг 2 в этом случае не выводит `Command` для `V-<M>` (модуль получает `Priority: low`, как в fallback шага 2);
   - `deployment`/`ux` как `not-applicable` с причиной — законное состояние, а не пробел.

4. Проверь: `doubled-graph lint --repo .` (0 errors) и `doubled-graph migrate check --repo .` (`context_gaps == []`).

---

## Шаг 1 — `MODULE_MAP` (устраняет `markup.module-map-missing`)

Для каждого пути из `map_pending`, по порядку:

1. Прочитай контракт: `doubled-graph file show <path> --repo .` (поля `ROLE`, `MAP_MODE`).
2. Извлеки публичные символы **командой** по расширению файла:

```bash
# .py
grep -nE "^(class|def) [A-Za-z]" <path>
# .ts/.js/.tsx/.jsx
grep -nE "^export (async )?(function|class|const|let|var|type|interface|enum) [A-Za-z_]" <path>
# .cs
grep -nE "^\s*public\s+(static\s+|sealed\s+|abstract\s+|partial\s+)*(class|interface|record|struct|enum|delegate)\s+\w+|^\s*public\s+[\w<>\[\],.?]+\s+\w+\s*\(" <path>
# .go
grep -nE "^(type|func) [A-Z]" <path>
# .java/.kt
grep -nE "public\s+(class|interface|enum|record|fun|[\w<>\[\],.?]+\s+\w+\s*\()" <path>
# .rs
grep -nE "^pub (fn|struct|enum|trait|mod|const|static)" <path>
# .swift
grep -nE "^(public|open)\s+(func|class|struct|enum|protocol|var|let)" <path>
# .rb
grep -nE "^\s*def [a-z]" <path>
```

3. Запиши секцию в стиле комментариев файла, по одному символу на строку `symbol - описание`. Описание бери из `PURPOSE`/docstring символа; если описания нет — имя символа (движок требует непустой текст, `summary-item-undescribed`).

```
// START_MODULE_MAP
// validateUser - валидирует JWT и возвращает User
// AuthError - тип ошибки валидации
// END_MODULE_MAP
```

4. Проверь командой: `doubled-graph lint --repo .` → в `summary.errors` не должно остаться `markup.module-map-missing`. Если появился `markup.module-map-mismatch` (бывает у TS/Python, где сверка с экспортами включена) — удали из `MAP` символы, которые `grep` не нашёл, и повтори lint.

**Fallback (команда не нашла ни одного символа):**

- поставь `MAP_MODE: NONE` **и** `ROLE: CONFIG` (единственная комбинация, при которой `ROLE`↔`MAP_MODE` согласованы, а `MAP` не требуется);
- добавь строку в `docs/DRIFT.md`: `YYYY-MM-DD — <path>: нет публичной поверхности, MAP_MODE=NONE/ROLE=CONFIG (проверить вручную)`;
- продолжи со следующим файлом.

Если после этого lint всё ещё даёт `markup.role-map-mode-mismatch` — прочитай `methodology/artifacts.md § Разметка кода` и приведи пару `ROLE`/`MAP_MODE` к таблице; повторяй, пока lint не станет чистым по этому коду.

---

## Шаг 2 — пустые `V-<M-id>` (устраняет `verification.placeholder` и `blocked`)

Для каждого `V-<M-id>` из `placeholders`, по порядку:

1. Прочитай запись: `doubled-graph verify V-<M-id> --repo .`.
2. Найди тест **командой** (первая успешная команда считается результатом):

```bash
grep -rlE "<M-id без префикса M->" tests/ 2>/dev/null
grep -rlE "<имя символа из MODULE_MAP>" tests/ 2>/dev/null
find tests -type f | grep -i "<module-slug>"
```

3. Определи команду прогона по стеку проекта (читай по порядку, первый найденный источник — истина):
   - `.grace/context/technology.xml` → `TestingStack`;
   - `pyproject.toml`/`pytest.ini` → `pytest <file>`;
   - `package.json` (scripts) → `pnpm test <pattern>` / `npm test -- <pattern>`;
   - `*.csproj`/`*.sln` → `dotnet test --filter <Class>`;
   - `go.mod` → `go test ./<dir>/...`;
   - `Cargo.toml` → `cargo test <name>`;
   - `pom.xml`/`build.gradle` → `mvn -Dtest=<Class> test` / `./gradlew test --tests <Class>`.

4. Прогони команду (Bash) и запиши в `.grace/verification/main.xml` **только при rc=0**:

```xml
<V-M-AUTH-VALIDATE>
  <Priority>high</Priority>
  <Cwd>.</Cwd>
  <TestFiles>
    <File>tests/test_auth.py</File>
  </TestFiles>
  <Command>pytest tests/test_auth.py</Command>
  <Scenario>просроченный JWT возвращает null</Scenario>
  <Marker>[auth][validate]</Marker>
</V-M-AUTH-VALIDATE>
```

- `TestFiles` — только пути, которые нашёл поиск и которые существуют (`test -f <path>`);
- `Scenario` — из `PURPOSE`/`SCOPE` контракта модуля, словами наблюдаемого поведения;
- `Marker`/`TraceAssertion` — только если `grep -nE "\[auth\]\[validate\]" src/` реально находит такой маркер; иначе строки не добавляй;
- `Priority: high` — если модуль встречается в `Depends` других модулей (`grep -nE "<M-id>" .grace/graph/main.xml` даёт больше одного вхождения), иначе `Priority: low`.

5. Проверь командами: `doubled-graph verify V-M-AUTH-VALIDATE --repo .`, `doubled-graph module health M-AUTH-VALIDATE --repo .` (состояние не `blocked`).

**Fallback (тесты не найдены ИЛИ команда вернула rc≠0):**

- `Command` **не пиши** (пустая запись честнее фиктивного прогона);
- поставь `Priority: low`;
- добавь запись в `docs/DRIFT.md`: `YYYY-MM-DD — V-M-<ID>: нет проходящей команды (<причина: нет тестов | rc=N>)`;
- добавь строку в итоговый отчёт `verification:missing`;
- переходи к следующей записи. Пользователю вопросов не задавай — итоговый отчёт покажет, что осталось.

---

## Шаг 3 — `LINKS: M-*` (устраняет `markup.links-without-module`)

Для каждого пути из `markup_pending`:

1. `doubled-graph file show <path> --repo .` — возьми `MODULE:` из контракта.
2. Если `MODULE:` нет — `doubled-graph module find <path> --repo .`; возьми единственный найденный `M-*`.
3. Допиши в `MODULE_CONTRACT` строку `LINKS: M-<модуль>` (значения `UC-*`/`V-M-*` рядом допустимы — движок учитывает только `M-*`).
4. Проверь: `doubled-graph lint --repo .`.

**Fallback (модуль не определяется ни контрактом, ни `module find`):**

- не создавай новый `M-*` сам (это меняет замысел, а не разметку);
- добавь `docs/DRIFT.md`: `YYYY-MM-DD — <path>: code_without_module, LINKS не определён`;
- добавь строку `unlinked` в отчёт и переходи к следующему файлу.

---

## Шаг 4 — финальные проверки (все — командами)

```bash
doubled-graph lint --repo .                        # ожидается summary.errors = 0
doubled-graph migrate check --repo .               # ожидается map_pending = [] и placeholders = []
doubled-graph detect-changes --scope all --repo .  # missing_verification — только у записей из DRIFT.md
doubled-graph health --repo .                      # нет модулей без V-<M>
doubled-graph module health <M-*> --repo .         # критичные модули не blocked
```

Правило: код `project.grace3-detected` → `doubled-graph migrate apply --repo .` и повтори шаги 1–3. Код `invalid-project` → `doubled-graph lint --repo .` печатает конкретные нарушения; правь их по порядку. `grace_engine.upgrade_required = true` → `npm install -g @osovv/grace-cli@4.2.1` (или `doubled-graph setup --repo .` повторно).

---

## Шаг 4a — context gate: в context нет заглушек

Обязательная проверка перед отчётом: `context/*.xml` не должны содержать ни `unknown`, ни шаблонных фраз мигратора/бутстрапа. Проверяется командой, а не «на глаз»:

```bash
grep -nE "not specified|unknown|Migrated project|Describe the primary|replace with the real product statement|Keep the project governed|Existing project maintainers|Legacy GRACE 3 documents stay in place|No operational constraints were declared|Users were not described|Restore the product intent|Not configured yet" .grace/context/*.xml
doubled-graph migrate check --repo .   # context_gaps должен быть []
```

Что означает каждая находка:

| Находка | Действие |
|---|---|
| `technology: … TestingStack is still a placeholder` | заполнить `TestingStack` из `<LegacySource>` или манифеста (шаг 0), иначе `<Command>` для `V-<M>` не выводится |
| `technology: 0–1/5 real field(s)` | заполнить Language/Runtime/Framework/Observability по шагу 0 |
| `requirements: … real section(s)` / `Goals are still a placeholder` | перенести `UC-*`/README-цели в `<Goals>` (шаг 0) |
| `deployment`/`ux` с `not-applicable` + `<Reason>` | не находка: это законное состояние, пропустить |

Если после заполнения `context_gaps` пуст, а `grep` всё ещё что-то находит — это строка внутри `<LegacySource>` (архив), её не трогай: проверяй только рабочие секции, не архив.

### BOM в исходниках

`doubled-graph` сам читает BOM-файлы (`utf-8-sig`), но анализатор движка для Python/TypeScript/Dart через `ast.parse`/тулинг отвергает U+FEFF: `grace lint` даёт `analysis.adapter-failed: invalid non-printable character U+FEFF at line 1:1`. Проверь заранее:

```bash
doubled-graph migrate check --repo .   # bom_files / bom_adapter_files, warning migration.bom-in-code
```

- **файлы клиента не изменяются**: `doubled-graph lint` при наличии BOM запускает движок на временной копии, где BOM нормализован (только `.grace/*.xml` и adapter-исходники `.py/.pyi/.ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts/.dart`), и переписывает пути отчёта обратно на реальный репозиторий;
- если `bom_adapter_files` непусто, но `lint` зелёный — это и есть работа зеркала: BOM остался в исходниках, гейт пройден;
- файлы без адаптера (C#, Go, Rust, Java, Swift, …) попадают в копию **как есть**, BOM у них не снимается: движок не запускает для них анализатор, поэтому lint от BOM не зависит;
- ничего не удаляй и не перекодируй вручную; если lint всё же даёт `analysis.adapter-failed` с U+FEFF — это сигнал, что зеркало не сработало (сообщи о баге), а не повод править файлы.

---

## Шаг 5 — отчёт пользователю (формат фиксированный)

```
MODULE_MAP:  <N> файлов дополнено, <K> переведено в MAP_MODE=NONE/ROLE=CONFIG (DRIFT.md)
V-<M>:       <N> заполнено и прогоняется, <K> без команды (low + DRIFT.md)
LINKS:       <N> файлов привязано, <K> осталось unlinked (DRIFT.md)
lint:        errors=<N>, warnings=<N>
health:      модулей без verification=<N>
Дальше:      <пусто | список решений, требующих человека: тексты V-<M>, границы модулей>
```

---

## Критерии готовности

| Проверка | Готово, когда |
|---|---|
| `doubled-graph lint` | `summary.errors == 0` |
| `doubled-graph migrate check` | `map_pending == []`, `placeholders == []`, `context_gaps == []` |
| `grep -nE "not specified\|unknown\|Migrated project\|Describe the primary\|Keep the project governed" .grace/context/*.xml` | пусто вне `<LegacySource>`, кроме `deployment`/`ux` с `not-applicable` и `<Reason>` |
| `doubled-graph detect-changes --scope all` | `missing_verification` только у записей с `DRIFT.md` |
| `doubled-graph health` | нет модулей без `V-<M>` |
| `module health` критичных модулей | не `blocked` |
| повторный `migrate apply` | не меняет файлов (идемпотентность) |

---

## Анти-паттерны

- **`Command`-заглушка (`TODO`, `echo ok`, `true`, `pytest --version`)** — превращает «не проверено» в «проверено». Запрещено; пустая запись + `DRIFT.md`.
- **Символ в `MODULE_MAP`, которого нет в файле** — для TS/Python даст `markup.module-map-mismatch`, для остальных — ложное описание поверхности.
- **`Priority low` для всех, чтобы health был зелёным** — занижение приоритета скрывает риск; `high` определяется вхождением модуля в `Depends` других модулей.
- **Удаление legacy `docs/` ради чистоты** — отдельное решение с бэкапом и approval.

---

# Промт

```
Ты закрываешь содержательные пробелы в GRACE 4-проекте. Решения принимай по выводу команд,
не по догадкам. Код не меняет поведение: только комментарии-якоря и .grace/verification.

Шаг 0. Собери картину (только чтение):
  doubled-graph status --repo .
  doubled-graph migrate check --repo .
  doubled-graph lint --repo .
  doubled-graph health --repo .
Работай по спискам map_pending / placeholders / markup_pending из вывода.

Шаг 0. Context-документы (обязательно до MODULE_MAP и V-<M>):
  - проверь маркеры: grep -n "not specified\|unknown\|Migrated project" .grace/context/*.xml
  - technology.xml: Language/Runtime/Framework/TestingStack/Observability — из <LegacySource> (старый documents/technology.xml),
    затем из манифестов проекта (find . -maxdepth 3: *.csproj/*.sln, package.json, pyproject.toml/pytest.ini, go.mod,
    Cargo.toml, pom.xml/build.gradle, Gemfile, composer.json, Package.swift, mix.exs, CMakeLists.txt/Makefile), затем README/CI;
    TestingStack = команда раннера из манифеста (не догадка);
  - requirements.xml: ProjectName/Goals/Users/Constraints — из <LegacySource> (UC-* -> Goal текстом, ACTOR/User -> Users,
    Constraint/NFR -> Constraints), затем README;
  - deployment.xml/ux-guidelines.xml: по инфраструктурным/фронтенд-манифестам; если их нет — <Applicability>not-applicable</Applicability>
    + <Reason>;
  - если факт не найден — поле оставь "not specified" и добавь строку в docs/DRIFT.md; НЕ выдумывай стек.
  - проверь: doubled-graph migrate check --repo . -> context_gaps = []

Шаг 1. MODULE_MAP для каждого пути из map_pending:
  - прочитай контракт: doubled-graph file show <path> --repo .;
  - извлеки публичные символы командой `grep` по правилам для языка:
      .py:      grep -nE "^(class|def) [A-Za-z]" <path>
      .ts/.js:  grep -nE "^export (async )?(function|class|const|let|var|type|interface|enum) [A-Za-z_]" <path>
      .cs:      grep -nE "^\s*public\s+(static\s+|sealed\s+|abstract\s+|partial\s+)*(class|interface|record|struct|enum|delegate)\s+\w+|^\s*public\s+[\w<>\[\],.?]+\s+\w+\s*\(" <path>
      .go:      grep -nE "^(type|func) [A-Z]" <path>
      .java/.kt:grep -nE "public\s+(class|interface|enum|record|fun|[\w<>\[\],.?]+\s+\w+\s*\()" <path>
      .rs:      grep -nE "^pub (fn|struct|enum|trait|mod|const|static)" <path>
      .swift:   grep -nE "^(public|open)\s+(func|class|struct|enum|protocol|var|let)" <path>
      .rb:      grep -nE "^\s*def [a-z]" <path>
  - допиши START_MODULE_MAP / END_MODULE_MAP, по строке "symbol - описание";
  - проверь: doubled-graph lint --repo . — markup.module-map-missing должен исчезнуть;
    при markup.module-map-mismatch удали из MAP символы, которых нет в файле, и повтори.
  Fallback: если grep не нашёл ни одного публичного символа — поставь MAP_MODE: NONE и ROLE: CONFIG,
    добавь строку в docs/DRIFT.md и иди дальше.

Шаг 2. Пустые V-<M-id> из placeholders:
  - прочитай запись: doubled-graph verify V-<M-id> --repo .;
  - найди тест: grep -rlE "<M-id без M->" tests/ ; если пусто — grep -rlE "<имя символа>" tests/ ;
    если пусто — find tests -type f | grep -i "<module-slug>";
  - определи команду по стеку: .grace/context/technology.xml → pyproject/pytest.ini → package.json →
    *.csproj/*.sln → go.mod → Cargo.toml → pom.xml/build.gradle (первый найденный источник — истина);
  - прогони команду; если rc=0 — запиши TestFiles (только существующие пути), Command, Scenario
    (наблюдаемое поведение из PURPOSE/SCOPE); Marker/TraceAssertion — только если grep находит маркер в src/;
  - Priority: high, если модуль встречается в Depends других модулей (grep -nE "<M-id>" .grace/graph/main.xml
    даёт >1 вхождения), иначе low;
  - проверь: doubled-graph verify <V-M-*> --repo . и doubled-graph module health <M-*> --repo .
  Fallback: если тестов нет или команда rc≠0 — Command НЕ пиши, поставь Priority: low,
    добавь запись в docs/DRIFT.md с датой и причиной, внеси строку в отчёт, иди дальше.

Шаг 3. markup_pending — привязка файлов:
  - MODULE: из контракта (doubled-graph file show); если нет — doubled-graph module find <path> --repo .;
  - допиши LINKS: M-<модуль> в MODULE_CONTRACT;
  - проверь: doubled-graph lint --repo .
  Fallback: если модуль не определяется — новый M-* не создавай, добавь запись в docs/DRIFT.md
    (code_without_module) и строку unlinked в отчёт.

Шаг 4. Финальные проверки:
  doubled-graph lint --repo .                        (summary.errors = 0)
  doubled-graph migrate check --repo .               (map_pending и placeholders пусты)
  doubled-graph detect-changes --scope all --repo .  (missing_verification только с DRIFT.md)
  doubled-graph health --repo .                      (нет модулей без V-<M>)
  doubled-graph module health <M-*> --repo .         (критичные не blocked)
  Если lint вернул project.grace3-detected — выполни doubled-graph migrate apply --repo . и повтори шаги 1–3.
  Если grace_engine.upgrade_required = true — npm install -g @osovv/grace-cli@4.2.1 и повтори setup.

Шаг 4a. Context gate (обязательно):
  grep -nE "not specified|unknown|Migrated project|Describe the primary|replace with the real product statement|Keep the project governed|Existing project maintainers|Legacy GRACE 3 documents stay in place|No operational constraints were declared|Users were not described|Restore the product intent|Not configured yet" .grace/context/*.xml
  doubled-graph migrate check --repo .   (context_gaps = [])
  Находки вне <LegacySource> исправляй по шагу 0; TestingStack-заглушка блокирует шаг 2.

Шаг 5. Отчёт в фиксированном формате:
  MODULE_MAP: <N дополнено, K NONE/CONFIG>
  V-<M>:      <N заполнено и прогоняется, K без команды>
  LINKS:      <N привязано, K unlinked>
  lint:       errors=<N>, warnings=<N>
  health:     модулей без verification=<N>
  Дальше:     <список решений, требующих человека>

Правила: не менять поведение кода; не писать TODO/echo ok/true в Command; не удалять legacy docs/;
один кластер модулей — один коммит, перед коммитом lint без errors; вопросы пользователю не задавать —
все неоднозначности фиксируются в docs/DRIFT.md и итоговом отчёте.
```

---

## Что дальше

- Все проверки зелёные → `prompts/migrate-existing-project/06-validation-gates.md` (завершение миграции) или обычный цикл `prompts/maintenance/on-before-edit.md` (после апгрейда методики).
- Появился новый модуль/требование → бандл `C-*` (`prompts/maintenance/on-drift-detected.md § B.1`).
