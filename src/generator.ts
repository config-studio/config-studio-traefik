import { NewServiceConfig } from './types';

export function generateServiceYaml(config: NewServiceConfig): string {
  const routerId = config.enableTls ? `${config.name}-secure` : config.name;
  const serviceId = `${config.name}-svc`;

  let mwLines = '';
  if (config.middlewares && config.middlewares.length > 0) {
    mwLines = `      middlewares:\n` + config.middlewares.map((m) => `        - "${m}"`).join('\n') + '\n';
  }

  let tlsBlock = '';
  if (config.enableTls) {
    if (config.certResolver) {
      tlsBlock = `      tls:\n        certResolver: "${config.certResolver}"\n`;
    } else {
      tlsBlock = `      tls: {}\n`;
    }
  }

  const yaml = `http:
  routers:
    ${routerId}:
      rule: "Host(\`${config.host}\`)"
      entryPoints:
        - "${config.entryPoint || 'websecure'}"
${mwLines}      service: "${serviceId}"
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
