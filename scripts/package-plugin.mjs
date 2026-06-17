#!/usr/bin/env node
/**
 * Obsidian 插件打包脚本
 * 生成 plugin.zip 供安装到 .obsidian/plugins/
 */

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const DIST = path.join(ROOT, 'dist')
const RELEASE = path.join(ROOT, 'release')
const PLUGIN_DIR = path.join(RELEASE, 'knowledge-brain')

// 清理并重建 release 目录
if (fs.existsSync(RELEASE)) {
  fs.rmSync(RELEASE, { recursive: true })
}
fs.mkdirSync(PLUGIN_DIR, { recursive: true })

// 复制文件
const files = [
  ['dist/main.js', 'main.js'],
  ['manifest.json', 'manifest.json'],
]

for (const [src, dest] of files) {
  const srcPath = path.join(ROOT, src)
  if (!fs.existsSync(srcPath)) {
    console.error(`❌ 缺少文件: ${src}`)
    process.exit(1)
  }
  fs.copyFileSync(srcPath, path.join(PLUGIN_DIR, dest))
  console.log(`  ✅ ${src} → release/knowledge-brain/${dest}`)
}

// 如果存在 styles.css 也复制
const stylesPath = path.join(ROOT, 'styles.css')
if (fs.existsSync(stylesPath)) {
  fs.copyFileSync(stylesPath, path.join(PLUGIN_DIR, 'styles.css'))
  console.log('  ✅ styles.css → release/knowledge-brain/styles.css')
}

// 生成 hot-reload 标记（开发用）
const hotReload = path.join(PLUGIN_DIR, '.hot-reload')
fs.writeFileSync(hotReload, '')
console.log('  ✅ .hot-reload (开发热重载标记)')

// 检查 main.js 大小
const stats = fs.statSync(path.join(PLUGIN_DIR, 'main.js'))
console.log(`\n📦 插件大小: ${(stats.size / 1024).toFixed(1)} KB`)

// 创建 zip
const zipPath = path.join(RELEASE, 'knowledge-brain-plugin.zip')
const { execSync } = await import('child_process')
try {
  execSync(`cd "${PLUGIN_DIR}/.." && zip -r "${zipPath}" knowledge-brain/`, { stdio: 'pipe' })
  const zipStats = fs.statSync(zipPath)
  console.log(`📦 ZIP 包: ${(zipStats.size / 1024).toFixed(1)} KB → release/knowledge-brain-plugin.zip`)
} catch {
  console.log('⚠️  zip 未安装，跳过压缩')
}

console.log('\n🎉 打包完成！')
console.log(`   插件目录: ${PLUGIN_DIR}`)
console.log(`   安装方式: 复制 knowledge-brain/ 到你的 .obsidian/plugins/ 目录`)
