# Language adapter: C#

Адаптер покрывает .NET 6+ (LTS). Для .NET Framework 4.x применим частично — SLF4J-аналогов меньше, Code Contracts ещё работают, но это legacy-сценарий.

## 1. Синтаксис комментариев

- `//` — однострочный якорь (рекомендуемый).
- `/* ... */` — многострочный, не используется.
- `///` — **XML-doc-комментарий** (аналог Javadoc). Для якорей **не использовать** — см. Anti-patterns.

## 2. Позиция контракта функции

Контракт метода — `//`-комментарии непосредственно перед сигнатурой. **Атрибуты** (`[HttpPost]`, `[Authorize]`, `[ValidateAntiForgeryToken]`) — **после** `END_CONTRACT`, перед сигнатурой.

```csharp
// START_MODULE_CONTRACT
// PURPOSE: validate JWT and resolve User
// SCOPE: src/Auth/AuthValidator.cs
// DEPENDS: M-AUTH-TOKENS
// LINKS: M-AUTH-VALIDATE
// ROLE: RUNTIME
// MAP_MODE: EXPORTS
// END_MODULE_CONTRACT

// START_MODULE_MAP
// AuthValidator.ValidateUser - validates JWT, resolves User
// END_MODULE_MAP

namespace Example.Auth;

using Microsoft.Extensions.Logging;
using FluentValidation;

public class AuthValidator
{
    private readonly ILogger<AuthValidator> _log;

    public AuthValidator(ILogger<AuthValidator> log) => _log = log;

    // START_CONTRACT: ValidateUser
    // PURPOSE: validate JWT, resolve user
    // INPUTS: req: HttpRequest (Authorization: Bearer header required)
    // OUTPUTS: User? (null if invalid, never throws)
    // SIDE_EFFECTS: none
    // LINKS: M-AUTH-VALIDATE
    // END_CONTRACT: ValidateUser
    [HttpGet("validate")]
    public User? ValidateUser(HttpRequest req)
    {
        #region START_BLOCK_DECODE_JWT
        var token = ExtractToken(req);
        var payload = DecodeJwt(token);
        #endregion END_BLOCK_DECODE_JWT

        #region START_BLOCK_CHECK_CLOCK_SKEW
        if (Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - payload.Iat * 1000L) > 60_000L)
            return null;
        #endregion END_BLOCK_CHECK_CLOCK_SKEW

        return payload.User;
    }
}
```

## 3. Специфика блоков

### 3.1 Синтаксис якоря блока

В C# block-якорь оформляется **единственным** способом — через нативную директиву `#region`, метка которой несёт имя якоря `START_BLOCK_*` / `END_BLOCK_*`:

```csharp
#region START_BLOCK_DECODE_JWT
var token = ExtractToken(req);
var payload = DecodeJwt(token);
#endregion END_BLOCK_DECODE_JWT
```

Почему именно так: `#region` — препроцессорная директива языка, её метка — произвольный текст до конца строки, `#endregion` тоже опционально принимает текст. Одной строкой мы одновременно получаем (а) IDE-folding из коробки в Visual Studio/Rider/VS Code и (б) парный якорь `START_BLOCK_*` / `END_BLOCK_*`, который видит парсер `doubled-graph lint` ровно теми же правилами, что и в других языках.

Правила:

- Метка `#region` **должна** начинаться с `START_BLOCK_` и содержать имя блока; парный `#endregion` — с `END_BLOCK_` и тем же именем.
- `#region` без префикса `START_BLOCK_` (например, `#region Helpers`) — **не якорь**, а обычное средство UI-структурирования; парсер его игнорирует, impact-анализ не учитывает.
- Вариант «только `// START_BLOCK_X` в комментариях» (как в TS/Java/Python) в C# **не применяется** — чтобы не иметь в одном языке двух эквивалентных записей.
- `MODULE_CONTRACT` / `MODULE_MAP` / `CONTRACT: Method` — **только `//`-комментарии**, `#region` для них не использовать (это контракты, а не folding тела).
- В structured-логах `anchor`-поле — `"ValidateUser:BLOCK_DECODE_JWT"` (без префикса `START_`), как и в других языках.

### 3.2 Остальные правила

- `#endregion END_BLOCK_NAME` ставится перед закрывающей `}` или перед `return`/`throw`.
- **`using`-блоки** (`using (var x = ...)` и `using var x = ...;` с неявным scope): якорь блока должен покрывать **весь scope `using`**, включая `Dispose()`.
- **`switch` expression** (C# 8+): каждая arm — не более одного BLOCK; не разрывать.
- **`async`/`await`**: разметка идентична синхронному коду. Не ставить якори между `await` и продолжением в той же строке.
- **Pattern-matching** (`is`, `when`): якорь блока допустим вокруг `if` с pattern-matching'ом, но имя должно отражать паттерн, не механику.
- **Expression-bodied methods** (`public int Foo() => 42;`) не содержат блоков — только function-level контракт.

## 4. Runtime-контракты

**.NET Code Contracts** (`System.Diagnostics.Contracts`) — **deprecated** в .NET 5+, не поддерживаются. Не использовать.

Живые альтернативы:

| Подход | Scope | Когда применять |
|---|---|---|
| **FluentValidation** | валидация DTO через fluent API | стандарт для ASP.NET Core входных моделей |
| **DataAnnotations** (`[Required]`, `[Range]`) | декларативные атрибуты в моделях | простые ограничения, ModelState-интеграция |
| **Roslyn Analyzers** + **Nullable reference types** (`<Nullable>enable</Nullable>`) | compile-time защита | обязательно в .NET 6+ |
| **`ArgumentException.ThrowIfNull(...)`** / **`ArgumentOutOfRangeException.ThrowIf*`** (.NET 6/7+) | ручные precondition-чеки | везде, где типы не покрывают |

**Рекомендация doubled-graph:**

- **Critical-модули:** FluentValidation на входящих DTO + явные `ArgumentException.ThrowIfNull(...)` в теле метода + Nullable reference types включены.
- **Standard-модули:** DataAnnotations или FluentValidation на границах контроллеров.
- **Helper-модули:** Nullable reference types + Roslyn analyzers + unit-тесты.

```csharp
using FluentValidation;

public class RequestValidator : AbstractValidator<Request>
{
    public RequestValidator()
    {
        RuleFor(r => r.Authorization).NotEmpty().Must(a => a.StartsWith("Bearer "));
    }
}

// START_CONTRACT: ValidateUser
// ...
// END_CONTRACT: ValidateUser
public User? ValidateUser(Request req)
{
    ArgumentNullException.ThrowIfNull(req);
    var result = new RequestValidator().Validate(req);
    if (!result.IsValid) return null;
    // ...
}
```

## 5. Testing framework

**xUnit** — стандарт. Альтернативы: NUnit (legacy), MSTest (редко).

Запись verification (`.grace/verification/main.xml`; id — `V-` + id модуля: `M-AUTH-VALIDATE` → `V-M-AUTH-VALIDATE`):

```xml
<VD-MAIN>
  <V-M-AUTH-VALIDATE>
    <Priority>high</Priority>
    <Cwd>.</Cwd>
    <TestFiles>
      <File>tests/Example.Auth.Tests/AuthValidatorTests.cs</File>
    </TestFiles>
    <Command>dotnet test tests/Auth.Tests --filter FullyQualifiedName~AuthValidatorTests</Command>
    <Scenario>valid JWT with fresh iat → returns User</Scenario>
    <Scenario>invalid or expired JWT → returns null</Scenario>
    <Marker>[AuthValidate][ValidateUser][BLOCK_DECODE_JWT]</Marker>
    <TraceAssertion>marker present in exactly two log lines of the success scenario</TraceAssertion>
  </V-M-AUTH-VALIDATE>
</VD-MAIN>
```

Для property-based: `FsCheck` (.NET) или `CsCheck`. Для integration: `Microsoft.AspNetCore.Mvc.Testing` + testcontainers-dotnet.

## 6. Structured logs

**Serilog** + **Serilog.Formatting.Json** (или `Serilog.Formatting.Compact` — JSON Lines) — стандартная связка.

Конфигурация `Program.cs`:
```csharp
using Serilog;
using Serilog.Formatting.Compact;

Log.Logger = new LoggerConfiguration()
    .Enrich.FromLogContext()
    .WriteTo.Console(new CompactJsonFormatter())
    .CreateLogger();

var builder = WebApplication.CreateBuilder(args);
builder.Host.UseSerilog();
```

В коде:
```csharp
using Serilog.Context;

using (LogContext.PushProperty("correlation_id", req.CorrelationId))
{
    _log.LogInformation("jwt_decoded {Anchor} {Module} {Requirement} {Belief}",
        "ValidateUser:BLOCK_DECODE_JWT",
        "M-AUTH-VALIDATE",
        "JWT validation",
        "payload trusted, skew=0");
}
```

Альтернатива: `Microsoft.Extensions.Logging` (`ILogger<T>`) с JSON-формате через `AddJsonConsole()` — проще, но меньше возможностей, чем Serilog.

Поле `Requirement` — свободный текст требования из `.grace/context/requirements.xml`: якорей `UC-*` в 4.x нет, трассировка идёт по `M-*` → `V-<M-id>`.

## 7. CGC: C# — полная поддержка

CodeGraphContext парсит C# через tree-sitter-c-sharp. Поддерживаются классы, методы, properties, namespaces, using-директивы, вызовы, интерфейсы, records. Особенности:

- **Partial classes**: парсятся как отдельные единицы; для `impact`-анализа имя `ClassName` собирается из всех `partial`-файлов, но якоря `MODULE_CONTRACT` нужно ставить **в каждом файле** partial-класса, который размечается отдельно как модуль, либо выбрать один "owner"-файл.
- **Source generators** (`[Generator]`-атрибуты, runtime-код): сгенерированный код **не индексируется**. Методы, созданные `[GeneratedRegex(...)]`, `[JsonSerializable]`, MediatR source-gen — не видны.
- **Records** (C# 9+): позитивные properties (`public record User(string Name)`) индексируются как класс + автосгенерированные методы. Сами методы не видны (как Lombok в Java).
- **File-scoped namespaces** (C# 10+): работают нормально; MODULE_CONTRACT идёт **до** `namespace X;`-строки.

## 8. Project-layout

Стандартная .NET-структура (SDK-style):
```
repo/
├── Example.sln
├── src/
│   ├── Example.Auth/
│   │   ├── Example.Auth.csproj
│   │   └── AuthValidator.cs
│   └── Example.Api/
│       └── ...
├── tests/
│   └── Example.Auth.Tests/
│       ├── Example.Auth.Tests.csproj
│       └── AuthValidatorTests.cs
└── .grace/
    ├── context/            ← requirements, technology, principles, deployment, ux-guidelines
    ├── graph/main.xml      ← M-* модули проекта
    ├── verification/main.xml
    └── changes/{active,archive}/
```

Запись модуля в `.grace/graph/main.xml`:

```xml
<M-AUTH-VALIDATE>
  <Name>Auth Validate</Name>
  <Status>existing</Status>
  <Summary>validate JWT and resolve User</Summary>
  <Path>src/Example.Auth/AuthValidator.cs</Path>
  <Depends>
    <M-AUTH-TOKENS />
  </Depends>
</M-AUTH-VALIDATE>
```

Тест-проект (`tests/Example.Auth.Tests/…`) в `<Path>` не входит — он указывается в `<TestFiles>` записи `V-M-AUTH-VALIDATE`.

Для больших solutions: `<Path>` перечисляет все файлы модуля (`<AdditionalPath>` — для остальных); один `M-*` может охватывать несколько файлов в одном проекте (`*.csproj`), но **не** через границы проектов — каждый проект оформляется отдельным `M-*`.

## 9. Anti-patterns

- **Якоря в `///` XML-doc:**
  ```csharp
  /// <summary>
  /// START_CONTRACT: ValidateUser   ← парсер якорей не видит XML-doc
  /// </summary>
  public User? ValidateUser(...) {}
  ```
  Использовать `//` над или между XML-doc и атрибутами.

- **Использование deprecated Code Contracts:**
  ```csharp
  Contract.Requires(req != null);   ← .NET 5+ не поддерживает
  ```
  Заменить на `ArgumentNullException.ThrowIfNull(req)` + FluentValidation.

- **Контракт на auto-property / primary constructor record:**
  ```csharp
  public record User(string Name);   ← нет явной сигнатуры метода для якоря
  ```
  Для records контракт — на методах, которые явно написаны в теле. Auto-generated `Equals`/`GetHashCode` — не размечать.

- **Атрибут внутри блока контракта:**
  ```csharp
  // START_CONTRACT: ValidateUser
  [HttpGet]                        ← неправильно
  // END_CONTRACT: ValidateUser
  public User? ValidateUser(...) {}
  ```
  Атрибуты — после `END_CONTRACT`.

- **Source-generator-ссылки в MODULE_MAP:** сгенерированные методы (Mediatr handlers, regex-источники) не видны в CGC; в MODULE_MAP помечать их как `(generated)` или не ссылаться.

- **`LogContext.PushProperty` без `using`-scope:** свойство утечёт. Всегда через `using (LogContext.PushProperty(...))`.

## 10. Запуск doubled-graph lint на C#-проекте

```bash
doubled-graph lint --path .          # gateway
grace lint --path . --format json    # сам линтер; JSON только через --format json
```

CLI `grace` парсит C# через tree-sitter-c-sharp. Плагины для MSBuild/dotnet CLI не требуются.

## 11. Проверка lint для C#

Что именно проверяет `grace lint` (движок 4.2.1) на C#-файлах:

| Проверка | Статус для C# |
|---|---|
| `.cs` входит в `CODE_EXTENSIONS` → файл попадает в обход | ✅ да |
| Парность якорей (`START_*`/`END_*`, `MODULE_CONTRACT`, `BLOCKS`) | ✅ проверяется |
| `MODULE_CONTRACT` обязателен, поля `PURPOSE`/`SCOPE`/`DEPENDS`/`LINKS` (`LINKS` с `M-*`) | ✅ проверяется |
| `MODULE_MAP`, `CHANGE_SUMMARY` (`LAST_CHANGE`) | ✅ проверяются по формату |
| `ROLE` ↔ `MAP_MODE` (`RUNTIME`→`EXPORTS`, `TEST`→`LOCALS`, `BARREL`→`SUMMARY`, `CONFIG`→`NONE`, `TYPES`→`EXPORTS`, `SCRIPT`→`LOCALS`) | ✅ проверяется |
| Сверка `MODULE_MAP` с **реальными экспортами** файла | ❌ не выполняется |

**Почему последняя строка — «нет»:** в движке нет C#-адаптера анализа экспортов (как нет его для Go, Rust и Java; сверка есть только там, где адаптер написан). Практические следствия:

- пропущенный в `MODULE_MAP` публичный метод, свойство или `record` линтер **не поймает** — это зона ревью, а не автоматики;
- лишний, уже удалённый метод в `MODULE_MAP` тоже не будет ошибкой — но он попадёт в `grace module show` и будет вводить в заблуждение агента, поэтому чистить руками;
- `partial`-классы: экспортная сверка всё равно не помогла бы, но и без неё действует правило «якоря в каждом `partial`-файле, который размечается отдельно» (§7);
- source-generated методы (`[GeneratedRegex]`, MediatR, `[JsonSerializable]`) в графе отсутствуют — помечать в `MODULE_MAP` как `(generated)` (см. Anti-patterns).

**Практика gate'а:**

```bash
grace lint --path . --format json            # CI: читать summary.errors, а не только rc
doubled-graph detect-changes --scope staged  # дрейф «код ↔ артефакты»
dotnet test                                  # тесты из <Command> записей V-M-*
```

- JSON-вывод включается **только** флагом `--format json`: `--json` движок молча игнорирует (citty не падает на неизвестном флаге), `--verbose` в 4.x означает стрим `--run-commands`, а не «подробнее».
- `--fail-on errors` (значение по умолчанию) определяет код возврата, поэтому `rc=0` **не** означает «чисто» — смотри `summary.errors` в JSON.
- Проект без `.grace` (ещё на легаси `docs/*.xml`) получает `project.grace3-detected` и ноль записей — это сигнал к `doubled-graph migrate check`, затем `doubled-graph migrate apply` (легаси-доки не удаляются, `LINKS: M-*` в `.cs`-файлах чинятся автоматически).

---

## Чек-лист применения

- [ ] MODULE_CONTRACT / MODULE_MAP — `//`-комментарии в начале файла, до `namespace`; `LINKS` содержит `M-*`, `MAP_MODE` согласован с `ROLE`.
- [ ] CONTRACT: Method — `//`-комментарии перед сигнатурой; атрибуты между `END_CONTRACT` и сигнатурой.
- [ ] Code Contracts **не используются** (deprecated); вместо них — FluentValidation + `ArgumentNullException.ThrowIfNull` + Nullable reference types.
- [ ] `dotnet test` (xUnit) команда в `<Command>` записи `V-<M-id>` (`.grace/verification/main.xml`).
- [ ] Serilog с JSON-formatter; `LogContext.PushProperty` для `correlation_id` всегда в `using`-scope.
- [ ] Partial-классы: якоря на методах, не на объявлении класса дважды.
- [ ] Source-generators и Records с auto-properties — в MODULE_MAP помечены `(generated)` или пропущены.
- [ ] `///` XML-doc **не используется** для якорей.
- [ ] Block-якоря оформлены через `#region START_BLOCK_X` / `#endregion END_BLOCK_X` (единственный разрешённый в C# синтаксис; `//`-комментарии для блоков **не** используются).
- [ ] Помни: `MODULE_MAP` не сверяется с реальными экспортами (C#-адаптера анализа экспортов нет) — расхождения ловятся ревью, а не `grace lint`.
