const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dist = path.join(__dirname, 'dist-pkg');
if (fs.existsSync(dist)) fs.rmSync(dist, { recursive: true });
fs.mkdirSync(dist);

const requiredFiles = ['plugin.json', 'main.js', 'style.css', 'README.md'];
for (const file of requiredFiles) {
  const src = path.join(__dirname, file);
  if (!fs.existsSync(src)) {
    console.error(`Missing required file: ${file}`);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(dist, file));
}

const csDir = path.join(__dirname, '..', 'config-studio');
const pluginJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'plugin.json'), 'utf8'));
const version = pluginJson.version || '1.1.0';
const pkgVersioned = path.join(__dirname, `traefik-${version}.cspkg`);
const pkgLatest = path.join(__dirname, 'traefik.cspkg');

console.log(`[Pack] Packaging v${version} with cspkg CLI...`);
execSync(`go run ./cmd/cspkg pack "${dist}" -o "${pkgVersioned}"`, { cwd: csDir, stdio: 'inherit' });
fs.copyFileSync(pkgVersioned, pkgLatest);

// Also copy to config-studio-plugins repository
const pluginsPackagesDir = path.join(__dirname, '..', 'config-studio-plugins', 'packages');
if (fs.existsSync(pluginsPackagesDir)) {
  fs.copyFileSync(pkgVersioned, path.join(pluginsPackagesDir, `traefik-${version}.cspkg`));
  fs.copyFileSync(pkgVersioned, path.join(pluginsPackagesDir, 'traefik.cspkg'));
  console.log('[Pack] Copied package to config-studio-plugins/packages/');
}

fs.rmSync(dist, { recursive: true });
console.log('✓ Package created successfully!');
