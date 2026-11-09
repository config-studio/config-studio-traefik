export interface TraefikMiddleware {
  id: string;
  name: string;
  file: string;
  line: number;
  type: string;
  summary: string;
  rawConfig?: any;
}

export interface TraefikService {
  id: string;
  file: string;
  line: number;
  type: 'loadBalancer' | 'weighted' | 'mirroring' | 'unknown';
  servers: string[];
  passHostHeader?: boolean;
}

export interface TraefikRouter {
  id: string;
  file: string;
  line: number;
  rule: string;
  host?: string;
  entryPoints: string[];
  service: string;
  serviceLine?: number;
  middlewares: string[];
  middlewareLines?: Record<string, number>;
  tls: boolean;
  certResolver?: string;
  priority?: number;
}

export interface LinterIssue {
  severity: 'error' | 'warning' | 'info';
  code:
    | 'UNRESOLVED_MIDDLEWARE'
    | 'UNRESOLVED_SERVICE'
    | 'DUPLICATE_ROUTER'
    | 'DUPLICATE_HOST'
    | 'MISSING_RULE'
    | 'MISSING_TARGET_URL';
  message: string;
  file: string;
  line: number;
  column?: number;
  relatedFile?: string;
  relatedLine?: number;
}

export interface TraefikIndex {
  middlewares: Map<string, TraefikMiddleware>;
  services: Map<string, TraefikService>;
  routers: Map<string, TraefikRouter>;
  files: string[];
  rulesDir?: string;
  issues: LinterIssue[];
  lastScanTime: number;
}

export interface NewServiceConfig {
  name: string;
  host: string;
  targetUrl: string;
  entryPoint: string;
  enableTls: boolean;
  certResolver: string;
  middlewares: string[];
  rulesSubdir?: string;
}

export type MiddlewareRecipeType =
  | 'security-headers'
  | 'rate-limit'
  | 'basic-auth'
  | 'ip-allowlist'
  | 'redirect-scheme'
  | 'compress'
  | 'crowdsec';

export interface BlueprintField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean';
  defaultValue: any;
  placeholder?: string;
  hint?: string;
}

export interface MiddlewareBlueprint {
  type: MiddlewareRecipeType;
  title: string;
  category: 'security' | 'traffic' | 'routing' | 'performance';
  description: string;
  defaultName: string;
  fields: BlueprintField[];
  generateYaml: (name: string, params: Record<string, any>) => string;
}
