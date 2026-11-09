"use strict";
var ConfigStudioTraefikPlugin = (() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/linter.ts
  function lintTraefikIndex(index) {
    const issues = [];
    index.routers.forEach((router) => {
      if (!router.rule) {
        issues.push({
          severity: "error",
          code: "MISSING_RULE",
          message: `Router '${router.id}' has no routing rule defined.`,
          file: router.file,
          line: router.line
        });
      }
      if (router.service) {
        const cleanSvc = router.service.replace(/@file$/, "").trim();
        const hasSvc = index.services.has(cleanSvc) || index.services.has(`${cleanSvc}-svc`) || index.services.has(`${cleanSvc}-service`) || cleanSvc.endsWith("-svc") && index.services.has(cleanSvc.replace(/-svc$/, "")) || cleanSvc.endsWith("-service") && index.services.has(cleanSvc.replace(/-service$/, ""));
        if (!hasSvc) {
          issues.push({
            severity: "error",
            code: "UNRESOLVED_SERVICE",
            message: `Router '${router.id}' references service '${router.service}', but it is not defined in any file.`,
            file: router.file,
            line: router.serviceLine || router.line
          });
        }
      }
      router.middlewares.forEach((mw) => {
        const cleanMw = mw.replace(/@file$/, "").trim();
        const hasMw = index.middlewares.has(cleanMw) || index.middlewares.has(`mw-${cleanMw}`) || cleanMw.startsWith("mw-") && index.middlewares.has(cleanMw.substring(3));
        if (!hasMw) {
          issues.push({
            severity: "error",
            code: "UNRESOLVED_MIDDLEWARE",
            message: `Middleware '${mw}' referenced in router '${router.id}' is not defined in any scanned file.`,
            file: router.file,
            line: router.middlewareLines?.[mw] || router.line
          });
        }
      });
    });
    const hostEntryPointMap = /* @__PURE__ */ new Map();
    index.routers.forEach((router) => {
      if (!router.host) return;
      const entryPoints = router.entryPoints.length > 0 ? router.entryPoints : ["default"];
      entryPoints.forEach((ep) => {
        const key = `${router.host.toLowerCase()}::${ep.toLowerCase()}`;
        const list = hostEntryPointMap.get(key) || [];
        list.push({
          routerId: router.id,
          file: router.file,
          line: router.line,
          priority: router.priority
        });
        hostEntryPointMap.set(key, list);
      });
    });
    hostEntryPointMap.forEach((routers, key) => {
      if (routers.length > 1) {
        const priorities = routers.map((r) => r.priority ?? 0);
        const allSamePriority = priorities.every((p) => p === priorities[0]);
        if (allSamePriority) {
          const [host, ep] = key.split("::");
          routers.forEach((r, idx) => {
            const other = routers[(idx + 1) % routers.length];
            issues.push({
              severity: "warning",
              code: "DUPLICATE_HOST",
              message: `Conflicting Host('${host}') on entryPoint '${ep}' between router '${r.routerId}' and '${other.routerId}' without priority.`,
              file: r.file,
              line: r.line,
              relatedFile: other.file,
              relatedLine: other.line
            });
          });
        }
      }
    });
    return issues;
  }

  // src/parser.ts
  function parseTraefikYaml(yamlContent, filePath) {
    const middlewares = [];
    const routers = [];
    const services = [];
    const sectionLines = {};
    const lines = yamlContent.split(/\r?\n/);
    let currentSection = null;
    let currentItem = null;
    let currentProperty = null;
    let sectionIndent = -1;
    let itemIndent = -1;
    function finalizeCurrentItem() {
      if (!currentItem) return;
      if (currentSection === "routers") {
        const router = {
          id: currentItem.id,
          file: filePath,
          line: currentItem.line,
          rule: currentItem.rule || "",
          host: extractHostFromRule(currentItem.rule || ""),
          entryPoints: currentItem.entryPoints || [],
          service: currentItem.service || currentItem.id,
          serviceLine: currentItem.serviceLine,
          middlewares: currentItem.middlewares || [],
          middlewareLines: currentItem.middlewareLines || {},
          tls: Boolean(currentItem.tls),
          certResolver: currentItem.certResolver,
          priority: currentItem.priority
        };
        routers.push(router);
      } else if (currentSection === "services") {
        const service = {
          id: currentItem.id,
          file: filePath,
          line: currentItem.line,
          type: currentItem.type || "loadBalancer",
          servers: currentItem.servers || [],
          passHostHeader: currentItem.passHostHeader
        };
        services.push(service);
      } else if (currentSection === "middlewares") {
        const middleware = {
          id: currentItem.id,
          name: currentItem.id,
          file: filePath,
          line: currentItem.line,
          type: currentItem.type || "custom",
          summary: currentItem.summary || buildMiddlewareSummary(currentItem.type, currentItem.raw),
          rawConfig: currentItem.raw
        };
        middlewares.push(middleware);
      }
      currentItem = null;
      currentProperty = null;
    }
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const lineNumber = i + 1;
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const indent = rawLine.search(/\S/);
      const isSectionHeaderCandidate = trimmed === "routers:" || trimmed === "services:" || trimmed === "middlewares:" || trimmed.match(/^(routers|services|middlewares)\s*:\s*$/);
      if (isSectionHeaderCandidate && (itemIndent === -1 || indent < itemIndent)) {
        finalizeCurrentItem();
        const match = trimmed.match(/^(routers|services|middlewares)/);
        currentSection = match ? match[1] : null;
        if (currentSection) {
          sectionLines[currentSection] = lineNumber;
        }
        sectionIndent = indent;
        itemIndent = -1;
        continue;
      }
      if (currentSection && sectionIndent !== -1 && indent <= sectionIndent && trimmed.endsWith(":") && !trimmed.startsWith("-")) {
        finalizeCurrentItem();
        currentSection = null;
        sectionIndent = -1;
        itemIndent = -1;
        continue;
      }
      if (!currentSection) continue;
      const isItemHeaderCandidate = trimmed.match(/^([a-zA-Z0-9_\-\.]+)\s*:\s*$/);
      if (isItemHeaderCandidate && indent > sectionIndent && (itemIndent === -1 || indent <= itemIndent)) {
        finalizeCurrentItem();
        itemIndent = indent;
        currentItem = {
          id: isItemHeaderCandidate[1],
          line: lineNumber
        };
        currentProperty = null;
        continue;
      }
      if (!currentItem) continue;
      if (indent > itemIndent) {
        const propMatch = trimmed.match(/^([a-zA-Z0-9_\-]+)\s*:\s*(.*)$/);
        if (propMatch && !trimmed.startsWith("-")) {
          const key = propMatch[1];
          const val = propMatch[2].trim();
          currentProperty = key;
          if (currentSection === "routers") {
            if (key === "rule") {
              currentItem.rule = cleanQuote(val);
            } else if (key === "service") {
              currentItem.service = cleanQuote(val);
              currentItem.serviceLine = lineNumber;
            } else if (key === "priority") {
              currentItem.priority = parseInt(val, 10);
            } else if (key === "tls") {
              currentItem.tls = true;
              if (val && val !== "{}") {
                const crMatch = val.match(/certResolver\s*:\s*['"]?([a-zA-Z0-9_\-]+)['"]?/);
                if (crMatch) currentItem.certResolver = crMatch[1];
              }
            } else if (key === "certResolver") {
              currentItem.tls = true;
              currentItem.certResolver = cleanQuote(val);
            } else if (key === "middlewares") {
              currentItem.middlewares = currentItem.middlewares || [];
              currentItem.middlewareLines = currentItem.middlewareLines || {};
              if (val.startsWith("[") && val.endsWith("]")) {
                const items = parseInlineArray(val);
                items.forEach((item) => {
                  currentItem.middlewares.push(item);
                  currentItem.middlewareLines[item] = lineNumber;
                });
              }
            } else if (key === "entryPoints") {
              currentItem.entryPoints = currentItem.entryPoints || [];
              if (val.startsWith("[") && val.endsWith("]")) {
                currentItem.entryPoints.push(...parseInlineArray(val));
              }
            }
          } else if (currentSection === "services") {
            if (key === "passHostHeader") {
              currentItem.passHostHeader = val.toLowerCase() === "true";
            } else if (key === "loadBalancer" || key === "weighted" || key === "mirroring") {
              currentItem.type = key;
            }
          } else if (currentSection === "middlewares") {
            if (!currentItem.type) {
              currentItem.type = key;
              currentItem.raw = currentItem.raw || {};
              if (val) currentItem.raw[key] = val;
            }
          }
          continue;
        }
        const listMatch = trimmed.match(/^-\s*(.*)$/);
        if (listMatch) {
          const val = cleanQuote(listMatch[1].trim());
          if (currentSection === "routers") {
            if (currentProperty === "middlewares") {
              currentItem.middlewares = currentItem.middlewares || [];
              currentItem.middlewareLines = currentItem.middlewareLines || {};
              currentItem.middlewares.push(val);
              currentItem.middlewareLines[val] = lineNumber;
            } else if (currentProperty === "entryPoints") {
              currentItem.entryPoints = currentItem.entryPoints || [];
              currentItem.entryPoints.push(val);
            }
          } else if (currentSection === "services") {
            const urlMatch = val.match(/^url\s*:\s*['"]?([^'"]+)['"]?/);
            if (urlMatch) {
              currentItem.servers = currentItem.servers || [];
              currentItem.servers.push(urlMatch[1]);
            } else if (val.startsWith("http://") || val.startsWith("https://")) {
              currentItem.servers = currentItem.servers || [];
              currentItem.servers.push(val);
            }
          } else if (currentSection === "middlewares") {
            currentItem.raw = currentItem.raw || {};
            if (currentProperty) {
              currentItem.raw[currentProperty] = currentItem.raw[currentProperty] || [];
              if (Array.isArray(currentItem.raw[currentProperty])) {
                currentItem.raw[currentProperty].push(val);
              }
            }
          }
          continue;
        }
        if (currentSection === "routers" && (currentProperty === "tls" || trimmed.startsWith("certResolver:"))) {
          const crSubMatch = trimmed.match(/^certResolver\s*:\s*['"]?([a-zA-Z0-9_\-]+)['"]?/);
          if (crSubMatch) {
            currentItem.tls = true;
            currentItem.certResolver = crSubMatch[1];
          }
        } else if (currentSection === "services" && trimmed.startsWith("url:")) {
          const uMatch = trimmed.match(/^url\s*:\s*['"]?([^'"]+)['"]?/);
          if (uMatch) {
            currentItem.servers = currentItem.servers || [];
            currentItem.servers.push(uMatch[1]);
          }
        }
      }
    }
    finalizeCurrentItem();
    return { middlewares, routers, services, sectionLines };
  }
  function cleanQuote(str) {
    if (!str) return "";
    str = str.trim();
    if (str.startsWith('"') && str.endsWith('"') || str.startsWith("'") && str.endsWith("'")) {
      return str.slice(1, -1);
    }
    return str;
  }
  function parseInlineArray(str) {
    const content = str.slice(1, -1).trim();
    if (!content) return [];
    return content.split(",").map((s) => cleanQuote(s.trim())).filter(Boolean);
  }
  function extractHostFromRule(rule) {
    if (!rule) return void 0;
    const hostMatch = rule.match(/Host\s*\(\s*[`'"]([^`'"]+)[`'"]\s*\)/i);
    if (hostMatch) {
      return hostMatch[1];
    }
    const regexpMatch = rule.match(/HostRegexp\s*\(\s*[`'"]([^`'"]+)[`'"]\s*\)/i);
    if (regexpMatch) {
      return regexpMatch[1];
    }
    return void 0;
  }
  function buildMiddlewareSummary(type, raw) {
    if (!type) return "Custom Middleware";
    switch (type) {
      case "ipAllowList": {
        const ranges = raw?.sourceRange;
        const count = Array.isArray(ranges) ? ranges.length : 1;
        return `ipAllowList (${count} CIDR${count > 1 ? "s" : ""})`;
      }
      case "basicAuth":
        return "basicAuth (Protected)";
      case "headers":
        return "Security Headers";
      case "rateLimit":
        return "Rate Limiting";
      case "compress":
        return "Gzip/Brotli Compression";
      case "stripPrefix":
        return "Prefix Stripper";
      case "redirectRegex":
      case "redirectScheme":
        return "Redirect Rule";
      case "forwardAuth":
        return "Forward Authentication";
      case "plugin":
        return "Custom Traefik Plugin";
      default:
        return `${type} Middleware`;
    }
  }

  // src/indexer.ts
  var TraefikWorkspaceIndexer = class {
    constructor(fs) {
      __publicField(this, "fs");
      __publicField(this, "currentIndex", null);
      __publicField(this, "isScanning", false);
      this.fs = fs;
    }
    getIndex() {
      return this.currentIndex;
    }
    async scanWorkspace() {
      if (this.isScanning) {
        return this.currentIndex || {
          middlewares: /* @__PURE__ */ new Map(),
          services: /* @__PURE__ */ new Map(),
          routers: /* @__PURE__ */ new Map(),
          files: [],
          issues: [],
          lastScanTime: Date.now()
        };
      }
      this.isScanning = true;
      try {
        const allFiles = await this.fs.listFiles();
        const traefikFiles = allFiles.filter((f) => {
          const lower = f.toLowerCase();
          if (!lower.endsWith(".yml") && !lower.endsWith(".yaml")) return false;
          const name = lower.split(/[\\/]/).pop() || "";
          return name.startsWith("mw-") || name.startsWith("ser-") || name.startsWith("traefik") || name === "config.yml" || name === "config.yaml" || lower.startsWith("rules/") || lower.startsWith("rules\\") || lower.includes("/rules/") || lower.includes("\\rules\\") || lower.startsWith("conf.d/") || lower.startsWith("conf.d\\") || lower.includes("/conf.d/") || lower.includes("\\conf.d\\");
        });
        const middlewares = /* @__PURE__ */ new Map();
        const services = /* @__PURE__ */ new Map();
        const routers = /* @__PURE__ */ new Map();
        let detectedRulesDir;
        for (const f of allFiles) {
          const lower = f.toLowerCase();
          if (lower.startsWith("rules/") || lower.startsWith("rules\\") || lower === "rules") {
            detectedRulesDir = "rules";
            break;
          }
          if (lower.includes("/rules/") || lower.includes("\\rules\\")) {
            const idx = lower.lastIndexOf("rules");
            detectedRulesDir = f.substring(0, idx + 5);
            break;
          }
        }
        if (!detectedRulesDir) {
          for (const f of allFiles) {
            const lower = f.toLowerCase();
            if (lower.startsWith("conf.d/") || lower.startsWith("conf.d\\")) {
              detectedRulesDir = "conf.d";
              break;
            }
          }
        }
        if (!detectedRulesDir) {
          detectedRulesDir = "rules";
        }
        const validTraefikFiles = [];
        for (const filePath of traefikFiles) {
          try {
            const content = await this.fs.readFile(filePath);
            if (!content) continue;
            const parsed = parseTraefikYaml(content, filePath);
            const hasEntities = parsed.middlewares.length > 0 || parsed.services.length > 0 || parsed.routers.length > 0;
            const lower = filePath.toLowerCase();
            const inRulesFolder = lower.startsWith("rules/") || lower.startsWith("rules\\") || lower.includes("/rules/") || lower.includes("\\rules\\") || lower.startsWith("conf.d/") || lower.startsWith("conf.d\\") || lower.includes("/conf.d/") || lower.includes("\\conf.d\\");
            if (hasEntities || inRulesFolder) {
              validTraefikFiles.push(filePath);
            }
            parsed.middlewares.forEach((m) => {
              middlewares.set(m.id, m);
            });
            parsed.services.forEach((s) => {
              services.set(s.id, s);
            });
            parsed.routers.forEach((r) => {
              routers.set(r.id, r);
            });
          } catch (err) {
            console.warn(`[TraefikIndexer] Failed to parse ${filePath}:`, err);
          }
        }
        const index = {
          middlewares,
          services,
          routers,
          files: validTraefikFiles,
          rulesDir: detectedRulesDir,
          issues: [],
          lastScanTime: Date.now()
        };
        index.issues = lintTraefikIndex(index);
        this.currentIndex = index;
        return index;
      } finally {
        this.isScanning = false;
      }
    }
    findDefinition(reference) {
      if (!this.currentIndex || !reference) return null;
      const cleanRef = reference.replace(/@file$/, "").trim();
      if (this.currentIndex.middlewares.has(cleanRef)) {
        const mw = this.currentIndex.middlewares.get(cleanRef);
        return { file: mw.file, line: mw.line, type: "middleware" };
      }
      if (this.currentIndex.middlewares.has(`mw-${cleanRef}`)) {
        const mw = this.currentIndex.middlewares.get(`mw-${cleanRef}`);
        return { file: mw.file, line: mw.line, type: "middleware" };
      }
      if (cleanRef.startsWith("mw-") && this.currentIndex.middlewares.has(cleanRef.substring(3))) {
        const mw = this.currentIndex.middlewares.get(cleanRef.substring(3));
        return { file: mw.file, line: mw.line, type: "middleware" };
      }
      if (this.currentIndex.services.has(cleanRef)) {
        const svc = this.currentIndex.services.get(cleanRef);
        return { file: svc.file, line: svc.line, type: "service" };
      }
      if (this.currentIndex.services.has(`${cleanRef}-svc`)) {
        const svc = this.currentIndex.services.get(`${cleanRef}-svc`);
        return { file: svc.file, line: svc.line, type: "service" };
      }
      if (this.currentIndex.services.has(`${cleanRef}-service`)) {
        const svc = this.currentIndex.services.get(`${cleanRef}-service`);
        return { file: svc.file, line: svc.line, type: "service" };
      }
      if (cleanRef.endsWith("-svc") && this.currentIndex.services.has(cleanRef.replace(/-svc$/, ""))) {
        const svc = this.currentIndex.services.get(cleanRef.replace(/-svc$/, ""));
        return { file: svc.file, line: svc.line, type: "service" };
      }
      if (cleanRef.endsWith("-service") && this.currentIndex.services.has(cleanRef.replace(/-service$/, ""))) {
        const svc = this.currentIndex.services.get(cleanRef.replace(/-service$/, ""));
        return { file: svc.file, line: svc.line, type: "service" };
      }
      return null;
    }
  };

  // src/monacoProvider.ts
  function getYamlContext(lines, lineNumber, column) {
    const lineIdx = lineNumber - 1;
    const currentLine = lines[lineIdx] || "";
    const textUntilPos = currentLine.substring(0, column - 1);
    const trimmedUntil = textUntilPos.trim();
    if (textUntilPos.includes("service:")) {
      return { contextType: "service", isListItem: false, prefix: textUntilPos.split("service:")[1] || "" };
    }
    if (textUntilPos.includes("certResolver:")) {
      return { contextType: "certResolver", isListItem: false, prefix: textUntilPos.split("certResolver:")[1] || "" };
    }
    const isListItem = /^\s*-\s*/.test(textUntilPos) || /^\s*-\S*/.test(textUntilPos);
    if (isListItem) {
      const currentIndent = textUntilPos.search(/-/);
      for (let i = lineIdx - 1; i >= 0 && i >= lineIdx - 30; i--) {
        const prevLine = lines[i];
        if (!prevLine || !prevLine.trim() || prevLine.trim().startsWith("#")) continue;
        const prevIndent = prevLine.search(/\S/);
        if (prevIndent < currentIndent) {
          const trimmedPrev = prevLine.trim();
          if (trimmedPrev.startsWith("middlewares:")) {
            return { contextType: "middlewares", isListItem: true, prefix: textUntilPos.replace(/^\s*-[\s"']*/, "") };
          }
          if (trimmedPrev.startsWith("entryPoints:")) {
            return { contextType: "entryPoints", isListItem: true, prefix: textUntilPos.replace(/^\s*-[\s"']*/, "") };
          }
          break;
        }
      }
      if (textUntilPos.includes("@") || textUntilPos.includes("mw-")) {
        return { contextType: "middlewares", isListItem: true, prefix: textUntilPos.replace(/^\s*-[\s"']*/, "") };
      }
    }
    if (trimmedUntil === "" || trimmedUntil === "http:" || trimmedUntil === "routers:") {
      return { contextType: "snippet", isListItem: false, prefix: "" };
    }
    return { contextType: "unknown", isListItem: false, prefix: "" };
  }
  function extractTokenAtPosition(lineContent, column) {
    if (!lineContent) return null;
    const colIdx = Math.max(0, Math.min(column - 1, lineContent.length - 1));
    let quoteStart = -1;
    let quoteEnd = -1;
    let quoteChar = "";
    for (let i = colIdx; i >= 0; i--) {
      if (lineContent[i] === '"' || lineContent[i] === "'") {
        quoteStart = i;
        quoteChar = lineContent[i];
        break;
      }
    }
    if (quoteStart !== -1) {
      for (let i = colIdx; i < lineContent.length; i++) {
        if (lineContent[i] === quoteChar && i !== quoteStart) {
          quoteEnd = i;
          break;
        }
      }
      if (quoteEnd === -1 && colIdx === quoteStart) {
        for (let i = quoteStart + 1; i < lineContent.length; i++) {
          if (lineContent[i] === quoteChar) {
            quoteEnd = i;
            break;
          }
        }
      }
    }
    if (quoteStart !== -1 && quoteEnd !== -1 && quoteStart < quoteEnd) {
      const rawToken2 = lineContent.substring(quoteStart + 1, quoteEnd).trim();
      if (rawToken2) {
        const cleanRef2 = rawToken2.replace(/@file$/, "").trim();
        return {
          rawToken: rawToken2,
          cleanRef: cleanRef2,
          startCol: quoteStart + 2,
          // 1-based start inside quote
          endCol: quoteEnd + 1
          // 1-based end inside quote
        };
      }
    }
    const isTokenChar = (c) => /[a-zA-Z0-9_\-\.\@]/.test(c);
    let targetIdx = colIdx;
    if (!isTokenChar(lineContent[targetIdx]) && targetIdx > 0 && isTokenChar(lineContent[targetIdx - 1])) {
      targetIdx = targetIdx - 1;
    }
    if (!isTokenChar(lineContent[targetIdx])) {
      return null;
    }
    let start = targetIdx;
    while (start > 0 && isTokenChar(lineContent[start - 1])) {
      start--;
    }
    let end = targetIdx;
    while (end < lineContent.length - 1 && isTokenChar(lineContent[end + 1])) {
      end++;
    }
    let rawToken = lineContent.substring(start, end + 1);
    if (rawToken.startsWith("-") && rawToken.length > 1) {
      rawToken = rawToken.substring(1);
      start++;
    }
    rawToken = rawToken.trim();
    if (!rawToken || rawToken === "-") return null;
    const cleanRef = rawToken.replace(/@file$/, "").trim();
    return {
      rawToken,
      cleanRef,
      startCol: start + 1,
      endCol: end + 2
    };
  }
  function computeCompletionRangeAndText(lineContent, column, value, kind) {
    const textUntilPos = lineContent.substring(0, column - 1);
    if (kind === "list") {
      const dashMatch = textUntilPos.match(/^(\s*-)(.*)$/);
      if (dashMatch) {
        const dashPart = dashMatch[1];
        const afterDash = dashMatch[2];
        const dashCol = dashPart.length;
        if (afterDash === "") {
          return {
            startCol: dashCol,
            endCol: column,
            insertText: `- ${value}`
          };
        }
        const spaceMatch = afterDash.match(/^(\s+)(.*)$/);
        if (spaceMatch) {
          const spaces = spaceMatch[1];
          const startWordCol = dashCol + spaces.length + 1;
          return {
            startCol: startWordCol,
            endCol: column,
            insertText: value
          };
        } else {
          return {
            startCol: dashCol,
            endCol: column,
            insertText: `- ${value}`
          };
        }
      }
      return {
        startCol: column,
        endCol: column,
        insertText: value
      };
    } else {
      const colonIdx = textUntilPos.lastIndexOf(":");
      if (colonIdx !== -1) {
        const colonCol = colonIdx + 1;
        const afterColon = textUntilPos.substring(colonIdx + 1);
        if (afterColon === "") {
          return {
            startCol: colonCol,
            endCol: column,
            insertText: `: ${value}`
          };
        }
        const spaceMatch = afterColon.match(/^(\s+)(.*)$/);
        if (spaceMatch) {
          const startValCol = colonCol + spaceMatch[1].length + 1;
          return {
            startCol: startValCol,
            endCol: column,
            insertText: value
          };
        } else {
          return {
            startCol: colonCol,
            endCol: column,
            insertText: `: ${value}`
          };
        }
      }
      return {
        startCol: column,
        endCol: column,
        insertText: value
      };
    }
  }
  function getTraefikSuggestions(lineContent, lineNumber, column, lines, index) {
    const suggestions = [];
    const ctx = getYamlContext(lines, lineNumber, column);
    if (ctx.contextType === "middlewares" && index) {
      index.middlewares.forEach((mw) => {
        const bareRange = computeCompletionRangeAndText(lineContent, column, mw.id, "list");
        suggestions.push({
          label: mw.id,
          kind: 18,
          // Reference
          insertText: bareRange.insertText,
          range: {
            startLineNumber: lineNumber,
            startColumn: bareRange.startCol,
            endLineNumber: lineNumber,
            endColumn: bareRange.endCol
          },
          detail: `Traefik Middleware (${mw.type})`,
          sortText: `0_${mw.id}`,
          documentation: {
            value: `**${mw.id}** (${mw.summary || mw.type})

Defined in [${mw.file}:${mw.line}](file://${mw.file}#L${mw.line})`
          }
        });
        const withFile = `${mw.id}@file`;
        const fileRange = computeCompletionRangeAndText(lineContent, column, withFile, "list");
        suggestions.push({
          label: withFile,
          kind: 18,
          // Reference
          insertText: fileRange.insertText,
          range: {
            startLineNumber: lineNumber,
            startColumn: fileRange.startCol,
            endLineNumber: lineNumber,
            endColumn: fileRange.endCol
          },
          detail: `Traefik Middleware (${mw.type}) \u2014 @file`,
          sortText: `1_${mw.id}`,
          documentation: {
            value: `**${withFile}** (${mw.summary || mw.type})

Defined in [${mw.file}:${mw.line}](file://${mw.file}#L${mw.line})`
          }
        });
      });
    }
    if (ctx.contextType === "service" && index) {
      index.services.forEach((svc) => {
        const svcRange = computeCompletionRangeAndText(lineContent, column, svc.id, "kv");
        suggestions.push({
          label: svc.id,
          kind: 7,
          // Class
          insertText: svcRange.insertText,
          range: {
            startLineNumber: lineNumber,
            startColumn: svcRange.startCol,
            endLineNumber: lineNumber,
            endColumn: svcRange.endCol
          },
          detail: `Traefik Service (${svc.type})`,
          sortText: `0_${svc.id}`,
          documentation: {
            value: `Target servers: ${svc.servers.join(", ") || "None"}

Defined in [${svc.file}:${svc.line}](file://${svc.file}#L${svc.line})`
          }
        });
      });
    }
    if (ctx.contextType === "entryPoints") {
      const defaultEps = ["websecure", "web", "traefik"];
      defaultEps.forEach((ep, idx) => {
        const epRange = computeCompletionRangeAndText(lineContent, column, ep, "list");
        suggestions.push({
          label: ep,
          kind: 12,
          // Value
          insertText: epRange.insertText,
          range: {
            startLineNumber: lineNumber,
            startColumn: epRange.startCol,
            endLineNumber: lineNumber,
            endColumn: epRange.endCol
          },
          detail: ep === "websecure" ? "HTTPS (Port 443)" : ep === "web" ? "HTTP (Port 80)" : "Internal Dashboard (8080)",
          sortText: `0_${idx}_${ep}`
        });
      });
    }
    if (ctx.contextType === "certResolver") {
      const defaultResolvers = ["cloudflare-resolver", "letsencrypt", "le-http", "le-dns"];
      defaultResolvers.forEach((cr, idx) => {
        const crRange = computeCompletionRangeAndText(lineContent, column, cr, "kv");
        suggestions.push({
          label: cr,
          kind: 12,
          // Value
          insertText: crRange.insertText,
          range: {
            startLineNumber: lineNumber,
            startColumn: crRange.startCol,
            endLineNumber: lineNumber,
            endColumn: crRange.endCol
          },
          detail: `CertResolver (${cr})`,
          sortText: `0_${idx}_${cr}`
        });
      });
    }
    if (ctx.contextType === "snippet") {
      suggestions.push({
        label: "traefik-router-service",
        kind: 15,
        // Snippet
        insertText: [
          "http:",
          "  routers:",
          "    ${1:app}-router:",
          '      rule: "Host(`${2:app.example.com}`)"',
          "      entryPoints:",
          "        - websecure",
          "      middlewares:",
          "        - ${3:local-only}",
          "      service: ${1:app}-service",
          "      tls:",
          "        certResolver: ${4:cloudflare-resolver}",
          "",
          "  services:",
          "    ${1:app}-service:",
          "      loadBalancer:",
          "        servers:",
          '          - url: "http://${5:127.0.0.1:8080}"',
          "        passHostHeader: true"
        ].join("\n"),
        insertTextRules: 4,
        // InsertAsSnippet
        detail: "Traefik Router + Service LoadBalancer (Clean YAML format)"
      });
      suggestions.push({
        label: "traefik-middleware-ipAllowList",
        kind: 15,
        // Snippet
        insertText: [
          "http:",
          "  middlewares:",
          "    ${1:local-only}:",
          "      ipAllowList:",
          "        sourceRange:",
          '          - "127.0.0.1/32"',
          '          - "${2:192.168.1.0/24}"'
        ].join("\n"),
        insertTextRules: 4,
        // InsertAsSnippet
        detail: "Traefik IP AllowList Middleware snippet"
      });
    }
    return suggestions;
  }
  function setupMonacoTraefik(monaco, indexer) {
    if (!monaco || !monaco.languages) return;
    monaco.languages.registerCompletionItemProvider("yaml", {
      triggerCharacters: ["-", "@", ":", " "],
      provideCompletionItems: (model, position) => {
        const lineContent = model.getLineContent(position.lineNumber);
        const lines = model.getLinesContent ? model.getLinesContent() : model.getValue().split(/\r?\n/);
        const index = indexer.getIndex();
        const suggestions = getTraefikSuggestions(lineContent, position.lineNumber, position.column, lines, index);
        return { suggestions };
      }
    });
    monaco.languages.registerDefinitionProvider("yaml", {
      provideDefinition: (model, position) => {
        const lineContent = model.getLineContent(position.lineNumber);
        const token = extractTokenAtPosition(lineContent, position.column);
        if (!token) return null;
        const def = indexer.findDefinition(token.cleanRef) || indexer.findDefinition(token.rawToken);
        if (!def) return null;
        return {
          uri: model.uri,
          range: {
            startLineNumber: def.line,
            startColumn: 1,
            endLineNumber: def.line,
            endColumn: 100
          }
        };
      }
    });
    monaco.languages.registerHoverProvider?.("yaml", {
      provideHover: (model, position) => {
        const lineContent = model.getLineContent(position.lineNumber);
        const token = extractTokenAtPosition(lineContent, position.column);
        if (!token) return null;
        const index = indexer.getIndex();
        if (!index) return null;
        const def = indexer.findDefinition(token.cleanRef) || indexer.findDefinition(token.rawToken);
        if (!def) return null;
        let mdText = "";
        if (def.type === "middleware") {
          const mw = index.middlewares.get(token.cleanRef) || index.middlewares.get(`mw-${token.cleanRef}`);
          mdText = `**Traefik Middleware**: \`${mw?.id || token.cleanRef}\`

- **Type**: \`${mw?.type || "unknown"}\`
- **Summary**: ${mw?.summary || "N/A"}
- **Defined in**: [${def.file}:${def.line}](file://${def.file}#L${def.line})

*(\u0414\u0432\u043E\u0439\u043D\u043E\u0439 \u043A\u043B\u0438\u043A, \u041F\u041A\u041C \u0438\u043B\u0438 Ctrl+\u041A\u043B\u0438\u043A \u0434\u043B\u044F \u043F\u0435\u0440\u0435\u0445\u043E\u0434\u0430)*`;
        } else if (def.type === "service") {
          const svc = index.services.get(token.cleanRef);
          mdText = `**Traefik Service**: \`${svc?.id || token.cleanRef}\`

- **Type**: \`${svc?.type || "loadBalancer"}\`
- **Servers**: ${svc?.servers.join(", ") || "N/A"}
- **Defined in**: [${def.file}:${def.line}](file://${def.file}#L${def.line})

*(\u0414\u0432\u043E\u0439\u043D\u043E\u0439 \u043A\u043B\u0438\u043A, \u041F\u041A\u041C \u0438\u043B\u0438 Ctrl+\u041A\u043B\u0438\u043A \u0434\u043B\u044F \u043F\u0435\u0440\u0435\u0445\u043E\u0434\u0430)*`;
        }
        return {
          contents: [{ value: mdText }]
        };
      }
    });
    monaco.languages.registerLinkProvider?.("yaml", {
      provideLinks: (model) => {
        const index = indexer.getIndex();
        if (!index) return { links: [] };
        const links = [];
        const lineCount = model.getLineCount();
        for (let i = 1; i <= lineCount; i++) {
          const line = model.getLineContent(i);
          if (!line.trim() || line.trim().startsWith("#")) continue;
          index.middlewares.forEach((mw) => {
            const searchTokens = [mw.id, `${mw.id}@file`];
            for (const s of searchTokens) {
              const idx = line.indexOf(s);
              if (idx !== -1) {
                links.push({
                  range: {
                    startLineNumber: i,
                    startColumn: idx + 1,
                    endLineNumber: i,
                    endColumn: idx + 1 + s.length
                  },
                  tooltip: `Ctrl+Click: \u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044E ${mw.id} (${mw.file}:${mw.line})`
                });
                break;
              }
            }
          });
          index.services.forEach((svc) => {
            const idx = line.indexOf(svc.id);
            if (idx !== -1 && (line.includes("service:") || line.includes("service :"))) {
              links.push({
                range: {
                  startLineNumber: i,
                  startColumn: idx + 1,
                  endLineNumber: i,
                  endColumn: idx + 1 + svc.id.length
                },
                tooltip: `Ctrl+Click: \u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044E ${svc.id} (${svc.file}:${svc.line})`
              });
            }
          });
        }
        return { links };
      }
    });
  }

  // src/outlineProvider.ts
  function createTraefikOutlineProvider() {
    return {
      language: "yaml",
      parse: (content, filename) => {
        const lower = (filename || "").toLowerCase().replace(/\\/g, "/");
        const baseName = lower.split("/").pop() || "";
        const isTraefikCandidate = lower.includes("traefik") || lower.includes("/rules/") || lower.startsWith("rules/") || baseName.startsWith("mw-") || baseName.startsWith("ser-") || content.includes("routers:") || content.includes("middlewares:") || content.includes("http:") && (content.includes("services:") || content.includes("middlewares:"));
        if (!isTraefikCandidate) {
          return [];
        }
        const parsed = parseTraefikYaml(content, filename);
        if (parsed.routers.length === 0 && parsed.services.length === 0 && parsed.middlewares.length === 0) {
          return [];
        }
        const rootNodes = [];
        if (parsed.routers.length > 0) {
          const title = `\u{1F310} \u041C\u0430\u0440\u0448\u0440\u0443\u0442\u0438\u0437\u0430\u0442\u043E\u0440\u044B (${parsed.routers.length})`;
          const line = parsed.sectionLines?.routers || (parsed.routers[0].line > 1 ? parsed.routers[0].line - 1 : 1);
          rootNodes.push({
            id: "section_routers",
            label: title,
            name: title,
            type: "section",
            kind: "section",
            line,
            children: parsed.routers.map((r) => {
              const rTitle = `${r.id} ${r.host ? `[${r.host}]` : ""}`.trim();
              const childNodes = [];
              for (const mw of r.middlewares) {
                const mwTitle = `\u{1F6E1}\uFE0F ${mw}`;
                childNodes.push({
                  id: `router_${r.id}_mw_${mw}`,
                  label: mwTitle,
                  name: mwTitle,
                  type: "middleware",
                  kind: "middleware",
                  line: r.middlewareLines?.[mw] || r.line
                });
              }
              if (r.service) {
                const svcTitle = `\u2699\uFE0F ${r.service}`;
                childNodes.push({
                  id: `router_${r.id}_svc_${r.service}`,
                  label: svcTitle,
                  name: svcTitle,
                  type: "service",
                  kind: "service",
                  line: r.serviceLine || r.line
                });
              }
              return {
                id: `router_${r.id}`,
                label: rTitle,
                name: rTitle,
                type: "router",
                kind: "router",
                line: r.line,
                children: childNodes.length > 0 ? childNodes : void 0
              };
            })
          });
        }
        if (parsed.services.length > 0) {
          const title = `\u2699\uFE0F \u0421\u0435\u0440\u0432\u0438\u0441\u044B (${parsed.services.length})`;
          const line = parsed.sectionLines?.services || (parsed.services[0].line > 1 ? parsed.services[0].line - 1 : 1);
          rootNodes.push({
            id: "section_services",
            label: title,
            name: title,
            type: "section",
            kind: "section",
            line,
            children: parsed.services.map((s) => {
              const serverInfo = s.servers.length > 0 ? `(${s.servers[0]})` : "";
              const sTitle = `${s.id} ${serverInfo}`.trim();
              return {
                id: `svc_${s.id}`,
                label: sTitle,
                name: sTitle,
                type: "service",
                kind: "service",
                line: s.line
              };
            })
          });
        }
        if (parsed.middlewares.length > 0) {
          const title = `\u{1F6E1}\uFE0F Middlewares (${parsed.middlewares.length})`;
          const line = parsed.sectionLines?.middlewares || (parsed.middlewares[0].line > 1 ? parsed.middlewares[0].line - 1 : 1);
          rootNodes.push({
            id: "section_middlewares",
            label: title,
            name: title,
            type: "section",
            kind: "section",
            line,
            children: parsed.middlewares.map((m) => {
              const desc = m.summary || m.type;
              const mTitle = `${m.id} [${desc}]`;
              return {
                id: `mw_${m.id}`,
                label: mTitle,
                name: mTitle,
                type: "middleware",
                kind: "middleware",
                line: m.line
              };
            })
          });
        }
        return rootNodes;
      }
    };
  }

  // src/doctor.ts
  function runLocalAudit(index) {
    const issues = index.issues || [];
    const errorsCount = issues.filter((i) => i.severity === "error").length;
    const warningsCount = issues.filter((i) => i.severity === "warning").length;
    let overallStatus = "healthy";
    if (errorsCount > 0) {
      overallStatus = "error";
    } else if (warningsCount > 0) {
      overallStatus = "warning";
    }
    const localSummary = {
      routersCount: index.routers?.size || 0,
      servicesCount: index.services?.size || 0,
      middlewaresCount: index.middlewares?.size || 0,
      issuesCount: issues.length,
      errorsCount,
      warningsCount
    };
    return {
      timestamp: Date.now(),
      overallStatus,
      localSummary,
      issues,
      apiStatus: {
        checked: false,
        reachable: false,
        url: "",
        runtimeErrors: [],
        unloadedConfigs: []
      }
    };
  }
  async function queryTraefikApi(apiUrl, index, fetchFn = fetch) {
    const cleanUrl = (apiUrl || "http://localhost:8080").trim().replace(/\/+$/, "");
    const result = {
      checked: true,
      reachable: false,
      url: cleanUrl,
      runtimeErrors: [],
      unloadedConfigs: []
    };
    try {
      const verRes = await fetchFn(`${cleanUrl}/api/version`);
      if (!verRes.ok) {
        result.error = `HTTP ${verRes.status} ${verRes.statusText} from /api/version`;
        return result;
      }
      const verData = await verRes.json();
      result.reachable = true;
      result.version = verData.version ? `${verData.version}${verData.codename ? ` (${verData.codename})` : ""}` : "Unknown";
      result.startDate = verData.startDate;
      try {
        const ovRes = await fetchFn(`${cleanUrl}/api/overview`);
        if (ovRes.ok) {
          const ovData = await ovRes.json();
          if (ovData?.http) {
            result.overview = {
              httpRoutersTotal: ovData.http.routers?.total ?? 0,
              httpServicesTotal: ovData.http.services?.total ?? 0,
              httpMiddlewaresTotal: ovData.http.middlewares?.total ?? 0
            };
          }
        }
      } catch (_) {
      }
      try {
        const rawRes = await fetchFn(`${cleanUrl}/api/rawdata`);
        if (rawRes.ok) {
          const rawData = await rawRes.json();
          const routers = rawData?.routers || {};
          const services = rawData?.services || {};
          const middlewares = rawData?.middlewares || {};
          for (const [rName, rObj] of Object.entries(routers)) {
            if (rObj?.status === "disabled" || rObj?.err && rObj.err.length > 0) {
              result.runtimeErrors.push({
                type: "router",
                name: rName,
                status: rObj.status || "unknown",
                errors: Array.isArray(rObj.err) ? rObj.err : rObj.err ? [String(rObj.err)] : void 0
              });
            }
          }
          for (const [sName, sObj] of Object.entries(services)) {
            if (sObj?.status === "disabled" || sObj?.err && sObj.err.length > 0) {
              result.runtimeErrors.push({
                type: "service",
                name: sName,
                status: sObj.status || "unknown",
                errors: Array.isArray(sObj.err) ? sObj.err : sObj.err ? [String(sObj.err)] : void 0
              });
            }
          }
          for (const [mName, mObj] of Object.entries(middlewares)) {
            if (mObj?.status === "disabled" || mObj?.err && mObj.err.length > 0) {
              result.runtimeErrors.push({
                type: "middleware",
                name: mName,
                status: mObj.status || "unknown",
                errors: Array.isArray(mObj.err) ? mObj.err : mObj.err ? [String(mObj.err)] : void 0
              });
            }
          }
          if (index && index.routers) {
            const runtimeRouterKeys = new Set(Object.keys(routers));
            for (const [rId] of index.routers.entries()) {
              const matches = Array.from(runtimeRouterKeys).some(
                (k) => k === rId || k === `${rId}@file` || k.startsWith(`${rId}@`)
              );
              if (!matches) {
                result.unloadedConfigs.push(`\u0420\u043E\u0443\u0442\u0435\u0440 '${rId}' \u043D\u0430\u0439\u0434\u0435\u043D \u0432 \u0444\u0430\u0439\u043B\u0430\u0445, \u043D\u043E \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D \u0432 Traefik`);
              }
            }
          }
        }
      } catch (_) {
      }
      return result;
    } catch (err) {
      result.reachable = false;
      result.error = err?.message || String(err);
      return result;
    }
  }
  async function executeRemoteDoctorSsh(hostId, command = "docker exec traefik traefik healthcheck || traefik version", fetchFn = fetch) {
    const result = {
      checked: true,
      available: false,
      hostId,
      command
    };
    try {
      const res = await fetchFn("/api/ssh/exec", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ConfigStudio-Web": "1"
        },
        body: JSON.stringify({
          hostId,
          cmd: command,
          timeoutSec: 10
        })
      });
      if (res.status === 404 || res.status === 501) {
        result.error = "\u042D\u043D\u0434\u043F\u043E\u0438\u043D\u0442 \u044F\u0434\u0440\u0430 POST /api/ssh/exec \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u0442\u0435\u043A\u0443\u0449\u0435\u0439 \u0432\u0435\u0440\u0441\u0438\u0435\u0439 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 (\u0437\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D \u0432 \u0441\u043F\u0440\u0438\u043D\u0442\u0435 v2.3 \u044F\u0434\u0440\u0430).";
        return result;
      }
      if (!res.ok) {
        const errText = await res.text();
        result.error = `HTTP ${res.status}: ${errText}`;
        return result;
      }
      const data = await res.json();
      result.available = true;
      result.exitCode = data.exitCode;
      result.stdout = data.stdout;
      result.stderr = data.stderr;
      result.durationMs = data.durationMs;
      return result;
    } catch (err) {
      result.error = err?.message || String(err);
      return result;
    }
  }

  // src/ui/doctorModal.ts
  function openDoctorModal(indexer, onOpenMatrix) {
    const existing = document.getElementById("cs-traefik-doctor-overlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "cs-traefik-doctor-overlay";
    overlay.className = "cs-traefik-overlay";
    const modal = document.createElement("div");
    modal.className = "cs-traefik-modal cs-traefik-modal-xl";
    const defaultApiUrl = localStorage.getItem("cs_traefik_api_url") || "http://localhost:8080";
    let report = runLocalAudit(indexer.getIndex());
    let isCheckingApi = false;
    let activeDiagMode = "api";
    let remoteSshStatus = {
      checked: false,
      available: false,
      hostId: localStorage.getItem("cs_traefik_ssh_host") || "localhost",
      command: localStorage.getItem("cs_traefik_ssh_cmd") || "docker exec traefik traefik healthcheck"
    };
    let isExecutingSsh = false;
    function render() {
      const cs = window.ConfigStudio;
      const { localSummary, issues, apiStatus, overallStatus } = report;
      let overallBadgeClass = "cs-status-healthy";
      let overallBadgeText = "HEALTHY: \u0412\u0441\u0435 \u0441\u0441\u044B\u043B\u043A\u0438 \u0438 \u043F\u0440\u0430\u0432\u0438\u043B\u0430 \u0432 \u043D\u043E\u0440\u043C\u0435";
      if (overallStatus === "error" || apiStatus.runtimeErrors.length > 0) {
        overallBadgeClass = "cs-status-error";
        overallBadgeText = "ISSUES FOUND: \u041E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u044B \u043A\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u043E\u0448\u0438\u0431\u043A\u0438";
      } else if (overallStatus === "warning" || apiStatus.checked && !apiStatus.reachable) {
        overallBadgeClass = "cs-status-warning";
        overallBadgeText = "WARNING: \u041E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u044B \u043F\u0440\u0435\u0434\u0443\u043F\u0440\u0435\u0436\u0434\u0435\u043D\u0438\u044F";
      }
      modal.innerHTML = `
      <div class="cs-traefik-header">
        <div class="cs-traefik-header-left">
          <div class="cs-traefik-icon-badge" style="background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.35); color: #10b981;">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
          </div>
          <div>
            <h2 class="cs-traefik-title">Traefik Doctor & Diagnostics</h2>
            <div class="cs-traefik-subtitle">\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0430\u0443\u0434\u0438\u0442 \u0446\u0435\u043B\u043E\u0441\u0442\u043D\u043E\u0441\u0442\u0438 \u043A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u0438 \u0438 \u0441\u0432\u0435\u0440\u043A\u0430 \u0441 Traefik REST API</div>
          </div>
        </div>
        <div class="cs-traefik-header-actions">
          <span class="cs-doctor-badge ${overallBadgeClass}">${overallBadgeText}</span>
          <button id="cs-doctor-rescan-btn" class="cs-traefik-btn cs-traefik-btn-secondary" title="\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0430\u0443\u0434\u0438\u0442">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            \u041F\u0435\u0440\u0435\u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u0442\u044C
          </button>
          <button id="cs-doctor-close-btn" class="cs-traefik-btn-icon" title="\u0417\u0430\u043A\u0440\u044B\u0442\u044C">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Metrics Row -->
      <div class="cs-doctor-metrics-grid">
        <div class="cs-doctor-metric-card">
          <div class="cs-metric-num">${localSummary.routersCount}</div>
          <div class="cs-metric-label">\u041C\u0430\u0440\u0448\u0440\u0443\u0442\u0438\u0437\u0430\u0442\u043E\u0440\u044B (Routers)</div>
        </div>
        <div class="cs-doctor-metric-card">
          <div class="cs-metric-num">${localSummary.servicesCount}</div>
          <div class="cs-metric-label">\u0421\u0435\u0440\u0432\u0438\u0441\u044B \u0431\u044D\u043A\u0435\u043D\u0434\u0430 (Services)</div>
        </div>
        <div class="cs-doctor-metric-card">
          <div class="cs-metric-num">${localSummary.middlewaresCount}</div>
          <div class="cs-metric-label">\u041F\u0440\u0430\u0432\u0438\u043B\u0430 (Middlewares)</div>
        </div>
        <div class="cs-doctor-metric-card ${localSummary.errorsCount > 0 ? "cs-metric-error" : localSummary.warningsCount > 0 ? "cs-metric-warn" : "cs-metric-ok"}">
          <div class="cs-metric-num">${localSummary.issuesCount}</div>
          <div class="cs-metric-label">\u0417\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u0439 \u043B\u0438\u043D\u0442\u0435\u0440\u0430 (${localSummary.errorsCount} \u043E\u0448., ${localSummary.warningsCount} \u043F\u0440\u0435\u0434.)</div>
        </div>
      </div>

      <!-- Main Scrollable Body -->
      <div class="cs-doctor-body">
        <!-- Section 1: Local Rules Audit -->
        <div class="cs-doctor-section">
          <div class="cs-section-header">
            <div class="cs-section-title">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
              \u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0430\u0443\u0434\u0438\u0442 \u0446\u0435\u043B\u043E\u0441\u0442\u043D\u043E\u0441\u0442\u0438 \u0441\u0441\u044B\u043B\u043E\u043A (Local Linter)
            </div>
            <span class="cs-section-badge">${issues.length} \u043D\u0430\u0439\u0434\u0435\u043D\u043E</span>
          </div>

          ${issues.length === 0 ? `
            <div class="cs-doctor-clean-state">
              <div class="cs-clean-icon">
                <svg width="32" height="32" fill="none" stroke="#10b981" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <div class="cs-clean-title">\u041E\u0448\u0438\u0431\u043E\u043A \u0446\u0435\u043B\u043E\u0441\u0442\u043D\u043E\u0441\u0442\u0438 \u043D\u0435 \u043E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u043E</div>
              <div class="cs-clean-desc">\u0412\u0441\u0435 \u0441\u0441\u044B\u043B\u043A\u0438 \u043D\u0430 middlewares (@file) \u0438 \u0431\u044D\u043A\u0435\u043D\u0434-\u0441\u0435\u0440\u0432\u0438\u0441\u044B \u0432\u0430\u043B\u0438\u0434\u043D\u044B. \u041A\u043E\u043B\u043B\u0438\u0437\u0438\u0439 Host() \u043D\u0430 \u043E\u0434\u0438\u043D\u0430\u043A\u043E\u0432\u044B\u0445 EntryPoints \u0431\u0435\u0437 \u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E.</div>
            </div>
          ` : `
            <div class="cs-doctor-issues-table-wrap">
              <table class="cs-traefik-table">
                <thead>
                  <tr>
                    <th style="width: 110px;">\u0421\u0442\u0430\u0442\u0443\u0441</th>
                    <th style="width: 170px;">\u041A\u043E\u0434 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438</th>
                    <th>\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u044B</th>
                    <th style="width: 220px;">\u0424\u0430\u0439\u043B \u0438 \u0441\u0442\u0440\u043E\u043A\u0430</th>
                    <th style="width: 80px; text-align: center;">\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435</th>
                  </tr>
                </thead>
                <tbody>
                  ${issues.map(
        (iss) => `
                    <tr>
                      <td>
                        <span class="cs-traefik-issue-badge ${iss.severity === "error" ? "cs-issue-err" : "cs-issue-warn"}">
                          ${iss.severity.toUpperCase()}
                        </span>
                      </td>
                      <td><code>${iss.code}</code></td>
                      <td>${escapeHtml(iss.message)}</td>
                      <td><code class="cs-traefik-file-link">${escapeHtml(iss.file)}:${iss.line}</code></td>
                      <td style="text-align: center;">
                        <button class="cs-traefik-jump-btn" data-jump-file="${escapeHtml(iss.file)}" data-jump-line="${iss.line}">
                          \u041F\u0435\u0440\u0435\u0439\u0442\u0438
                        </button>
                      </td>
                    </tr>
                  `
      ).join("")}
                </tbody>
              </table>
            </div>
          `}
        </div>

        <!-- Section 2: Runtime Diagnostics (REST API & Remote SSH Exec) -->
        <div class="cs-doctor-section" style="margin-top: 20px;">
          <div class="cs-section-header">
            <div class="cs-section-title">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
              \u0414\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0430 \u0440\u0430\u043D\u0442\u0430\u0439\u043C\u0430 Traefik
            </div>
            <div class="cs-traefik-filter-tabs">
              <button id="cs-diag-tab-api" class="cs-traefik-filter-tab ${activeDiagMode === "api" ? "active" : ""}">
                REST API (8080)
              </button>
              <button id="cs-diag-tab-ssh" class="cs-traefik-filter-tab ${activeDiagMode === "ssh" ? "active" : ""}">
                Remote SSH Exec
              </button>
            </div>
          </div>

          ${activeDiagMode === "api" ? `
          <div style="display: flex; justify-content: flex-end; margin-bottom: 10px;">
            <div class="cs-api-input-wrap">
              <input type="text" id="cs-doctor-api-url" class="cs-api-input" value="${escapeHtml(
        apiStatus.url || defaultApiUrl
      )}" placeholder="http://localhost:8080" />
              <button id="cs-doctor-test-api-btn" class="cs-traefik-btn cs-traefik-btn-primary" ${isCheckingApi ? "disabled" : ""}>
                ${isCheckingApi ? "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430..." : "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C API"}
              </button>
            </div>
          </div>

          <div class="cs-api-results-box">
            ${!apiStatus.checked ? `
              <div class="cs-doctor-hint-box">
                <svg width="18" height="18" fill="none" stroke="#38bdf8" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span>\u041D\u0430\u0436\u043C\u0438\u0442\u0435 <strong>\xAB\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C API\xBB</strong> \u0434\u043B\u044F \u043F\u0440\u044F\u043C\u043E\u0433\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0430 \u043A \u0440\u0430\u043D\u0442\u0430\u0439\u043C\u0443 Traefik (\u044D\u043D\u0434\u043F\u043E\u0438\u043D\u0442\u044B <code>/api/version</code>, <code>/api/overview</code>, <code>/api/rawdata</code>).</span>
              </div>
            ` : apiStatus.reachable ? `
              <div class="cs-api-details-grid">
                <div class="cs-api-detail-item">
                  <div class="cs-detail-label">\u0412\u0435\u0440\u0441\u0438\u044F Traefik</div>
                  <div class="cs-detail-val"><code>${escapeHtml(apiStatus.version || "Unknown")}</code></div>
                </div>
                <div class="cs-api-detail-item">
                  <div class="cs-detail-label">\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0445 Routers (HTTP)</div>
                  <div class="cs-detail-val">${apiStatus.overview?.httpRoutersTotal ?? "\u043D/\u0434"}</div>
                </div>
                <div class="cs-api-detail-item">
                  <div class="cs-detail-label">\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0445 Services (HTTP)</div>
                  <div class="cs-detail-val">${apiStatus.overview?.httpServicesTotal ?? "\u043D/\u0434"}</div>
                </div>
                <div class="cs-api-detail-item">
                  <div class="cs-detail-label">\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0445 Middlewares (HTTP)</div>
                  <div class="cs-detail-val">${apiStatus.overview?.httpMiddlewaresTotal ?? "\u043D/\u0434"}</div>
                </div>
              </div>

              ${apiStatus.runtimeErrors.length > 0 ? `
                <div class="cs-runtime-errors-alert">
                  <div class="cs-alert-title">\u041E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u044B \u043E\u0448\u0438\u0431\u043A\u0438 \u0440\u0430\u043D\u0442\u0430\u0439\u043C\u0430 Traefik (${apiStatus.runtimeErrors.length}):</div>
                  <ul class="cs-alert-list">
                    ${apiStatus.runtimeErrors.map(
        (err) => `
                      <li>
                        <strong>[${err.type.toUpperCase()}] ${escapeHtml(err.name)}</strong> (\u0441\u0442\u0430\u0442\u0443\u0441: ${escapeHtml(
          err.status
        )}):
                        ${escapeHtml(err.errors?.join("; ") || "\u041E\u0442\u043A\u043B\u044E\u0447\u0435\u043D \u0438\u043B\u0438 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u043E\u0448\u0438\u0431\u043A\u0443 \u043A\u043E\u043C\u043F\u0438\u043B\u044F\u0446\u0438\u0438")}
                      </li>
                    `
      ).join("")}
                  </ul>
                </div>
              ` : `
                <div class="cs-runtime-ok-alert">
                  \u0412\u0441\u0435 \u043A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u0438 \u0432 \u043F\u0430\u043C\u044F\u0442\u0438 Traefik \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0442 \u0448\u0442\u0430\u0442\u043D\u043E (\u0441\u0442\u0430\u0442\u0443\u0441 enabled, 0 \u043E\u0448\u0438\u0431\u043E\u043A \u043A\u043E\u043C\u043F\u0438\u043B\u044F\u0446\u0438\u0438).
                </div>
              `}

              ${apiStatus.unloadedConfigs.length > 0 ? `
                <div class="cs-runtime-warn-alert">
                  <div class="cs-alert-title">\u041D\u0435\u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u044F \u0444\u0430\u0439\u043B\u043E\u0432 \u0438 \u0440\u0430\u043D\u0442\u0430\u0439\u043C\u0430 (${apiStatus.unloadedConfigs.length}):</div>
                  <ul class="cs-alert-list">
                    ${apiStatus.unloadedConfigs.map((u) => `<li>${escapeHtml(u)}</li>`).join("")}
                  </ul>
                </div>
              ` : ""}
            ` : `
              <div class="cs-api-error-card">
                <div class="cs-error-icon">
                  <svg width="24" height="24" fill="none" stroke="#ef4444" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                </div>
                <div>
                  <div class="cs-error-title">Traefik API \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u043F\u043E \u0430\u0434\u0440\u0435\u0441\u0443: <code>${escapeHtml(apiStatus.url)}</code></div>
                  <div class="cs-error-desc">${escapeHtml(apiStatus.error || "Connection failed")}</div>
                  <div class="cs-error-hint">
                    \u0423\u0431\u0435\u0434\u0438\u0442\u0435\u0441\u044C, \u0447\u0442\u043E Traefik \u0437\u0430\u043F\u0443\u0449\u0435\u043D \u0438 \u0432 \u0435\u0433\u043E \u043A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u0438 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D REST API:<br/>
                    <code>api: { insecure: true, dashboard: true }</code> (\u043F\u043E\u0440\u0442 8080 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E).
                  </div>
                </div>
              </div>
            `}
          </div>
          ` : `
          <div class="cs-ssh-exec-box">
            <div class="cs-ssh-inputs-row" style="display: flex; gap: 8px; margin-bottom: 12px;">
              <input type="text" id="cs-doctor-ssh-host" class="cs-api-input" style="width: 170px;" value="${escapeHtml(
        remoteSshStatus.hostId || "localhost"
      )}" placeholder="Host ID / localhost" title="ID \u0443\u0437\u043B\u0430 \u0438\u0437 \u0444\u043B\u043E\u0442\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u043E\u0432 \u0438\u043B\u0438 localhost" />
              <input type="text" id="cs-doctor-ssh-cmd" class="cs-api-input" style="flex: 1;" value="${escapeHtml(
        remoteSshStatus.command || "docker exec traefik traefik healthcheck"
      )}" placeholder="docker exec traefik traefik healthcheck" />
              <button id="cs-doctor-run-ssh-btn" class="cs-traefik-btn cs-traefik-btn-primary" ${isExecutingSsh ? "disabled" : ""}>
                ${isExecutingSsh ? "\u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435..." : "\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C SSH Exec"}
              </button>
            </div>

            ${!remoteSshStatus.checked ? `
              <div class="cs-doctor-hint-box">
                <svg width="18" height="18" fill="none" stroke="#38bdf8" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span>\u0423\u0434\u0430\u043B\u0435\u043D\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u0438 \u0438 \u0437\u0434\u043E\u0440\u043E\u0432\u044C\u044F \u043A\u043E\u043D\u0442\u0435\u0439\u043D\u0435\u0440\u0430 Traefik \u0447\u0435\u0440\u0435\u0437 \u043D\u0435\u0438\u043D\u0442\u0435\u0440\u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0439 \u044D\u043D\u0434\u043F\u043E\u0438\u043D\u0442 \u044F\u0434\u0440\u0430 <code>POST /api/ssh/exec</code>. \u0412\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442 <code>traefik healthcheck</code> \u0438\u043B\u0438 <code>traefik version</code> \u043D\u0430 \u0443\u0434\u0430\u043B\u0435\u043D\u043D\u043E\u043C \u0441\u0435\u0440\u0432\u0435\u0440\u0435.</span>
              </div>
            ` : remoteSshStatus.available ? `
              <div class="cs-runtime-ok-alert" style="margin-bottom: 8px;">
                \u041A\u043E\u043C\u0430\u043D\u0434\u0430 \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0430 \u043D\u0430 \u0443\u0437\u043B\u0435 <strong>${escapeHtml(
        remoteSshStatus.hostId || ""
      )}</strong> (\u041A\u043E\u0434 \u0432\u043E\u0437\u0432\u0440\u0430\u0442\u0430: ${remoteSshStatus.exitCode}, \u0412\u0440\u0435\u043C\u044F: ${remoteSshStatus.durationMs}ms)
              </div>
              <pre class="cs-preview-code" style="max-height: 200px; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(51, 65, 85, 0.6); border-radius: 6px;"><code>${escapeHtml(
        remoteSshStatus.stdout || remoteSshStatus.stderr || "No output"
      )}</code></pre>
            ` : `
              <div class="cs-api-error-card">
                <div class="cs-error-icon">
                  <svg width="24" height="24" fill="none" stroke="#f59e0b" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                </div>
                <div>
                  <div class="cs-error-title" style="color: #fbbf24;">\u042D\u043D\u0434\u043F\u043E\u0438\u043D\u0442 POST /api/ssh/exec \u043F\u043E\u043A\u0430 \u043D\u0435 \u0430\u043A\u0442\u0438\u0432\u0435\u043D \u0432 \u044F\u0434\u0440\u0435</div>
                  <div class="cs-error-desc">${escapeHtml(remoteSshStatus.error || "")}</div>
                  <div class="cs-error-hint">
                    \u041A\u043B\u0438\u0435\u043D\u0442\u0441\u043A\u0438\u0439 \u0432\u044B\u0437\u043E\u0432 \u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u0440\u0435\u0430\u043B\u0438\u0437\u043E\u0432\u0430\u043D \u0432 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u0438 Traefik. \u041A\u0430\u043A \u0442\u043E\u043B\u044C\u043A\u043E \u0431\u044D\u043A\u0435\u043D\u0434 \u044F\u0434\u0440\u0430 Config Studio \u0434\u043E\u0431\u0430\u0432\u0438\u0442 \u0441\u0435\u0440\u0432\u0438\u0441 <code>ExecuteCommand</code> (\u0437\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D \u0432 \u0441\u043F\u0440\u0438\u043D\u0442\u0435 \u044F\u0434\u0440\u0430 v2.3), \u0443\u0434\u0430\u043B\u0435\u043D\u043D\u044B\u0439 SSH-\u0430\u0443\u0434\u0438\u0442 \u0437\u0430\u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438.
                  </div>
                </div>
              </div>
            `}
          </div>
          `}
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="cs-traefik-footer">
        <button id="cs-doctor-matrix-btn" class="cs-traefik-btn cs-traefik-btn-secondary">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
          </svg>
          \u041C\u0430\u0442\u0440\u0438\u0446\u0430 \u043F\u0440\u0430\u0432\u0438\u043B
        </button>
        <button id="cs-doctor-dashboard-btn" class="cs-traefik-btn cs-traefik-btn-secondary">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
          \u041E\u0442\u043A\u0440\u044B\u0442\u044C Dashboard
        </button>
        <button id="cs-doctor-footer-close-btn" class="cs-traefik-btn cs-traefik-btn-primary">
          \u0417\u0430\u043A\u0440\u044B\u0442\u044C
        </button>
      </div>
    `;
      bindEvents();
    }
    function bindEvents() {
      const cs = window.ConfigStudio;
      const close = () => {
        document.removeEventListener("keydown", handleKey);
        overlay.remove();
      };
      modal.querySelector("#cs-doctor-close-btn")?.addEventListener("click", close);
      modal.querySelector("#cs-doctor-footer-close-btn")?.addEventListener("click", close);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
      modal.querySelector("#cs-diag-tab-api")?.addEventListener("click", () => {
        if (activeDiagMode !== "api") {
          activeDiagMode = "api";
          render();
        }
      });
      modal.querySelector("#cs-diag-tab-ssh")?.addEventListener("click", () => {
        if (activeDiagMode !== "ssh") {
          activeDiagMode = "ssh";
          render();
        }
      });
      modal.querySelector("#cs-doctor-run-ssh-btn")?.addEventListener("click", async () => {
        const hostInput = modal.querySelector("#cs-doctor-ssh-host");
        const cmdInput = modal.querySelector("#cs-doctor-ssh-cmd");
        const hostId = hostInput?.value.trim() || "localhost";
        const cmd = cmdInput?.value.trim() || "docker exec traefik traefik healthcheck";
        localStorage.setItem("cs_traefik_ssh_host", hostId);
        localStorage.setItem("cs_traefik_ssh_cmd", cmd);
        isExecutingSsh = true;
        render();
        try {
          const res = await executeRemoteDoctorSsh(hostId, cmd);
          remoteSshStatus = res;
        } catch (err) {
          remoteSshStatus = {
            checked: true,
            available: false,
            hostId,
            command: cmd,
            error: err?.message || String(err)
          };
        } finally {
          isExecutingSsh = false;
          render();
        }
      });
      modal.querySelector("#cs-doctor-rescan-btn")?.addEventListener("click", async () => {
        await indexer.scanWorkspace();
        report = runLocalAudit(indexer.getIndex());
        render();
      });
      modal.querySelector("#cs-doctor-test-api-btn")?.addEventListener("click", async () => {
        const input = modal.querySelector("#cs-doctor-api-url");
        const url = input?.value.trim() || "http://localhost:8080";
        localStorage.setItem("cs_traefik_api_url", url);
        isCheckingApi = true;
        render();
        try {
          const apiStatus = await queryTraefikApi(url, indexer.getIndex());
          report.apiStatus = apiStatus;
        } catch (err) {
          report.apiStatus = {
            checked: true,
            reachable: false,
            url,
            runtimeErrors: [],
            unloadedConfigs: [],
            error: err?.message || String(err)
          };
        } finally {
          isCheckingApi = false;
          render();
        }
      });
      modal.querySelector("#cs-doctor-matrix-btn")?.addEventListener("click", () => {
        close();
        if (onOpenMatrix) onOpenMatrix();
      });
      modal.querySelector("#cs-doctor-dashboard-btn")?.addEventListener("click", () => {
        const input = modal.querySelector("#cs-doctor-api-url");
        const url = (input?.value.trim() || defaultApiUrl).replace(/\/+$/, "");
        const dashboardUrl = `${url}/dashboard/`;
        window.open(dashboardUrl, "_blank");
      });
      const jumpBtns = modal.querySelectorAll("[data-jump-file]");
      jumpBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const filePath = btn.getAttribute("data-jump-file");
          const line = Number(btn.getAttribute("data-jump-line")) || 1;
          if (filePath && cs?.openFile) {
            cs.openFile(filePath, { line, highlight: true });
            close();
          }
        });
      });
    }
    function handleKey(e) {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", handleKey);
        overlay.remove();
      }
    }
    document.addEventListener("keydown", handleKey);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    render();
  }
  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // src/ui/matrixModal.ts
  function openMatrixModal(indexer, onOpenWizard, onOpenDoctor) {
    const existing = document.getElementById("cs-traefik-matrix-overlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "cs-traefik-matrix-overlay";
    overlay.className = "cs-traefik-overlay";
    const modal = document.createElement("div");
    modal.className = "cs-traefik-modal cs-traefik-modal-xl";
    indexer.scanWorkspace().then(() => {
      if (document.body.contains(overlay)) {
        renderContent();
      }
    });
    function renderContent() {
      const index = indexer.getIndex();
      if (!index) {
        modal.innerHTML = `
        <div class="cs-traefik-loading">
          <div class="cs-traefik-spinner"></div>
          <div>\u0421\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 Traefik \u043A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u0439...</div>
        </div>
      `;
        return;
      }
      const routers = Array.from(index.routers.values());
      const middlewares = Array.from(index.middlewares.values());
      const services = Array.from(index.services.values());
      const issues = index.issues || [];
      const errorCount = issues.filter((i) => i.severity === "error").length;
      const warnCount = issues.filter((i) => i.severity === "warning").length;
      modal.innerHTML = `
      <div class="cs-traefik-header">
        <div class="cs-traefik-header-left">
          <div class="cs-traefik-icon-badge">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
            </svg>
          </div>
          <div>
            <h2 class="cs-traefik-title">\u041C\u0430\u0442\u0440\u0438\u0446\u0430 \u043F\u0440\u0430\u0432\u0438\u043B Traefik</h2>
            <div class="cs-traefik-subtitle">Multi-File Directory Provider \u2022 ${index.files.length} \u0444\u0430\u0439\u043B\u043E\u0432 \u043A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u0438</div>
          </div>
        </div>
        <div class="cs-traefik-header-actions">
          <button id="cs-traefik-btn-doctor" class="cs-traefik-btn cs-traefik-btn-secondary" title="\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0443 Traefik Doctor">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
            Traefik Doctor
          </button>
          <button id="cs-traefik-btn-new-service" class="cs-traefik-btn cs-traefik-btn-primary">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            \u041D\u043E\u0432\u044B\u0439 \u0441\u0435\u0440\u0432\u0438\u0441
          </button>
          <button id="cs-traefik-btn-rescan" class="cs-traefik-btn cs-traefik-btn-secondary" title="\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0433\u0440\u0430\u0444 \u043F\u0440\u0430\u0432\u0438\u043B">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
          <button id="cs-traefik-close-btn" class="cs-traefik-btn-icon" title="\u0417\u0430\u043A\u0440\u044B\u0442\u044C (Esc)">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Stats Metrics Bar -->
      <div class="cs-traefik-stats">
        <div class="cs-traefik-stat-card">
          <div class="cs-traefik-stat-val">${routers.length}</div>
          <div class="cs-traefik-stat-label">\u041C\u0430\u0440\u0448\u0440\u0443\u0442\u0438\u0437\u0430\u0442\u043E\u0440\u043E\u0432</div>
        </div>
        <div class="cs-traefik-stat-card">
          <div class="cs-traefik-stat-val">${services.length}</div>
          <div class="cs-traefik-stat-label">\u0421\u0435\u0440\u0432\u0438\u0441\u043E\u0432 \u0431\u044D\u043A\u0435\u043D\u0434\u0430</div>
        </div>
        <div class="cs-traefik-stat-card">
          <div class="cs-traefik-stat-val">${middlewares.length}</div>
          <div class="cs-traefik-stat-label">Middlewares</div>
        </div>
        <div class="cs-traefik-stat-card ${errorCount > 0 ? "cs-stat-error" : warnCount > 0 ? "cs-stat-warn" : "cs-stat-ok"}">
          <div class="cs-traefik-stat-val">${errorCount + warnCount}</div>
          <div class="cs-traefik-stat-label">${errorCount > 0 ? "\u041E\u0448\u0438\u0431\u043E\u043A \u0441\u0441\u044B\u043B\u043E\u043A" : warnCount > 0 ? "\u041F\u0440\u0435\u0434\u0443\u043F\u0440\u0435\u0436\u0434\u0435\u043D\u0438\u0439" : "\u0412\u0441\u0435 \u0441\u0441\u044B\u043B\u043A\u0438 \u0432\u0430\u043B\u0438\u0434\u043D\u044B"}</div>
        </div>
      </div>

      <!-- Filter Bar -->
      <div class="cs-traefik-filter-bar">
        <div class="cs-traefik-search-box">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input type="text" id="cs-traefik-search-input" placeholder="\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u0438\u043C\u0435\u043D\u0438, \u0445\u043E\u0441\u0442\u0443, \u0431\u044D\u043A\u0435\u043D\u0434\u0443 \u0438\u043B\u0438 middleware..." />
        </div>
        <div class="cs-traefik-filter-tabs">
          <button class="cs-traefik-filter-tab active" data-filter="all">\u0412\u0441\u0435 (${routers.length})</button>
          <button class="cs-traefik-filter-tab" data-filter="tls">TLS (${routers.filter((r) => r.tls).length})</button>
          <button class="cs-traefik-filter-tab" data-filter="issues">\u041F\u0440\u043E\u0431\u043B\u0435\u043C\u044B (${issues.length})</button>
        </div>
      </div>

      <!-- Issues Alert Banner (if any) -->
      ${issues.length > 0 ? `
        <div class="cs-traefik-issues-banner">
          <div class="cs-traefik-issues-title">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            \u041E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u043E \u043F\u0440\u043E\u0431\u043B\u0435\u043C: ${issues.length}
          </div>
          <div class="cs-traefik-issues-list">
            ${issues.map(
        (issue) => `
              <div class="cs-traefik-issue-item ${issue.severity}" data-file="${escapeHtml2(issue.file)}" data-line="${issue.line}">
                <span class="cs-traefik-issue-badge">${issue.code}</span>
                <span class="cs-traefik-issue-msg">${escapeHtml2(issue.message)}</span>
                <span class="cs-traefik-issue-link">\u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u0432 ${getBasename(issue.file)}:${issue.line} &rarr;</span>
              </div>
            `
      ).join("")}
          </div>
        </div>
      ` : ""}

      <!-- Routers & Services Table -->
      <div class="cs-traefik-table-wrap">
        <table class="cs-traefik-table" id="cs-traefik-matrix-table">
          <thead>
            <tr>
              <th>\u0421\u0442\u0430\u0442\u0443\u0441</th>
              <th>\u041C\u0430\u0440\u0448\u0440\u0443\u0442\u0438\u0437\u0430\u0442\u043E\u0440 & \u0424\u0430\u0439\u043B</th>
              <th>\u0425\u043E\u0441\u0442 / \u041F\u0440\u0430\u0432\u0438\u043B\u043E</th>
              <th>EntryPoints</th>
              <th>TLS</th>
              <th>\u0411\u044D\u043A\u0435\u043D\u0434 (Service)</th>
              <th>Middlewares</th>
              <th>\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435</th>
            </tr>
          </thead>
          <tbody id="cs-traefik-table-body">
            ${renderRows(routers, index)}
          </tbody>
        </table>
      </div>
    `;
      bindEvents();
    }
    function renderRows(routers, index, searchQuery = "", filterMode = "all") {
      const query = searchQuery.toLowerCase().trim();
      const filtered = routers.filter((r) => {
        if (filterMode === "tls" && !r.tls) return false;
        if (filterMode === "issues") {
          const hasIssue = index.issues?.some((i) => i.file === r.file && (i.line === r.line || i.message.includes(r.id)));
          if (!hasIssue) return false;
        }
        if (!query) return true;
        return r.id.toLowerCase().includes(query) || r.host && r.host.toLowerCase().includes(query) || r.rule.toLowerCase().includes(query) || r.service.toLowerCase().includes(query) || r.file.toLowerCase().includes(query) || r.middlewares.some((m) => m.toLowerCase().includes(query));
      });
      if (filtered.length === 0) {
        return `
        <tr>
          <td colspan="8" class="cs-traefik-empty">
            \u041C\u0430\u0440\u0448\u0440\u0443\u0442\u0438\u0437\u0430\u0442\u043E\u0440\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B
          </td>
        </tr>
      `;
      }
      return filtered.map((r) => {
        const svc = index.services.get(r.service.replace(/@file$/, ""));
        const backendUrls = svc?.servers?.join(", ") || "\u2014";
        const mwBadges = r.middlewares.map((mw) => {
          const clean = mw.replace(/@file$/, "");
          const exists = index.middlewares.has(clean);
          const mwDef = index.middlewares.get(clean);
          const title = exists ? `${clean} (${mwDef?.summary || mwDef?.type})` : `\u041E\u0428\u0418\u0411\u041A\u0410: Middleware '${clean}' \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0432 \u043F\u0440\u0430\u0432\u0438\u043B\u0430\u0445!`;
          return `
            <span class="cs-traefik-mw-badge ${exists ? "valid" : "invalid"}" title="${escapeHtml2(title)}" data-mw="${escapeHtml2(mw)}" data-file="${escapeHtml2(r.file)}" data-line="${r.middlewareLines?.[mw] || r.line}">
              ${escapeHtml2(clean)}
              ${!exists ? '<span class="cs-mw-broken">\u2716</span>' : ""}
            </span>
          `;
        });
        const routerIssues = index.issues?.filter((i) => i.file === r.file && (i.line === r.line || i.message.includes(r.id))) || [];
        const statusClass = routerIssues.length > 0 ? routerIssues.some((i) => i.severity === "error") ? "error" : "warn" : "ok";
        return `
          <tr class="cs-traefik-row" data-file="${escapeHtml2(r.file)}" data-line="${r.line}">
            <td>
              <span class="cs-traefik-status-dot ${statusClass}" title="${statusClass === "ok" ? "\u0412\u0430\u043B\u0438\u0434\u0435\u043D" : "\u0415\u0441\u0442\u044C \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u044B"}"></span>
            </td>
            <td>
              <div class="cs-traefik-cell-main">
                <span class="cs-traefik-router-name">${escapeHtml2(r.id)}</span>
                <span class="cs-traefik-file-link" data-file="${escapeHtml2(r.file)}" data-line="${r.line}">
                  ${getBasename(r.file)}:${r.line}
                </span>
              </div>
            </td>
            <td>
              <div class="cs-traefik-cell-host" title="${escapeHtml2(r.rule)}">
                ${r.host ? `<span class="cs-traefik-host-text">${escapeHtml2(r.host)}</span>` : `<code class="cs-traefik-rule-code">${escapeHtml2(r.rule)}</code>`}
              </div>
            </td>
            <td>
              ${r.entryPoints.map((ep) => `<span class="cs-traefik-ep-badge">${escapeHtml2(ep)}</span>`).join(" ") || '<span class="cs-muted">\u2014</span>'}
            </td>
            <td>
              ${r.tls ? `<span class="cs-traefik-tls-badge" title="TLS Resolver: ${r.certResolver || "Default"}">
                      <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                      ${r.certResolver || "TLS"}
                    </span>` : `<span class="cs-traefik-http-badge">HTTP</span>`}
            </td>
            <td>
              <div class="cs-traefik-backend-cell">
                <span class="cs-traefik-svc-name" title="${svc ? `${getBasename(svc.file)}:${svc.line}` : "\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D"}" data-file="${escapeHtml2(svc?.file || r.file)}" data-line="${svc?.line || r.serviceLine || r.line}">
                  ${escapeHtml2(r.service)}
                </span>
                <span class="cs-traefik-backend-url" title="${escapeHtml2(backendUrls)}">${escapeHtml2(backendUrls)}</span>
              </div>
            </td>
            <td>
              <div class="cs-traefik-mw-list">
                ${mwBadges.length > 0 ? mwBadges.join("") : '<span class="cs-muted">\u2014</span>'}
              </div>
            </td>
            <td>
              <button class="cs-traefik-jump-btn" data-file="${escapeHtml2(r.file)}" data-line="${r.line}">
                \u041E\u0442\u043A\u0440\u044B\u0442\u044C &rarr;
              </button>
            </td>
          </tr>
        `;
      }).join("");
    }
    function bindEvents() {
      const closeBtn = modal.querySelector("#cs-traefik-close-btn");
      closeBtn?.addEventListener("click", closeModal);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeModal();
      });
      const doctorBtn = modal.querySelector("#cs-traefik-btn-doctor");
      doctorBtn?.addEventListener("click", () => {
        closeModal();
        if (onOpenDoctor) onOpenDoctor();
      });
      const newBtn = modal.querySelector("#cs-traefik-btn-new-service");
      newBtn?.addEventListener("click", () => {
        closeModal();
        onOpenWizard();
      });
      const rescanBtn = modal.querySelector("#cs-traefik-btn-rescan");
      rescanBtn?.addEventListener("click", async () => {
        rescanBtn.classList.add("cs-spin");
        await indexer.scanWorkspace();
        renderContent();
      });
      const searchInput = modal.querySelector("#cs-traefik-search-input");
      const filterTabs = modal.querySelectorAll(".cs-traefik-filter-tab");
      let currentFilter = "all";
      function updateTable() {
        const index = indexer.getIndex();
        if (!index) return;
        const tbody = modal.querySelector("#cs-traefik-table-body");
        if (tbody) {
          tbody.innerHTML = renderRows(Array.from(index.routers.values()), index, searchInput?.value || "", currentFilter);
          attachJumpHandlers();
        }
      }
      searchInput?.addEventListener("input", updateTable);
      filterTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
          filterTabs.forEach((t) => t.classList.remove("active"));
          tab.classList.add("active");
          currentFilter = tab.getAttribute("data-filter") || "all";
          updateTable();
        });
      });
      attachJumpHandlers();
    }
    function attachJumpHandlers() {
      modal.querySelectorAll("[data-file]").forEach((el) => {
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const file = el.getAttribute("data-file");
          const lineStr = el.getAttribute("data-line");
          const line = lineStr ? parseInt(lineStr, 10) : 1;
          if (file && window.ConfigStudio?.openFile) {
            window.ConfigStudio.openFile(file, { line, highlight: true });
            closeModal();
          }
        });
      });
      modal.querySelectorAll(".cs-traefik-mw-badge").forEach((badge) => {
        badge.addEventListener("click", (e) => {
          e.stopPropagation();
          const mwName = badge.getAttribute("data-mw");
          if (!mwName) return;
          const def = indexer.findDefinition(mwName);
          if (def && window.ConfigStudio?.openFile) {
            window.ConfigStudio.openFile(def.file, { line: def.line, highlight: true });
            closeModal();
          } else {
            const file = badge.getAttribute("data-file");
            const lineStr = badge.getAttribute("data-line");
            if (file && window.ConfigStudio?.openFile) {
              window.ConfigStudio.openFile(file, { line: lineStr ? parseInt(lineStr, 10) : 1, highlight: true });
              closeModal();
            }
          }
        });
      });
    }
    function closeModal() {
      document.removeEventListener("keydown", handleKey);
      overlay.remove();
    }
    function handleKey(e) {
      if (e.key === "Escape") closeModal();
    }
    document.addEventListener("keydown", handleKey);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    renderContent();
  }
  function escapeHtml2(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function getBasename(path) {
    if (!path) return "";
    return path.split(/[\\/]/).pop() || path;
  }

  // src/generator.ts
  function generateServiceYaml(config) {
    const routerId = config.enableTls ? `${config.name}-router` : config.name;
    const serviceId = `${config.name}-service`;
    let mwLines = "";
    if (config.middlewares && config.middlewares.length > 0) {
      mwLines = `      middlewares:
` + config.middlewares.map((m) => `        - ${m.replace(/^"|"$/g, "").replace(/@file$/, "")}`).join("\n") + "\n";
    }
    let tlsBlock = "";
    if (config.enableTls) {
      if (config.certResolver) {
        tlsBlock = `      tls:
        certResolver: ${config.certResolver.replace(/^"|"$/g, "")}
`;
      } else {
        tlsBlock = `      tls: {}
`;
      }
    }
    const ep = (config.entryPoint || "websecure").replace(/^"|"$/g, "");
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
  var MIDDLEWARE_BLUEPRINTS = [
    {
      type: "security-headers",
      title: "Security Headers",
      category: "security",
      description: "HSTS, X-Frame-Options (SAMEORIGIN), nosniff, XSS protection, Referrer-Policy",
      defaultName: "mw-security-headers",
      fields: [
        {
          key: "sslRedirect",
          label: "SSL Redirect",
          type: "boolean",
          defaultValue: true,
          hint: "\u041F\u0440\u0438\u043D\u0443\u0434\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0440\u0435\u0434\u0438\u0440\u0435\u043A\u0442 \u043D\u0430 \u0437\u0430\u0449\u0438\u0449\u0435\u043D\u043D\u044B\u0439 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B"
        },
        {
          key: "customFrameOptionsValue",
          label: "Frame Options",
          type: "text",
          defaultValue: "SAMEORIGIN",
          hint: "\u0417\u0430\u0449\u0438\u0442\u0430 \u043E\u0442 \u043A\u043B\u0438\u043A\u0434\u0436\u0435\u043A\u0438\u043D\u0433\u0430 (SAMEORIGIN, DENY)"
        }
      ],
      generateYaml: (name, params) => {
        const frameOpt = params.customFrameOptionsValue || "SAMEORIGIN";
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
      }
    },
    {
      type: "rate-limit",
      title: "Rate Limit",
      category: "traffic",
      description: "\u041E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u0435 \u0447\u0430\u0441\u0442\u043E\u0442\u044B \u0437\u0430\u043F\u0440\u043E\u0441\u043E\u0432 \u0434\u043B\u044F \u0437\u0430\u0449\u0438\u0442\u044B \u043E\u0442 DDoS \u0438 \u0431\u0440\u0443\u0442\u0444\u043E\u0440\u0441\u0430",
      defaultName: "mw-rate-limit",
      fields: [
        {
          key: "average",
          label: "\u0421\u0440\u0435\u0434\u043D\u0435\u0435 \u0447\u0438\u0441\u043B\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u043E\u0432 (average)",
          type: "number",
          defaultValue: 100,
          hint: "\u041C\u0430\u043A\u0441\u0438\u043C\u0443\u043C \u0437\u0430\u043F\u0440\u043E\u0441\u043E\u0432 \u0432 \u0435\u0434\u0438\u043D\u0438\u0446\u0443 \u0432\u0440\u0435\u043C\u0435\u043D\u0438"
        },
        {
          key: "burst",
          label: "\u0412\u0441\u043F\u043B\u0435\u0441\u043A (burst)",
          type: "number",
          defaultValue: 50,
          hint: "\u041C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u044C\u043D\u044B\u0439 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u043D\u044B\u0439 \u0440\u0430\u0437\u043C\u0435\u0440 \u043A\u0440\u0430\u0442\u043A\u043E\u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E\u0433\u043E \u0432\u0441\u043F\u043B\u0435\u0441\u043A\u0430"
        },
        {
          key: "period",
          label: "\u041F\u0435\u0440\u0438\u043E\u0434 (period)",
          type: "text",
          defaultValue: "1s",
          hint: "\u041E\u043A\u043D\u043E \u0437\u0430\u043C\u0435\u0440\u0430 (1s, 1m, 1h)"
        }
      ],
      generateYaml: (name, params) => {
        const avg = Number(params.average) || 100;
        const burst = Number(params.burst) || 50;
        const period = params.period || "1s";
        return `http:
  middlewares:
    ${name}:
      rateLimit:
        average: ${avg}
        burst: ${burst}
        period: "${period}"
`;
      }
    },
    {
      type: "basic-auth",
      title: "Basic Auth (HTTP)",
      category: "security",
      description: "HTTP Basic \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044F \u043F\u043E \u043B\u043E\u0433\u0438\u043D\u0443 \u0438 \u043F\u0430\u0440\u043E\u043B\u044E (htpasswd / bcrypt)",
      defaultName: "mw-basic-auth",
      fields: [
        {
          key: "users",
          label: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0438 (\u043F\u043E \u0441\u0442\u0440\u043E\u043A\u0430\u043C \u0438\u043B\u0438 \u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043F\u044F\u0442\u0443\u044E)",
          type: "textarea",
          defaultValue: "admin:$apr1$H6uskkkW$IgXLP6ewTrSuBkTrqE8wj/",
          placeholder: "admin:$apr1$H6uskkkW$IgXLP6ewTrSuBkTrqE8wj/\nuser2:$2y$05$...",
          hint: "\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u0443\u0439\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 htpasswd -nb user password"
        },
        {
          key: "removeHeader",
          label: "\u0423\u0434\u0430\u043B\u044F\u0442\u044C \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A Authorization \u043F\u0440\u0438 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0435 \u0431\u044D\u043A\u0435\u043D\u0434\u0443",
          type: "boolean",
          defaultValue: true
        }
      ],
      generateYaml: (name, params) => {
        const rawUsers = String(params.users || "admin:$apr1$H6uskkkW$IgXLP6ewTrSuBkTrqE8wj/");
        const userList = rawUsers.split(/[\n,]/).map((u) => u.trim()).filter(Boolean);
        const userLines = userList.map((u) => `          - "${u.replace(/"/g, '\\"')}"`).join("\n");
        const removeHdr = params.removeHeader !== false;
        return `http:
  middlewares:
    ${name}:
      basicAuth:
        users:
${userLines}
        removeHeader: ${removeHdr}
`;
      }
    },
    {
      type: "ip-allowlist",
      title: "IP AllowList (Whitelist)",
      category: "security",
      description: "\u041E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u0435 \u0434\u043E\u0441\u0442\u0443\u043F\u0430 \u043A \u0441\u0435\u0440\u0432\u0438\u0441\u0443 \u0441\u043F\u0438\u0441\u043A\u043E\u043C \u0434\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0445 IP \u0438\u043B\u0438 CIDR-\u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u043E\u0432",
      defaultName: "mw-local-only",
      fields: [
        {
          key: "sourceRange",
          label: "\u0420\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u043D\u044B\u0435 CIDR \u043F\u043E\u0434\u0441\u0435\u0442\u0438",
          type: "textarea",
          defaultValue: "127.0.0.1/32\n192.168.0.0/16\n10.0.0.0/8",
          placeholder: "127.0.0.1/32\n192.168.1.0/24",
          hint: "\u041F\u043E\u0434\u0441\u0435\u0442\u0438 \u0447\u0435\u0440\u0435\u0437 \u043F\u0435\u0440\u0435\u0432\u043E\u0434 \u0441\u0442\u0440\u043E\u043A\u0438 \u0438\u043B\u0438 \u0437\u0430\u043F\u044F\u0442\u0443\u044E"
        }
      ],
      generateYaml: (name, params) => {
        const rawCidrs = String(params.sourceRange || "127.0.0.1/32\n192.168.0.0/16\n10.0.0.0/8");
        const cidrList = rawCidrs.split(/[\n,]/).map((c) => c.trim()).filter(Boolean);
        const cidrLines = cidrList.map((c) => `          - "${c.replace(/"/g, "")}"`).join("\n");
        return `http:
  middlewares:
    ${name}:
      ipAllowList:
        sourceRange:
${cidrLines}
`;
      }
    },
    {
      type: "redirect-scheme",
      title: "Redirect Scheme (HTTPS)",
      category: "routing",
      description: "\u041F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u044B\u0439 HTTP 301 \u0440\u0435\u0434\u0438\u0440\u0435\u043A\u0442 \u0432\u0445\u043E\u0434\u044F\u0449\u0435\u0433\u043E \u0442\u0440\u0430\u0444\u0438\u043A\u0430 \u0441 HTTP \u043D\u0430 \u0437\u0430\u0449\u0438\u0449\u0435\u043D\u043D\u044B\u0439 HTTPS",
      defaultName: "mw-redirect-https",
      fields: [
        {
          key: "scheme",
          label: "\u0426\u0435\u043B\u0435\u0432\u0430\u044F \u0441\u0445\u0435\u043C\u0430",
          type: "text",
          defaultValue: "https"
        },
        {
          key: "permanent",
          label: "\u041F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u044B\u0439 \u0440\u0435\u0434\u0438\u0440\u0435\u043A\u0442 (HTTP 301)",
          type: "boolean",
          defaultValue: true
        }
      ],
      generateYaml: (name, params) => {
        const scheme = params.scheme || "https";
        const permanent = params.permanent !== false;
        return `http:
  middlewares:
    ${name}:
      redirectScheme:
        scheme: "${scheme}"
        permanent: ${permanent}
`;
      }
    },
    {
      type: "compress",
      title: "Compress (Gzip / Deflate)",
      category: "performance",
      description: "\u0421\u0436\u0430\u0442\u0438\u0435 \u043E\u0442\u0432\u0435\u0442\u043E\u0432 \u0432\u0435\u0431-\u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u0434\u043B\u044F \u044D\u043A\u043E\u043D\u043E\u043C\u0438\u0438 \u0442\u0440\u0430\u0444\u0438\u043A\u0430 \u0438 \u0443\u0441\u043A\u043E\u0440\u0435\u043D\u0438\u044F \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u0432",
      defaultName: "mw-compress",
      fields: [
        {
          key: "minResponseBodyBytes",
          label: "\u041C\u0438\u043D. \u0440\u0430\u0437\u043C\u0435\u0440 \u043E\u0442\u0432\u0435\u0442\u0430 \u0434\u043B\u044F \u0441\u0436\u0430\u0442\u0438\u044F (bytes)",
          type: "number",
          defaultValue: 1024
        }
      ],
      generateYaml: (name, params) => {
        const minBytes = Number(params.minResponseBodyBytes) || 1024;
        return `http:
  middlewares:
    ${name}:
      compress:
        minResponseBodyBytes: ${minBytes}
`;
      }
    },
    {
      type: "crowdsec",
      title: "CrowdSec Bouncer",
      category: "security",
      description: "\u0418\u043D\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044F \u0441 CrowdSec \u0434\u043B\u044F \u043F\u0440\u043E\u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0439 \u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u043A\u0438 IP-\u0430\u0434\u0440\u0435\u0441\u043E\u0432 \u0431\u043E\u0442\u043D\u0435\u0442\u043E\u0432 \u0438 \u0441\u043A\u0430\u043D\u0435\u0440\u043E\u0432",
      defaultName: "mw-crowdsec-bouncer",
      fields: [
        {
          key: "crowdsecMode",
          label: "\u0420\u0435\u0436\u0438\u043C \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 (crowdsecMode)",
          type: "text",
          defaultValue: "live",
          hint: "live \u0438\u043B\u0438 stream"
        },
        {
          key: "updateInterval",
          label: "\u0418\u043D\u0442\u0435\u0440\u0432\u0430\u043B \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F (updateInterval)",
          type: "text",
          defaultValue: "10s"
        }
      ],
      generateYaml: (name, params) => {
        const mode = params.crowdsecMode || "live";
        const interval = params.updateInterval || "10s";
        return `http:
  middlewares:
    ${name}:
      plugin:
        crowdsecBouncer:
          enabled: true
          crowdsecMode: ${mode}
          updateInterval: "${interval}"
`;
      }
    }
  ];
  function generateMiddlewareYaml(type, name, params = {}) {
    const blueprint = MIDDLEWARE_BLUEPRINTS.find((b) => b.type === type);
    if (!blueprint) {
      throw new Error(`Unknown middleware blueprint recipe type: ${type}`);
    }
    return blueprint.generateYaml(name, params);
  }

  // src/ui/wizardModal.ts
  function openWizardModal(indexer, onCreated, initialMode = "service") {
    const existing = document.getElementById("cs-traefik-wizard-overlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "cs-traefik-wizard-overlay";
    overlay.className = "cs-traefik-overlay";
    const modal = document.createElement("div");
    modal.className = "cs-traefik-modal cs-traefik-modal-lg";
    const index = indexer.getIndex();
    const availableMiddlewares = index ? Array.from(index.middlewares.values()) : [];
    const rulesDir = index?.rulesDir || "rules";
    let currentMode = initialMode;
    const serviceState = {
      name: "myservice",
      host: "myservice.example.com",
      targetUrl: "http://127.0.0.1:8080",
      entryPoint: "websecure",
      enableTls: true,
      certResolver: "letsencrypt",
      middlewares: availableMiddlewares.length > 0 ? [availableMiddlewares[0].id] : [],
      rulesSubdir: rulesDir
    };
    let selectedBlueprintType = "security-headers";
    const blueprintParams = {};
    const initialBp = MIDDLEWARE_BLUEPRINTS[0];
    initialBp.fields.forEach((f) => {
      blueprintParams[f.key] = f.defaultValue;
    });
    let blueprintName = initialBp.defaultName;
    function renderModal() {
      modal.innerHTML = `
      <div class="cs-traefik-header">
        <div class="cs-traefik-header-left">
          <div class="cs-traefik-icon-badge">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
            </svg>
          </div>
          <div>
            <h2 class="cs-traefik-title">\u041C\u0430\u0441\u0442\u0435\u0440 Traefik Dynamic & Blueprints</h2>
            <div class="cs-traefik-subtitle">\u041A\u043E\u043D\u0441\u0442\u0440\u0443\u043A\u0442\u043E\u0440 \u0441\u0435\u0440\u0432\u0438\u0441\u043E\u0432 (ser-*.yml) \u0438 \u0440\u0435\u0446\u0435\u043F\u0442\u044B \u0433\u043E\u0442\u043E\u0432\u044B\u0445 \u043F\u0440\u0430\u0432\u0438\u043B (mw-*.yml)</div>
          </div>
        </div>
        <button id="cs-wizard-close-btn" class="cs-traefik-btn-icon" title="\u0417\u0430\u043A\u0440\u044B\u0442\u044C">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Mode Switcher Tabs -->
      <div class="cs-wizard-tabs-bar">
        <button id="cs-mode-btn-service" class="cs-wizard-tab-btn ${currentMode === "service" ? "active" : ""}">
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
          </svg>
          \u0421\u0435\u0440\u0432\u0438\u0441 (ser-*.yml)
        </button>
        <button id="cs-mode-btn-blueprint" class="cs-wizard-tab-btn ${currentMode === "blueprint" ? "active" : ""}">
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
          \u0420\u0435\u0446\u0435\u043F\u0442\u044B Middleware (mw-*.yml)
        </button>
      </div>

      <div class="cs-wizard-body">
        <!-- Left Column: Form -->
        <div class="cs-wizard-form" id="cs-wizard-form-container">
          ${currentMode === "service" ? renderServiceForm() : renderBlueprintForm()}
        </div>

        <!-- Right Column: Live YAML Preview -->
        <div class="cs-wizard-preview">
          <div class="cs-preview-header">
            <span class="cs-preview-title">\u041F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 YAML</span>
            <span class="cs-preview-badge" id="cs-preview-badge-type">${currentMode === "service" ? "Traefik Service" : "Traefik Middleware"}</span>
          </div>
          <pre class="cs-preview-code"><code id="cs-wizard-preview-code"></code></pre>
        </div>
      </div>

      <div class="cs-traefik-footer">
        <button id="cs-wizard-cancel-btn" class="cs-traefik-btn cs-traefik-btn-secondary">\u041E\u0442\u043C\u0435\u043D\u0430</button>
        <button id="cs-wizard-submit-btn" class="cs-traefik-btn cs-traefik-btn-primary">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
          <span id="cs-wizard-submit-label">${currentMode === "service" ? "\u0421\u043E\u0437\u0434\u0430\u0442\u044C ser-\u0444\u0430\u0439\u043B \u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u044C" : "\u0421\u043E\u0437\u0434\u0430\u0442\u044C mw-\u0444\u0430\u0439\u043B \u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u044C"}</span>
        </button>
      </div>
    `;
      bindEvents();
      updatePreview();
    }
    function renderServiceForm() {
      return `
      <div class="cs-form-group">
        <label class="cs-form-label">\u0418\u043C\u044F \u0441\u0435\u0440\u0432\u0438\u0441\u0430 (slug)</label>
        <input type="text" id="cs-wizard-name" class="cs-form-input" value="${escapeHtml3(
        serviceState.name
      )}" placeholder="jellyfin, vaultwarden, api..." />
        <div class="cs-form-hint">\u0411\u0443\u0434\u0435\u0442 \u0441\u043E\u0437\u0434\u0430\u043D \u0444\u0430\u0439\u043B: <code id="cs-wizard-target-filename">${getTargetServiceFilename(
        serviceState.rulesSubdir,
        serviceState.name
      )}</code></div>
      </div>

      <div class="cs-form-group">
        <label class="cs-form-label">\u0414\u043E\u043C\u0435\u043D / Host</label>
        <input type="text" id="cs-wizard-host" class="cs-form-input" value="${escapeHtml3(
        serviceState.host
      )}" placeholder="subdomain.domain.tld" />
      </div>

      <div class="cs-form-group">
        <label class="cs-form-label">\u0411\u044D\u043A\u0435\u043D\u0434 URL (loadBalancer)</label>
        <input type="text" id="cs-wizard-url" class="cs-form-input" value="${escapeHtml3(
        serviceState.targetUrl
      )}" placeholder="http://192.168.1.50:8080" />
      </div>

      <div class="cs-form-row">
        <div class="cs-form-group cs-col-6">
          <label class="cs-form-label">EntryPoint</label>
          <select id="cs-wizard-entrypoint" class="cs-form-select">
            <option value="websecure" ${serviceState.entryPoint === "websecure" ? "selected" : ""}>websecure (443 / HTTPS)</option>
            <option value="web" ${serviceState.entryPoint === "web" ? "selected" : ""}>web (80 / HTTP)</option>
            <option value="traefik" ${serviceState.entryPoint === "traefik" ? "selected" : ""}>traefik (Dashboard)</option>
          </select>
        </div>
        <div class="cs-form-group cs-col-6">
          <label class="cs-form-label">\u041A\u0430\u0442\u0430\u043B\u043E\u0433 \u043F\u0440\u0430\u0432\u0438\u043B</label>
          <input type="text" id="cs-wizard-rules-dir" class="cs-form-input" value="${escapeHtml3(
        serviceState.rulesSubdir || "rules"
      )}" />
        </div>
      </div>

      <div class="cs-form-group cs-tls-box">
        <label class="cs-checkbox-label">
          <input type="checkbox" id="cs-wizard-tls" ${serviceState.enableTls ? "checked" : ""} />
          <span class="cs-checkbox-custom"></span>
          <span class="cs-checkbox-text">\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 TLS \u0441\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442</span>
        </label>
        <div id="cs-wizard-tls-fields" style="${serviceState.enableTls ? "" : "display:none;"}margin-top:8px;">
          <label class="cs-form-label-sub">CertResolver</label>
          <input type="text" id="cs-wizard-cert-resolver" class="cs-form-input" value="${escapeHtml3(
        serviceState.certResolver
      )}" placeholder="letsencrypt" />
        </div>
      </div>

      <!-- Middlewares Checklist -->
      <div class="cs-form-group">
        <label class="cs-form-label">
          \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C Middlewares
          <span class="cs-label-badge">${availableMiddlewares.length} \u043D\u0430\u0439\u0434\u0435\u043D\u043E</span>
        </label>
        <div class="cs-mw-checkbox-grid">
          ${availableMiddlewares.length > 0 ? availableMiddlewares.map(
        (mw) => `
              <label class="cs-mw-checkbox-card ${serviceState.middlewares.includes(mw.id) ? "selected" : ""}">
                <input type="checkbox" class="cs-mw-checkbox" value="${escapeHtml3(mw.id)}" ${serviceState.middlewares.includes(mw.id) ? "checked" : ""} />
                <div class="cs-mw-info">
                  <div class="cs-mw-name">${escapeHtml3(mw.id)}</div>
                  <div class="cs-mw-type">${escapeHtml3(mw.summary || mw.type)}</div>
                </div>
              </label>
            `
      ).join("") : `<div class="cs-muted-box">Middlewares \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B \u0432 workspace. \u041F\u0435\u0440\u0435\u0439\u0434\u0438\u0442\u0435 \u0432\u043E \u0432\u043A\u043B\u0430\u0434\u043A\u0443 \xAB\u0420\u0435\u0446\u0435\u043F\u0442\u044B Middleware\xBB \u0434\u043B\u044F \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F!</div>`}
        </div>
      </div>
    `;
    }
    function renderBlueprintForm() {
      const currentBp = MIDDLEWARE_BLUEPRINTS.find((b) => b.type === selectedBlueprintType) || MIDDLEWARE_BLUEPRINTS[0];
      return `
      <div class="cs-form-group">
        <label class="cs-form-label">\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0433\u043E\u0442\u043E\u0432\u044B\u0439 \u0440\u0435\u0446\u0435\u043F\u0442 Middleware</label>
        <div class="cs-blueprint-selector-grid">
          ${MIDDLEWARE_BLUEPRINTS.map(
        (bp) => `
            <div class="cs-bp-card ${bp.type === selectedBlueprintType ? "selected" : ""}" data-bp-type="${bp.type}">
              <div class="cs-bp-card-title">${escapeHtml3(bp.title)}</div>
              <div class="cs-bp-card-desc">${escapeHtml3(bp.description)}</div>
            </div>
          `
      ).join("")}
        </div>
      </div>

      <div class="cs-form-group" style="margin-top: 6px;">
        <label class="cs-form-label">\u0418\u043C\u044F Middleware</label>
        <input type="text" id="cs-bp-name-input" class="cs-form-input" value="${escapeHtml3(blueprintName)}" />
        <div class="cs-form-hint">\u0411\u0443\u0434\u0435\u0442 \u0441\u043E\u0437\u0434\u0430\u043D \u0444\u0430\u0439\u043B: <code id="cs-wizard-target-filename">${getTargetMiddlewareFilename(
        serviceState.rulesSubdir,
        blueprintName
      )}</code></div>
      </div>

      <!-- Dynamic Blueprint Fields -->
      <div class="cs-bp-fields-box">
        ${currentBp.fields.map((f) => {
        const val = blueprintParams[f.key] !== void 0 ? blueprintParams[f.key] : f.defaultValue;
        if (f.type === "boolean") {
          return `
                <div class="cs-form-group">
                  <label class="cs-checkbox-label">
                    <input type="checkbox" class="cs-bp-field" data-field-key="${f.key}" ${val ? "checked" : ""} />
                    <span class="cs-checkbox-custom"></span>
                    <span class="cs-checkbox-text">${escapeHtml3(f.label)}</span>
                  </label>
                  ${f.hint ? `<div class="cs-form-hint">${escapeHtml3(f.hint)}</div>` : ""}
                </div>
              `;
        } else if (f.type === "textarea") {
          return `
                <div class="cs-form-group">
                  <label class="cs-form-label">${escapeHtml3(f.label)}</label>
                  <textarea class="cs-form-input cs-form-textarea cs-bp-field" data-field-key="${f.key}" rows="3" placeholder="${escapeHtml3(
            f.placeholder || ""
          )}">${escapeHtml3(String(val))}</textarea>
                  ${f.hint ? `<div class="cs-form-hint">${escapeHtml3(f.hint)}</div>` : ""}
                </div>
              `;
        } else {
          return `
                <div class="cs-form-group">
                  <label class="cs-form-label">${escapeHtml3(f.label)}</label>
                  <input type="${f.type === "number" ? "number" : "text"}" class="cs-form-input cs-bp-field" data-field-key="${f.key}" value="${escapeHtml3(String(val))}" placeholder="${escapeHtml3(f.placeholder || "")}" />
                  ${f.hint ? `<div class="cs-form-hint">${escapeHtml3(f.hint)}</div>` : ""}
                </div>
              `;
        }
      }).join("")}
      </div>
    `;
    }
    function updatePreview() {
      const codeEl = modal.querySelector("#cs-wizard-preview-code");
      const badgeEl = modal.querySelector("#cs-preview-badge-type");
      const targetEl = modal.querySelector("#cs-wizard-target-filename");
      if (currentMode === "service") {
        const yaml = generateServiceYaml(serviceState);
        if (codeEl) codeEl.textContent = yaml;
        if (badgeEl) badgeEl.textContent = "Traefik Service";
        if (targetEl) targetEl.textContent = getTargetServiceFilename(serviceState.rulesSubdir, serviceState.name);
      } else {
        const yaml = generateMiddlewareYaml(selectedBlueprintType, blueprintName, blueprintParams);
        if (codeEl) codeEl.textContent = yaml;
        if (badgeEl) badgeEl.textContent = "Traefik Middleware";
        if (targetEl) targetEl.textContent = getTargetMiddlewareFilename(serviceState.rulesSubdir, blueprintName);
      }
    }
    function bindEvents() {
      const close = () => {
        document.removeEventListener("keydown", handleKey);
        overlay.remove();
      };
      modal.querySelector("#cs-wizard-close-btn")?.addEventListener("click", close);
      modal.querySelector("#cs-wizard-cancel-btn")?.addEventListener("click", close);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
      modal.querySelector("#cs-mode-btn-service")?.addEventListener("click", () => {
        if (currentMode !== "service") {
          currentMode = "service";
          renderModal();
        }
      });
      modal.querySelector("#cs-mode-btn-blueprint")?.addEventListener("click", () => {
        if (currentMode !== "blueprint") {
          currentMode = "blueprint";
          renderModal();
        }
      });
      if (currentMode === "service") {
        const nameInput = modal.querySelector("#cs-wizard-name");
        nameInput?.addEventListener("input", () => {
          serviceState.name = nameInput.value.trim().toLowerCase().replace(/[^a-z0-9\-]/g, "-");
          updatePreview();
        });
        const hostInput = modal.querySelector("#cs-wizard-host");
        hostInput?.addEventListener("input", () => {
          serviceState.host = hostInput.value.trim();
          updatePreview();
        });
        const urlInput = modal.querySelector("#cs-wizard-url");
        urlInput?.addEventListener("input", () => {
          serviceState.targetUrl = urlInput.value.trim();
          updatePreview();
        });
        const epSelect = modal.querySelector("#cs-wizard-entrypoint");
        epSelect?.addEventListener("change", () => {
          serviceState.entryPoint = epSelect.value;
          updatePreview();
        });
        const rulesDirInput = modal.querySelector("#cs-wizard-rules-dir");
        rulesDirInput?.addEventListener("input", () => {
          serviceState.rulesSubdir = rulesDirInput.value.trim();
          updatePreview();
        });
        const tlsCheckbox = modal.querySelector("#cs-wizard-tls");
        const tlsFields = modal.querySelector("#cs-wizard-tls-fields");
        tlsCheckbox?.addEventListener("change", () => {
          serviceState.enableTls = tlsCheckbox.checked;
          if (tlsFields) tlsFields.style.display = serviceState.enableTls ? "" : "none";
          updatePreview();
        });
        const certInput = modal.querySelector("#cs-wizard-cert-resolver");
        certInput?.addEventListener("input", () => {
          serviceState.certResolver = certInput.value.trim();
          updatePreview();
        });
        const mwCheckboxes = modal.querySelectorAll(".cs-mw-checkbox");
        mwCheckboxes.forEach((cb) => {
          cb.addEventListener("change", () => {
            const card = cb.closest(".cs-mw-checkbox-card");
            if (cb.checked) {
              card?.classList.add("selected");
            } else {
              card?.classList.remove("selected");
            }
            const selected = [];
            mwCheckboxes.forEach((c) => {
              if (c.checked) selected.push(c.value);
            });
            serviceState.middlewares = selected;
            updatePreview();
          });
        });
      } else {
        const bpCards = modal.querySelectorAll("[data-bp-type]");
        bpCards.forEach((card) => {
          card.addEventListener("click", () => {
            const type = card.getAttribute("data-bp-type");
            if (type && type !== selectedBlueprintType) {
              selectedBlueprintType = type;
              const bp = MIDDLEWARE_BLUEPRINTS.find((b) => b.type === type);
              if (bp) {
                blueprintName = bp.defaultName;
                bp.fields.forEach((f) => {
                  blueprintParams[f.key] = f.defaultValue;
                });
              }
              renderModal();
            }
          });
        });
        const bpNameInput = modal.querySelector("#cs-bp-name-input");
        bpNameInput?.addEventListener("input", () => {
          blueprintName = bpNameInput.value.trim().toLowerCase().replace(/[^a-z0-9\-]/g, "-");
          updatePreview();
        });
        const fieldInputs = modal.querySelectorAll(".cs-bp-field");
        fieldInputs.forEach((el) => {
          const key = el.getAttribute("data-field-key");
          if (!key) return;
          el.addEventListener("input", () => {
            if (el.type === "checkbox") {
              blueprintParams[key] = el.checked;
            } else {
              blueprintParams[key] = el.value;
            }
            updatePreview();
          });
          el.addEventListener("change", () => {
            if (el.type === "checkbox") {
              blueprintParams[key] = el.checked;
            } else {
              blueprintParams[key] = el.value;
            }
            updatePreview();
          });
        });
      }
      const submitBtn = modal.querySelector("#cs-wizard-submit-btn");
      submitBtn?.addEventListener("click", async () => {
        const cs = window.ConfigStudio;
        if (currentMode === "service") {
          if (!serviceState.name) {
            alert("\u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u0438\u043C\u044F \u0441\u0435\u0440\u0432\u0438\u0441\u0430");
            return;
          }
          submitBtn.disabled = true;
          submitBtn.textContent = "\u0421\u043E\u0437\u0434\u0430\u043D\u0438\u0435...";
          const targetPath = getTargetServiceFilename(serviceState.rulesSubdir, serviceState.name);
          const yamlContent = generateServiceYaml(serviceState);
          try {
            if (cs?.createFile) {
              await cs.createFile(targetPath, yamlContent);
              await cs.refreshFiles?.();
              await indexer.scanWorkspace();
              cs.showNotification?.(`\u0421\u0435\u0440\u0432\u0438\u0441 '${serviceState.name}' \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0441\u043E\u0437\u0434\u0430\u043D \u0432 ${targetPath}`, "success");
            } else {
              await fetch("/api/fs/file", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-ConfigStudio-Web": "1" },
                body: JSON.stringify({ path: targetPath, content: yamlContent })
              });
              await indexer.scanWorkspace();
              cs?.openFile?.(targetPath, { line: 1, highlight: true });
            }
            close();
            if (onCreated) onCreated(targetPath);
          } catch (err) {
            alert(`\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0438 \u0441\u0435\u0440\u0432\u0438\u0441\u0430: ${err.message}`);
            submitBtn.disabled = false;
            submitBtn.textContent = "\u0421\u043E\u0437\u0434\u0430\u0442\u044C ser-\u0444\u0430\u0439\u043B \u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u044C";
          }
        } else {
          if (!blueprintName) {
            alert("\u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u0438\u043C\u044F middleware");
            return;
          }
          submitBtn.disabled = true;
          submitBtn.textContent = "\u0421\u043E\u0437\u0434\u0430\u043D\u0438\u0435...";
          const targetPath = getTargetMiddlewareFilename(serviceState.rulesSubdir, blueprintName);
          const yamlContent = generateMiddlewareYaml(selectedBlueprintType, blueprintName, blueprintParams);
          try {
            if (cs?.createFile) {
              await cs.createFile(targetPath, yamlContent);
              await cs.refreshFiles?.();
              await indexer.scanWorkspace();
              cs.showNotification?.(`Middleware '${blueprintName}' \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0441\u043E\u0437\u0434\u0430\u043D \u0432 ${targetPath}`, "success");
            } else {
              await fetch("/api/fs/file", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-ConfigStudio-Web": "1" },
                body: JSON.stringify({ path: targetPath, content: yamlContent })
              });
              await indexer.scanWorkspace();
              cs?.openFile?.(targetPath, { line: 1, highlight: true });
            }
            close();
            if (onCreated) onCreated(targetPath);
          } catch (err) {
            alert(`\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0438 middleware: ${err.message}`);
            submitBtn.disabled = false;
            submitBtn.textContent = "\u0421\u043E\u0437\u0434\u0430\u0442\u044C mw-\u0444\u0430\u0439\u043B \u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u044C";
          }
        }
      });
    }
    function handleKey(e) {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", handleKey);
        overlay.remove();
      }
    }
    document.addEventListener("keydown", handleKey);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    renderModal();
  }
  function getTargetServiceFilename(rulesDir, name) {
    const dir = rulesDir ? rulesDir.replace(/[\\/]$/, "") : "rules";
    const slug = (name || "service").replace(/[^a-z0-9\-]/g, "-");
    return dir ? `${dir}/ser-${slug}.yml` : `ser-${slug}.yml`;
  }
  function getTargetMiddlewareFilename(rulesDir, name) {
    const dir = rulesDir ? rulesDir.replace(/[\\/]$/, "") : "rules";
    let slug = (name || "middleware").replace(/[^a-z0-9\-]/g, "-");
    if (!slug.startsWith("mw-")) {
      slug = `mw-${slug}`;
    }
    return dir ? `${dir}/${slug}.yml` : `${slug}.yml`;
  }
  function escapeHtml3(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // src/index.ts
  var StudioFsProvider = class {
    async listFiles() {
      const fileSet = /* @__PURE__ */ new Set();
      try {
        const visited = /* @__PURE__ */ new Set();
        const scanDir = async (dirPath, depth = 0) => {
          if (depth > 4 || visited.has(dirPath)) return;
          visited.add(dirPath);
          const url = dirPath ? `/api/fs/tree?path=${encodeURIComponent(dirPath)}` : "/api/fs/tree";
          const res = await fetch(url, {
            headers: { "X-ConfigStudio-Web": "1" }
          });
          if (!res.ok) return;
          const data = await res.json();
          const items = data.items || [];
          for (const item of items) {
            if (item.isDir) {
              const name = (item.name || "").toLowerCase();
              if (name.startsWith(".") || name === "node_modules" || name === "bin" || name === "dist" || name === "data" || name === "tmp" || name === "coverage") {
                continue;
              }
              await scanDir(item.path || `${dirPath ? dirPath + "/" : ""}${item.name}`, depth + 1);
            } else if (item.path) {
              const lower = item.path.toLowerCase();
              if (lower.endsWith(".yml") || lower.endsWith(".yaml")) {
                fileSet.add(item.path.replace(/\\/g, "/"));
              }
            }
          }
        };
        await scanDir("");
      } catch (e) {
        console.warn("[TraefikPlugin] Tree walk error:", e);
      }
      try {
        const searchRes = await fetch("/api/fs/search?q=.yml", {
          headers: { "X-ConfigStudio-Web": "1" }
        });
        if (searchRes.ok) {
          const data = await searchRes.json();
          for (const item of data.items || []) {
            const p = (item.path || item.name || "").replace(/\\/g, "/");
            const lower = p.toLowerCase();
            if (lower.endsWith(".yml") || lower.endsWith(".yaml")) {
              fileSet.add(p);
            }
          }
        }
      } catch (_) {
      }
      return Array.from(fileSet);
    }
    async readFile(path) {
      const normPath = path.replace(/\\/g, "/");
      try {
        const res = await fetch(`/api/fs/file?path=${encodeURIComponent(normPath)}`, {
          headers: { "X-ConfigStudio-Web": "1" }
        });
        if (res.ok) {
          const data = await res.json();
          return data.content || "";
        }
      } catch (_) {
      }
      if (normPath.includes(":")) {
        try {
          const stripped = normPath.split(":").pop() || normPath;
          const res = await fetch(`/api/fs/file?path=${encodeURIComponent(stripped)}`, {
            headers: { "X-ConfigStudio-Web": "1" }
          });
          if (res.ok) {
            const data = await res.json();
            return data.content || "";
          }
        } catch (_) {
        }
      }
      return "";
    }
  };
  (function initTraefikPlugin() {
    const cs = window.ConfigStudio;
    if (!cs) {
      console.warn("[TraefikPlugin] ConfigStudio global API not found.");
      return;
    }
    const fs = new StudioFsProvider();
    const indexer = new TraefikWorkspaceIndexer(fs);
    function updateEditorMarkers(editor, monacoInstance) {
      if (!editor || !monacoInstance) return;
      const model = editor.getModel?.();
      if (!model) return;
      const activeFile = cs.getActiveFile?.();
      const filePath = (activeFile?.path || activeFile?.name || "").replace(/\\/g, "/");
      if (!filePath.endsWith(".yml") && !filePath.endsWith(".yaml")) {
        monacoInstance.editor?.setModelMarkers?.(model, "traefik", []);
        return;
      }
      const index = indexer.getIndex();
      if (!index || !index.issues) return;
      const markers = [];
      const fileName = filePath.split("/").pop() || "";
      const fileIssues = index.issues.filter((issue) => {
        const issueFile = issue.file.replace(/\\/g, "/");
        const issueBase = issueFile.split("/").pop() || "";
        return issueFile === filePath || issueFile.endsWith(filePath) || filePath.endsWith(issueFile) || issueBase === fileName;
      });
      fileIssues.forEach((issue) => {
        const line = Math.max(1, Math.min(issue.line, model.getLineCount()));
        const lineContent = model.getLineContent(line);
        const firstNonWs = lineContent.search(/\S/);
        const startCol = firstNonWs >= 0 ? firstNonWs + 1 : 1;
        const endCol = Math.max(startCol + 1, lineContent.length + 1);
        markers.push({
          severity: issue.severity === "error" ? monacoInstance.MarkerSeverity?.Error ?? 8 : monacoInstance.MarkerSeverity?.Warning ?? 4,
          code: issue.code,
          message: `[Traefik Linter] ${issue.code}: ${issue.message}`,
          startLineNumber: line,
          startColumn: startCol,
          endLineNumber: line,
          endColumn: endCol
        });
      });
      monacoInstance.editor?.setModelMarkers?.(model, "traefik", markers);
    }
    indexer.scanWorkspace().then((index) => {
      console.log(
        `[TraefikPlugin] Indexed ${index.routers.size} routers, ${index.middlewares.size} middlewares, ${index.services.size} services, ${index.issues.length} issues.`
      );
      const ed = cs.getEditor?.();
      const m = cs.getMonaco?.();
      if (ed && m) updateEditorMarkers(ed, m);
    });
    cs.onFileSave?.((file) => {
      const ext = (file?.name || file?.path || "").toLowerCase();
      if (ext.endsWith(".yml") || ext.endsWith(".yaml")) {
        indexer.scanWorkspace().then(() => {
          const ed = cs.getEditor?.();
          const m = cs.getMonaco?.();
          if (ed && m) updateEditorMarkers(ed, m);
        });
      }
    });
    cs.onFileOpen?.((file) => {
      const ext = (file?.name || file?.path || "").toLowerCase();
      if (ext.endsWith(".yml") || ext.endsWith(".yaml")) {
        setTimeout(() => {
          const ed = cs.getEditor?.();
          const m = cs.getMonaco?.();
          if (ed && m) updateEditorMarkers(ed, m);
        }, 150);
      }
    });
    const outlineProvider = createTraefikOutlineProvider();
    cs.registerOutlineProvider?.(outlineProvider);
    cs.registerOutlineProvider?.({
      ...outlineProvider,
      language: "yml"
    });
    function hookEditorInstance(editor, monacoInstance) {
      if (!editor || editor.__cs_traefik_hooked) return;
      editor.__cs_traefik_hooked = true;
      editor.onDidChangeModel?.(() => {
        updateEditorMarkers(editor, monacoInstance);
      });
      editor.onMouseDown?.((e) => {
        if (e.event?.detail === 2 || e.event?.ctrlKey || e.event?.metaKey) {
          const pos = e.target?.position;
          if (!pos) return;
          const model = editor.getModel?.();
          if (!model) return;
          const line = model.getLineContent(pos.lineNumber);
          const token = extractTokenAtPosition(line, pos.column);
          if (!token) return;
          const def = indexer.findDefinition(token.cleanRef) || indexer.findDefinition(token.rawToken);
          if (def && cs.openFile) {
            e.event?.preventDefault?.();
            cs.openFile(def.file, { line: def.line, highlight: true });
            cs.showNotification?.(`\u041F\u0435\u0440\u0435\u0445\u043E\u0434 \u043A \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044E ${token.cleanRef} (${def.file}:${def.line})`, "info");
          }
        }
      });
      editor.addAction?.({
        id: "cs-traefik-goto-definition",
        label: "Traefik: \u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044E",
        keybindings: monacoInstance?.KeyMod?.CtrlCmd ? [monacoInstance.KeyMod.CtrlCmd | 123, 123] : [123],
        contextMenuGroupId: "navigation",
        contextMenuOrder: 1.5,
        run: (ed) => {
          const pos = ed.getPosition?.();
          if (!pos) return;
          const model = ed.getModel?.();
          if (!model) return;
          const line = model.getLineContent(pos.lineNumber);
          const token = extractTokenAtPosition(line, pos.column);
          if (!token) return;
          const def = indexer.findDefinition(token.cleanRef) || indexer.findDefinition(token.rawToken);
          if (def && cs.openFile) {
            cs.openFile(def.file, { line: def.line, highlight: true });
            cs.showNotification?.(`\u041F\u0435\u0440\u0435\u0445\u043E\u0434 \u043A ${token.cleanRef} \u0432 ${def.file}:${def.line}`, "info");
          } else {
            cs.showNotification?.(`\u041E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0434\u043B\u044F '${token.cleanRef}' \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E`, "error");
          }
        }
      });
    }
    const monaco = cs.getMonaco?.();
    if (monaco) {
      setupMonacoTraefik(monaco, indexer);
      const initialEditor = cs.getEditor?.();
      if (initialEditor) hookEditorInstance(initialEditor, monaco);
    } else {
      const checkMonaco = setInterval(() => {
        const m = cs.getMonaco?.();
        if (m) {
          setupMonacoTraefik(m, indexer);
          const ed = cs.getEditor?.();
          if (ed) hookEditorInstance(ed, m);
          clearInterval(checkMonaco);
        }
      }, 500);
      setTimeout(() => clearInterval(checkMonaco), 1e4);
    }
    setInterval(() => {
      const ed = cs.getEditor?.();
      const m = cs.getMonaco?.();
      if (ed) {
        hookEditorInstance(ed, m);
        updateEditorMarkers(ed, m);
      }
    }, 2e3);
    cs.registerToolbarButton?.({
      id: "cs-btn-traefik-matrix",
      pluginId: "traefik",
      label: "Traefik Matrix",
      title: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u041C\u0430\u0442\u0440\u0438\u0446\u0443 \u043F\u0440\u0430\u0432\u0438\u043B \u0438 \u0441\u0435\u0440\u0432\u0438\u0441\u043E\u0432 Traefik",
      icon: "network",
      onClick: () => {
        openMatrixModal(
          indexer,
          () => openWizardModal(indexer),
          () => openDoctorModal(indexer, () => openMatrixModal(indexer, () => openWizardModal(indexer)))
        );
      }
    });
    cs.registerToolbarButton?.({
      id: "cs-btn-traefik-doctor",
      pluginId: "traefik",
      label: "Traefik Doctor",
      title: "\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0443 Traefik Doctor (\u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0430\u0443\u0434\u0438\u0442 \u0438 Traefik API)",
      icon: "check-circle",
      onClick: () => {
        openDoctorModal(
          indexer,
          () => openMatrixModal(
            indexer,
            () => openWizardModal(indexer),
            () => openDoctorModal(indexer)
          )
        );
      }
    });
    cs.registerToolbarButton?.({
      id: "cs-btn-traefik-dashboard",
      pluginId: "traefik",
      label: "Dashboard",
      title: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C Web UI Traefik Dashboard \u0432 \u043D\u043E\u0432\u043E\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0435",
      icon: "terminal",
      onClick: () => {
        const apiUrl = localStorage.getItem("cs_traefik_api_url") || "http://localhost:8080";
        const dashboardUrl = `${apiUrl.replace(/\/+$/, "")}/dashboard/`;
        window.open(dashboardUrl, "_blank");
      }
    });
    cs.registerContextMenu?.({
      id: "cs-ctx-traefik-matrix",
      label: "Traefik: \u041C\u0430\u0442\u0440\u0438\u0446\u0430 \u043F\u0440\u0430\u0432\u0438\u043B",
      icon: "network",
      group: "tools",
      order: 40,
      fileMatches: [".yml", ".yaml"],
      targetType: "any",
      onClick: () => {
        openMatrixModal(
          indexer,
          () => openWizardModal(indexer),
          () => openDoctorModal(indexer)
        );
      }
    });
    cs.registerContextMenu?.({
      id: "cs-ctx-traefik-doctor",
      label: "Traefik: Doctor (\u0414\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0430)",
      icon: "check-circle",
      group: "tools",
      order: 41,
      fileMatches: [".yml", ".yaml"],
      targetType: "any",
      onClick: () => {
        openDoctorModal(
          indexer,
          () => openMatrixModal(
            indexer,
            () => openWizardModal(indexer),
            () => openDoctorModal(indexer)
          )
        );
      }
    });
    cs.registerContextMenu?.({
      id: "cs-ctx-traefik-wizard",
      label: "Traefik: \u041D\u043E\u0432\u044B\u0439 \u0441\u0435\u0440\u0432\u0438\u0441 / \u0420\u0435\u0446\u0435\u043F\u0442",
      icon: "plus",
      group: "edit",
      order: 42,
      fileMatches: [".yml", ".yaml"],
      targetType: "any",
      onClick: () => {
        openWizardModal(indexer);
      }
    });
    cs.registerContextMenu?.({
      id: "cs-ctx-traefik-dashboard",
      label: "Traefik: \u041E\u0442\u043A\u0440\u044B\u0442\u044C Dashboard",
      icon: "terminal",
      group: "view",
      order: 43,
      fileMatches: [".yml", ".yaml"],
      targetType: "any",
      onClick: () => {
        const apiUrl = localStorage.getItem("cs_traefik_api_url") || "http://localhost:8080";
        const dashboardUrl = `${apiUrl.replace(/\/+$/, "")}/dashboard/`;
        window.open(dashboardUrl, "_blank");
      }
    });
    if (cs.services?.register) {
      cs.services.register(
        "traefik-manager",
        {
          getIndex: () => indexer.getIndex(),
          scanWorkspace: () => indexer.scanWorkspace(),
          findDefinition: (ref) => indexer.findDefinition(ref),
          openMatrix: () => openMatrixModal(
            indexer,
            () => openWizardModal(indexer),
            () => openDoctorModal(indexer)
          ),
          openWizard: (mode) => openWizardModal(indexer, void 0, mode || "service"),
          openDoctor: () => openDoctorModal(
            indexer,
            () => openMatrixModal(
              indexer,
              () => openWizardModal(indexer),
              () => openDoctorModal(indexer)
            )
          ),
          openDashboard: (customUrl) => {
            const apiUrl = customUrl || localStorage.getItem("cs_traefik_api_url") || "http://localhost:8080";
            const dashboardUrl = `${apiUrl.replace(/\/+$/, "")}/dashboard/`;
            window.open(dashboardUrl, "_blank");
          }
        },
        "traefik"
      );
    }
    console.log("[TraefikPlugin] Traefik Dynamic Configuration Plugin initialized successfully.");
  })();
})();
