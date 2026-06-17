const esbuild = require('esbuild')

const production = process.argv.includes('--production')

async function main() {
  // 构建 Obsidian 插件主文件 (main.js)
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    format: 'cjs',
    target: 'es2020',
    platform: 'browser',
    outfile: 'dist/main.js',
    external: ['obsidian'],
    sourcemap: production ? false : 'inline',
    treeShaking: true,
    minify: production,
    logLevel: 'info',
  })

  // 构建 CLI (独立文件，不打包 obsidian)
  await esbuild.build({
    entryPoints: ['src/cli.ts'],
    bundle: true,
    format: 'cjs',
    target: 'es2020',
    platform: 'node',
    outfile: 'dist/cli-bundle.js',
    external: ['obsidian'],
    sourcemap: false,
    treeShaking: true,
    minify: production,
    logLevel: 'info',
  })

  console.log('✅ 构建完成')
  console.log(`   dist/main.js      — Obsidian 插件`)
  console.log(`   dist/cli-bundle.js — CLI 命令行`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
