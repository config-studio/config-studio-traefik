# Language adapter: TypeScript

Адаптер покрывает TS и TSX. Для чистого JavaScript работают те же правила (CGC парсит `.js`/`.jsx` отдельным парсером, но разметка якорей идентична).

## 1. Синтаксис комментариев

- `//` — однострочный якорь (рекомендуемый вариант для всех блочных разметок методологии doubled-graph, см. `../artifacts.md § Разметка кода`).
- `/* ... */` — многострочный, допустим, но **не используется** для якорей: `doubled-graph lint` парсит якорь построчно, и закрывающая `*/` на отдельной строке создаёт ложные совпадения.
- JSDoc (`/** ... */`) — для типов/сигнатур; **не смешивать** с якорями (см. Anti-patterns).

## 2. Позиция контракта функции

Контракт функции — `//`-комментарии **непосредственно перед** объявлением (function, export function, method в классе, arrow-function присвоенный константе). Декораторы классов (`@injectable()` и т. п.) — **после** блока `END_CONTRACT`, перед самим объявлением.

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
// UserSchema - zod schema for user shape
// END_MODULE_MAP

import { z } from "zod";
import pino from "pino";

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
```

Для методов класса контракт ставится **внутри тела класса**, перед методом, с тем же отступом:

```ts
export class AuthService {
  // START_CONTRACT: validate
  // PURPOSE: ...
  // END_CONTRACT: validate
  validate(req: Request): User | null { ... }
}
```

## 3. Специфика блоков

TypeScript использует фигурные скобки, поэтому границы блока свободны. Ограничения:

- `END_BLOCK_NAME` ставится **внутри блока `{ }`**, непосредственно перед закрывающей скобкой (или перед `return`, если блок заканчивается ранним выходом).
- **Arrow-функции без фигурных скобок** (`const f = (x) => x + 1;`) не могут содержать внутренних блоков — только function-level контракт.
- В `switch`-блоках якорь блока должен покрывать **цельный `case`**, включая `break`/`return`. Не разрывать `case` пополам.
- JSX: якоря допустимы как `{/* START_BLOCK_RENDER_HEADER */}`, но только **внутри render-функции**, не внутри JSX-атрибутов.

## 4. Runtime-контракты

| Библиотека | Scope | Когда применять |
|---|---|---|
| **zod** | runtime-валидация данных (API-входы, парсинг JSON, env-переменные) | де-факто стандарт; почти всегда на границах модуля |
| **effect (Schema)** | runtime-типы + эффект-система | если проект уже на `effect` (не внедрять ради одного модуля) |
| **io-ts** | codec-подход, стабильный, но активное развитие остановилось | только для поддержки существующих проектов |
| **tsoa** | генерация OpenAPI + DTO-валидация для REST-контроллеров | REST-сервисы, где OpenAPI — source of truth |

**Рекомендация doubled-graph:**

- **Critical-модули** (`<Priority>high</Priority>` у `V-<M-id>`): zod на входе/выходе + явные pre/post в текстовом контракте. В TS **нет** зрелой библиотеки design-by-contract с декораторами — формальные pre/post выражаются через zod-схемы и `invariant()`-проверки.
- **Standard-модули:** zod только на границах I/O.
- **Helper-модули:** строгий `tsc --strict` + unit-тесты достаточно.

```ts
import { z } from "zod";

const RequestSchema = z.object({
  headers: z.object({
    authorization: z.string().startsWith("Bearer "),
  }),
});

// START_CONTRACT: validateUser
// ...
// END_CONTRACT: validateUser
export function validateUser(req: unknown): User | null {
  const parsed = RequestSchema.safeParse(req);
  if (!parsed.success) return null;
  // ...
}
```

## 5. Testing framework

**vitest** — новый стандарт (2026). **jest** — только для legacy-проектов.

Запись verification (`.grace/verification/main.xml`; id — `V-` + id модуля: `M-AUTH-VALIDATE` → `V-M-AUTH-VALIDATE`):

```xml
<VD-MAIN>
  <V-M-AUTH-VALIDATE>
    <Priority>high</Priority>
    <Cwd>.</Cwd>
    <TestFiles>
      <File>src/auth/validate.test.ts</File>
    </TestFiles>
    <Command>pnpm vitest run src/auth/validate.test.ts</Command>
    <Scenario>valid JWT with fresh iat → returns User</Scenario>
    <Scenario>invalid or expired JWT → returns null</Scenario>
    <Marker>[AuthValidate][validateUser][BLOCK_DECODE_JWT]</Marker>
    <TraceAssertion>marker present in exactly two log lines of the success scenario</TraceAssertion>
  </V-M-AUTH-VALIDATE>
</VD-MAIN>
```

Для property-based: `fast-check`. Для integration/e2e: `vitest` + `testcontainers`.

## 6. Structured logs

**pino** — первый выбор (JSON по умолчанию, низкий overhead). **winston** — альтернатива при сложных transport-цепочках.

```ts
import pino from "pino";

const logger = pino({ base: null, timestamp: pino.stdTimeFunctions.isoTime });

// внутри validateUser:
logger.info({
  anchor: "validateUser:BLOCK_DECODE_JWT",
  module: "M-AUTH-VALIDATE",
  requirement: "JWT validation",
  correlation_id: req.correlationId,
  belief: "payload trusted, skew=0",
  event: "jwt_decoded",
});
```

Логер конфигурируется в `src/logging.ts`; поля `anchor`, `module`, `requirement`, `correlation_id`, `belief` — обязательные.

## 7. CGC: TypeScript — полная поддержка

CodeGraphContext имеет отдельные парсеры `typescript.py` и `typescriptjsx.py`. Поддерживаются функции, классы, методы, интерфейсы, type aliases, enums, импорты/экспорты, вызовы. Ограничений для якорей методологии doubled-graph нет.

Нюансы, о которых стоит знать:
- **Re-exports** (`export * from "./x"`) парсятся как import-транзит, но сам модуль `x` появляется в графе только если он проиндексирован отдельно.
- **Conditional types** и сложные generic-сигнатуры индексируются по имени symbol'а, но не разворачиваются — `impact`-анализ работает по имени, не по телу типа.

## 8. Project-layout

```
repo/
├── package.json
├── tsconfig.json
├── src/
│   ├── auth/validate.ts
│   └── auth/validate.test.ts        ← co-located tests
├── tests/                            ← либо сюда, если проект больше
│   └── integration/...
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
  <Path>src/auth/validate.ts</Path>
  <Depends>
    <M-AUTH-TOKENS />
  </Depends>
</M-AUTH-VALIDATE>
```

Тест-файл (`src/auth/validate.test.ts`) в `<Path>` не входит — он указывается в `<TestFiles>` записи `V-M-AUTH-VALIDATE`.

Для monorepo (pnpm workspaces, turbo): `<Path>` указывает на путь относительно корня репо, включая `packages/<name>/src/...`.

## 9. Anti-patterns

- **Якоря в JSDoc-блоке:**
  ```ts
  /**
   * START_CONTRACT: validateUser   ← парсер не видит якоря в JSDoc
   */
  export function validateUser(...) {}
  ```
  Использовать `//` непосредственно над функцией.

- **Декоратор между контрактом и функцией:**
  ```ts
  // START_CONTRACT: validate
  // END_CONTRACT: validate
  @injectable()                        ← должен быть ДО контракта или СРАЗУ над объявлением
  export class Service { ... }
  ```
  Порядок: `// ... контракт ...` → декоратор → `class`/`function`.

- **Якорь блока внутри JSX-атрибута:**
  ```tsx
  <div className={/* START_BLOCK_HEADER */ styles.header}>   ← парсер ломается
  ```
  Якоря блоков — только между JSX-элементами или до/после всего JSX.

- **Смешивание `//` и `/* */` для одного якоря:** открывающий и закрывающий должны быть одного типа. `doubled-graph lint` проверяет парность по префиксу.

- **Контракт на `export default function` без имени:**
  ```ts
  // START_CONTRACT: ?   ← имя функции неопределено
  export default function (req) { ... }
  ```
  Давать функции имя, даже при default-экспорте: `export default function validateUser(...)`.

## 10. Запуск doubled-graph lint на TS-проекте

```bash
doubled-graph lint --path .          # gateway
grace lint --path . --format json    # сам линтер; JSON только через --format json
```

CLI `grace` написан на Bun и нативно парсит TS-комментарии. Дополнительные плагины не нужны.

Проект без `.grace` (ещё на `docs/*.xml`) получит от линтера `project.grace3-detected` — это сигнал к `doubled-graph migrate check` / `apply`, а не ошибка разметки.

---

## Чек-лист применения

- [ ] MODULE_CONTRACT и MODULE_MAP — `//`-комментарии в начале файла до импортов; `LINKS` содержит `M-*`, `MAP_MODE` согласован с `ROLE`.
- [ ] CONTRACT: fn — `//`-комментарии перед объявлением функции/метода.
- [ ] Декораторы класса идут **после** блока CONTRACT.
- [ ] BLOCK_NAME — `//`, `END_BLOCK` перед закрывающей `}` или ранним `return`.
- [ ] zod на границах API; для критических модулей — + текстовые pre/post.
- [ ] vitest-команда в `<Command>` записи `V-<M-id>` (`.grace/verification/main.xml`).
- [ ] pino/winston с полями `anchor`, `module`, `requirement` (свободный текст требования — `UC-*` в 4.x нет), `correlation_id`, `belief`.
- [ ] Default-экспорты имеют имя функции.
