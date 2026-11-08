const esbuild = require('esbuild');
const path = require('path');

async function build() {
  console.log('[Build] Building Traefik Plugin bundle...');
  try {
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'src', 'index.ts')],
      bundle: true,
      outfile: path.join(__dirname, 'main.js'),
      format: 'iife',
      globalName: 'ConfigStudioTraefikPlugin',
      target: ['es2020'],
      platform: 'browser',
      sourcemap: false,
    });
    console.log('[Build] Successfully generated main.js');
  } catch (err) {
    console.error('[Build] Build failed:', err);
    process.exit(1);
  }
}

build();
