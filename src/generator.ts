import { NewServiceConfig } from './types';

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
