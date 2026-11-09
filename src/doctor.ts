import { LinterIssue, TraefikIndex } from './types';

export interface TraefikDoctorSummary {
  routersCount: number;
  servicesCount: number;
  middlewaresCount: number;
  issuesCount: number;
  errorsCount: number;
  warningsCount: number;
}

export interface TraefikApiRuntimeError {
  type: 'router' | 'service' | 'middleware';
  name: string;
  status: string;
  errors?: string[];
}

export interface TraefikApiStatus {
  checked: boolean;
  reachable: boolean;
  url: string;
  version?: string;
  startDate?: string;
  overview?: {
    httpRoutersTotal: number;
    httpServicesTotal: number;
    httpMiddlewaresTotal: number;
  };
  runtimeErrors: TraefikApiRuntimeError[];
  unloadedConfigs: string[];
  error?: string;
}

export interface TraefikDoctorReport {
  timestamp: number;
  overallStatus: 'healthy' | 'warning' | 'error';
  localSummary: TraefikDoctorSummary;
  issues: LinterIssue[];
  apiStatus: TraefikApiStatus;
}

/**
 * Runs a local AST and reference integrity audit using the indexed files.
 */
export function runLocalAudit(index: TraefikIndex): TraefikDoctorReport {
  const issues = index.issues || [];
  const errorsCount = issues.filter((i) => i.severity === 'error').length;
  const warningsCount = issues.filter((i) => i.severity === 'warning').length;

  let overallStatus: 'healthy' | 'warning' | 'error' = 'healthy';
  if (errorsCount > 0) {
    overallStatus = 'error';
  } else if (warningsCount > 0) {
    overallStatus = 'warning';
  }

  const localSummary: TraefikDoctorSummary = {
    routersCount: index.routers?.size || 0,
    servicesCount: index.services?.size || 0,
    middlewaresCount: index.middlewares?.size || 0,
    issuesCount: issues.length,
    errorsCount,
    warningsCount,
  };

  return {
    timestamp: Date.now(),
    overallStatus,
    localSummary,
    issues,
    apiStatus: {
      checked: false,
      reachable: false,
      url: '',
      runtimeErrors: [],
      unloadedConfigs: [],
    },
  };
}

/**
 * Queries Traefik REST API (/api/version, /api/overview, /api/rawdata)
 * and correlates runtime status with local workspace index.
 */
export async function queryTraefikApi(
  apiUrl: string,
  index?: TraefikIndex,
  fetchFn: typeof fetch = fetch
): Promise<TraefikApiStatus> {
  const cleanUrl = (apiUrl || 'http://localhost:8080').trim().replace(/\/+$/, '');

  const result: TraefikApiStatus = {
    checked: true,
    reachable: false,
    url: cleanUrl,
    runtimeErrors: [],
    unloadedConfigs: [],
  };

  try {
    // 1. Version Check
    const verRes = await fetchFn(`${cleanUrl}/api/version`);
    if (!verRes.ok) {
      result.error = `HTTP ${verRes.status} ${verRes.statusText} from /api/version`;
      return result;
    }
    const verData = (await verRes.json()) as any;
    result.reachable = true;
    result.version = verData.version
      ? `${verData.version}${verData.codename ? ` (${verData.codename})` : ''}`
      : 'Unknown';
    result.startDate = verData.startDate;

    // 2. Overview Check
    try {
      const ovRes = await fetchFn(`${cleanUrl}/api/overview`);
      if (ovRes.ok) {
        const ovData = (await ovRes.json()) as any;
        if (ovData?.http) {
          result.overview = {
            httpRoutersTotal: ovData.http.routers?.total ?? 0,
            httpServicesTotal: ovData.http.services?.total ?? 0,
            httpMiddlewaresTotal: ovData.http.middlewares?.total ?? 0,
          };
        }
      }
    } catch (_) {}

    // 3. Rawdata Runtime Check
    try {
      const rawRes = await fetchFn(`${cleanUrl}/api/rawdata`);
      if (rawRes.ok) {
        const rawData = (await rawRes.json()) as any;
        const routers = rawData?.routers || {};
        const services = rawData?.services || {};
        const middlewares = rawData?.middlewares || {};

        // Inspect routers for errors or disabled status
        for (const [rName, rObj] of Object.entries<any>(routers)) {
          if (rObj?.status === 'disabled' || (rObj?.err && rObj.err.length > 0)) {
            result.runtimeErrors.push({
              type: 'router',
              name: rName,
              status: rObj.status || 'unknown',
              errors: Array.isArray(rObj.err) ? rObj.err : rObj.err ? [String(rObj.err)] : undefined,
            });
          }
        }

        // Inspect services
        for (const [sName, sObj] of Object.entries<any>(services)) {
          if (sObj?.status === 'disabled' || (sObj?.err && sObj.err.length > 0)) {
            result.runtimeErrors.push({
              type: 'service',
              name: sName,
              status: sObj.status || 'unknown',
              errors: Array.isArray(sObj.err) ? sObj.err : sObj.err ? [String(sObj.err)] : undefined,
            });
          }
        }

        // Inspect middlewares
        for (const [mName, mObj] of Object.entries<any>(middlewares)) {
          if (mObj?.status === 'disabled' || (mObj?.err && mObj.err.length > 0)) {
            result.runtimeErrors.push({
              type: 'middleware',
              name: mName,
              status: mObj.status || 'unknown',
              errors: Array.isArray(mObj.err) ? mObj.err : mObj.err ? [String(mObj.err)] : undefined,
            });
          }
        }

        // Check if workspace routers exist in Traefik runtime
        if (index && index.routers) {
          const runtimeRouterKeys = new Set(Object.keys(routers));
          for (const [rId] of index.routers.entries()) {
            // Traefik adds provider suffix (e.g. app-router@file)
            const matches = Array.from(runtimeRouterKeys).some(
              (k) => k === rId || k === `${rId}@file` || k.startsWith(`${rId}@`)
            );
            if (!matches) {
              result.unloadedConfigs.push(`Роутер '${rId}' найден в файлах, но не загружен в Traefik`);
            }
          }
        }
      }
    } catch (_) {}

    return result;
  } catch (err: any) {
    result.reachable = false;
    result.error = err?.message || String(err);
    return result;
  }
}
