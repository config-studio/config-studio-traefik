import { LinterIssue, TraefikIndex } from './types';

export function lintTraefikIndex(index: TraefikIndex): LinterIssue[] {
  const issues: LinterIssue[] = [];

  // 1. Check for Unresolved Middlewares and Services in Routers
  index.routers.forEach((router) => {
    // Check missing rule
    if (!router.rule) {
      issues.push({
        severity: 'error',
        code: 'MISSING_RULE',
        message: `Router '${router.id}' has no routing rule defined.`,
        file: router.file,
        line: router.line,
      });
    }

    // Check unresolved service
    if (router.service) {
      const cleanSvc = router.service.replace(/@file$/, '');
      if (!index.services.has(cleanSvc)) {
        issues.push({
          severity: 'error',
          code: 'UNRESOLVED_SERVICE',
          message: `Router '${router.id}' references service '${router.service}', but it is not defined in any file.`,
          file: router.file,
          line: router.serviceLine || router.line,
        });
      }
    }

    // Check unresolved middlewares
    router.middlewares.forEach((mw) => {
      const cleanMw = mw.replace(/@file$/, '');
      if (!index.middlewares.has(cleanMw)) {
        issues.push({
          severity: 'error',
          code: 'UNRESOLVED_MIDDLEWARE',
          message: `Middleware '${mw}' referenced in router '${router.id}' is not defined in any scanned file.`,
          file: router.file,
          line: router.middlewareLines?.[mw] || router.line,
        });
      }
    });
  });

  // 2. Check for Duplicate Host conflicts on the same entryPoint
  const hostEntryPointMap = new Map<string, { routerId: string; file: string; line: number; priority?: number }[]>();

  index.routers.forEach((router) => {
    if (!router.host) return;

    const entryPoints = router.entryPoints.length > 0 ? router.entryPoints : ['default'];
    entryPoints.forEach((ep) => {
      const key = `${router.host.toLowerCase()}::${ep.toLowerCase()}`;
      const list = hostEntryPointMap.get(key) || [];
      list.push({
        routerId: router.id,
        file: router.file,
        line: router.line,
        priority: router.priority,
      });
      hostEntryPointMap.set(key, list);
    });
  });

  hostEntryPointMap.forEach((routers, key) => {
    if (routers.length > 1) {
      // If priorities are not set or identical, report a duplicate conflict
      const priorities = routers.map((r) => r.priority ?? 0);
      const allSamePriority = priorities.every((p) => p === priorities[0]);

      if (allSamePriority) {
        const [host, ep] = key.split('::');
        routers.forEach((r, idx) => {
          const other = routers[(idx + 1) % routers.length];
          issues.push({
            severity: 'warning',
            code: 'DUPLICATE_HOST',
            message: `Conflicting Host('${host}') on entryPoint '${ep}' between router '${r.routerId}' and '${other.routerId}' without priority.`,
            file: r.file,
            line: r.line,
            relatedFile: other.file,
            relatedLine: other.line,
          });
        });
      }
    }
  });

  return issues;
}
