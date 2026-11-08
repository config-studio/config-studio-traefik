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
const pkg1 = path.join(__dirname, 'traefik-1.0.0.cspkg');
const pkgLatest = path.join(__dirname, 'traefik.cspkg');

console.log('[Pack] Packaging with cspkg CLI...');
execSync(`go run ./cmd/cspkg pack "${dist}" -o "${pkg1}"`, { cwd: csDir, stdio: 'inherit' });
fs.copyFileSync(pkg1, pkgLatest);

// Also copy to config-studio-plugins repository
const pluginsPackagesDir = path.join(__dirname, '..', 'config-studio-plugins', 'packages');
if (fs.existsSync(pluginsPackagesDir)) {
  fs.copyFileSync(pkg1, path.join(pluginsPackagesDir, 'traefik-1.0.0.cspkg'));
  fs.copyFileSync(pkg1, path.join(pluginsPackagesDir, 'traefik.cspkg'));
  console.log('[Pack] Copied package to config-studio-plugins/packages/');
}

fs.rmSync(dist, { recursive: true });
console.log('✓ Package created successfully!');
