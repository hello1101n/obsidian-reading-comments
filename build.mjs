import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await build({ entryPoints: ['src/main.ts'], outfile: 'main.js', bundle: true, platform: 'browser', format: 'cjs', target: 'es2022', external: ['obsidian'], sourcemap: false });
await mkdir('dist/reading-comments', { recursive: true });
for (const name of ['main.js', 'manifest.json', 'styles.css']) await copyFile(name, `dist/reading-comments/${name}`);
