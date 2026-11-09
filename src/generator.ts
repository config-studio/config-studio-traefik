import { MiddlewareBlueprint, MiddlewareRecipeType, NewServiceConfig } from './types';

export function generateServiceYaml(config: NewServiceConfig): string {
  const routerId = config.enableTls ? `${config.name}-router` : config.name;
  const serviceId = `${config.name}-service`;

  let mwLines = '';
  if (config.middlewares && config.middlewares.length > 0) {
    mwLines =
      `      middlewares:\n` +
      config.middlewares.map((m) => `        - ${m.replace(/^"|"$/g, '').replace(/@file$/, '')}`).join('\n') +
      '\n';
  }

  let tlsBlock = '';
  if (config.enableTls) {
    if (config.certResolver) {
      tlsBlock = `      tls:\n        certResolver: ${config.certResolver.replace(/^"|"$/g, '')}\n`;
    } else {
      tlsBlock = `      tls: {}\n`;
    }
  }

  const ep = (config.entryPoint || 'websecure').replace(/^"|"$/g, '');

  const yaml = `http:
  routers:
    ${routerId}:
      rule: "Host(\`${config.host}\`)"
      entryPoints:
        - ${ep}
${mwLines}      service: ${serviceId}
${tlsBlock}
  services:
    ${serviceId}:
      loadBalancer:
        servers:
          - url: "${config.targetUrl}"
        passHostHeader: true
`;

  return yaml;
}

export const MIDDLEWARE_BLUEPRINTS: MiddlewareBlueprint[] = [
  {
    type: 'security-headers',
    title: 'Security Headers',
    category: 'security',
    description: 'HSTS, X-Frame-Options (SAMEORIGIN), nosniff, XSS protection, Referrer-Policy',
    defaultName: 'mw-security-headers',
    fields: [
      {
        key: 'sslRedirect',
        label: 'SSL Redirect',
        type: 'boolean',
        defaultValue: true,
        hint: 'Принудительный редирект на защищенный протокол',
      },
      {
        key: 'customFrameOptionsValue',
        label: 'Frame Options',
        type: 'text',
        defaultValue: 'SAMEORIGIN',
        hint: 'Защита от кликджекинга (SAMEORIGIN, DENY)',
      },
    ],
    generateYaml: (name, params) => {
      const frameOpt = params.customFrameOptionsValue || 'SAMEORIGIN';
      const sslRedir = params.sslRedirect !== false;
      return `http:
  middlewares:
    ${name}:
      headers:
        sslRedirect: ${sslRedir}
        stsSeconds: 31536000
        stsIncludeSubdomains: true
        stsPreload: true
        forceSTSHeader: true
        customFrameOptionsValue: "${frameOpt}"
        contentTypeNosniff: true
        browserXssFilter: true
        referrerPolicy: "same-origin"
`;
    },
  },
  {
    type: 'rate-limit',
    title: 'Rate Limit',
    category: 'traffic',
    description: 'Ограничение частоты запросов для защиты от DDoS и брутфорса',
    defaultName: 'mw-rate-limit',
    fields: [
      {
        key: 'average',
        label: 'Среднее число запросов (average)',
        type: 'number',
        defaultValue: 100,
        hint: 'Максимум запросов в единицу времени',
      },
      {
        key: 'burst',
        label: 'Всплеск (burst)',
        type: 'number',
        defaultValue: 50,
        hint: 'Максимальный разрешенный размер кратковременного всплеска',
      },
      {
        key: 'period',
        label: 'Период (period)',
        type: 'text',
        defaultValue: '1s',
        hint: 'Окно замера (1s, 1m, 1h)',
      },
    ],
    generateYaml: (name, params) => {
      const avg = Number(params.average) || 100;
      const burst = Number(params.burst) || 50;
      const period = params.period || '1s';
      return `http:
  middlewares:
    ${name}:
      rateLimit:
        average: ${avg}
        burst: ${burst}
        period: "${period}"
`;
    },
  },
  {
    type: 'basic-auth',
    title: 'Basic Auth (HTTP)',
    category: 'security',
    description: 'HTTP Basic авторизация по логину и паролю (htpasswd / bcrypt)',
    defaultName: 'mw-basic-auth',
    fields: [
      {
        key: 'users',
        label: 'Пользователи (по строкам или через запятую)',
        type: 'textarea',
        defaultValue: 'admin:$apr1$H6uskkkW$IgXLP6ewTrSuBkTrqE8wj/',
        placeholder: 'admin:$apr1$H6uskkkW$IgXLP6ewTrSuBkTrqE8wj/\nuser2:$2y$05$...',
        hint: 'Сгенерируйте через htpasswd -nb user password',
      },
      {
        key: 'removeHeader',
        label: 'Удалять заголовок Authorization при отправке бэкенду',
        type: 'boolean',
        defaultValue: true,
      },
    ],
    generateYaml: (name, params) => {
      const rawUsers = String(params.users || 'admin:$apr1$H6uskkkW$IgXLP6ewTrSuBkTrqE8wj/');
      const userList = rawUsers
        .split(/[\n,]/)
        .map((u) => u.trim())
        .filter(Boolean);
      const userLines = userList.map((u) => `          - "${u.replace(/"/g, '\\"')}"`).join('\n');
      const removeHdr = params.removeHeader !== false;
      return `http:
  middlewares:
    ${name}:
      basicAuth:
        users:
${userLines}
        removeHeader: ${removeHdr}
`;
    },
  },
  {
    type: 'ip-allowlist',
    title: 'IP AllowList (Whitelist)',
    category: 'security',
    description: 'Ограничение доступа к сервису списком доверенных IP или CIDR-диапазонов',
    defaultName: 'mw-local-only',
    fields: [
      {
        key: 'sourceRange',
        label: 'Разрешенные CIDR подсети',
        type: 'textarea',
        defaultValue: '127.0.0.1/32\n192.168.0.0/16\n10.0.0.0/8',
        placeholder: '127.0.0.1/32\n192.168.1.0/24',
        hint: 'Подсети через перевод строки или запятую',
      },
    ],
    generateYaml: (name, params) => {
      const rawCidrs = String(params.sourceRange || '127.0.0.1/32\n192.168.0.0/16\n10.0.0.0/8');
      const cidrList = rawCidrs
        .split(/[\n,]/)
        .map((c) => c.trim())
        .filter(Boolean);
      const cidrLines = cidrList.map((c) => `          - "${c.replace(/"/g, '')}"`).join('\n');
      return `http:
  middlewares:
    ${name}:
      ipAllowList:
        sourceRange:
${cidrLines}
`;
    },
  },
  {
    type: 'redirect-scheme',
    title: 'Redirect Scheme (HTTPS)',
    category: 'routing',
    description: 'Постоянный HTTP 301 редирект входящего трафика с HTTP на защищенный HTTPS',
    defaultName: 'mw-redirect-https',
    fields: [
      {
        key: 'scheme',
        label: 'Целевая схема',
        type: 'text',
        defaultValue: 'https',
      },
      {
        key: 'permanent',
        label: 'Постоянный редирект (HTTP 301)',
        type: 'boolean',
        defaultValue: true,
      },
    ],
    generateYaml: (name, params) => {
      const scheme = params.scheme || 'https';
      const permanent = params.permanent !== false;
      return `http:
  middlewares:
    ${name}:
      redirectScheme:
        scheme: "${scheme}"
        permanent: ${permanent}
`;
    },
  },
  {
    type: 'compress',
    title: 'Compress (Gzip / Deflate)',
    category: 'performance',
    description: 'Сжатие ответов веб-сервера для экономии трафика и ускорения загрузки клиентов',
    defaultName: 'mw-compress',
    fields: [
      {
        key: 'minResponseBodyBytes',
        label: 'Мин. размер ответа для сжатия (bytes)',
        type: 'number',
        defaultValue: 1024,
      },
    ],
    generateYaml: (name, params) => {
      const minBytes = Number(params.minResponseBodyBytes) || 1024;
      return `http:
  middlewares:
    ${name}:
      compress:
        minResponseBodyBytes: ${minBytes}
`;
    },
  },
  {
    type: 'crowdsec',
    title: 'CrowdSec Bouncer',
    category: 'security',
    description: 'Интеграция с CrowdSec для проактивной блокировки IP-адресов ботнетов и сканеров',
    defaultName: 'mw-crowdsec-bouncer',
    fields: [
      {
        key: 'crowdsecMode',
        label: 'Режим проверки (crowdsecMode)',
        type: 'text',
        defaultValue: 'live',
        hint: 'live или stream',
      },
      {
        key: 'updateInterval',
        label: 'Интервал обновления (updateInterval)',
        type: 'text',
        defaultValue: '10s',
      },
    ],
    generateYaml: (name, params) => {
      const mode = params.crowdsecMode || 'live';
      const interval = params.updateInterval || '10s';
      return `http:
  middlewares:
    ${name}:
      plugin:
        crowdsecBouncer:
          enabled: true
          crowdsecMode: ${mode}
          updateInterval: "${interval}"
`;
    },
  },
];

export function generateMiddlewareYaml(
  type: MiddlewareRecipeType,
  name: string,
  params: Record<string, any> = {}
): string {
  const blueprint = MIDDLEWARE_BLUEPRINTS.find((b) => b.type === type);
  if (!blueprint) {
    throw new Error(`Unknown middleware blueprint recipe type: ${type}`);
  }
  return blueprint.generateYaml(name, params);
}

