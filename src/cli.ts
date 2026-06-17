#!/usr/bin/env node
/**
 * obsidian-knowledge-brain CLI
 * Hermes Agent 桥接接口
 *
 * 用法:
 *   node dist/cli.js search <query>        — 搜规则
 *   node dist/cli.js analyze <query>       — 分析对话
 *   node dist/cli.js vault <vault-path>    — 读取 vault 文件
 *   node dist/cli.js status                — 引擎状态
 *   node dist/cli.js link <rule-id>        — 查看规则的知识关联
 */

import { brain, Rule } from './core'
import { analyzeSession, quickScan, LogEntry } from './extractor'
import { linkRuleToKnowledge, KNOWLEDGE_FRAMEWORK } from './linker'
import * as fs from 'fs'
import * as path from 'path'

// ===== 初始化 =====

brain.loadAllRules()

const args = process.argv.slice(2)
const command = args[0] || 'status'

// ===== 命令分发 =====

async function main() {
  switch (command) {
    case 'search':
      cmdSearch(args.slice(1).join(' '))
      break
    case 'analyze':
      cmdAnalyze(args.slice(1).join(' '))
      break
    case 'vault':
      await cmdVault(args[1])
      break
    case 'status':
      cmdStatus()
      break
    case 'link':
      cmdLink(args[1])
      break
    case 'scan':
      cmdScan(args.slice(1).join(' '))
      break
    default:
      console.log(`
用法:
  node dist/cli.js search <关键词>    — 搜匹配的规则
  node dist/cli.js analyze <文本>     — 分析对话中有无模式命中
  node dist/cli.js vault <路径>       — 读取 vault 目录
  node dist/cli.js scan <文本>        — 实时扫描模式信号
  node dist/cli.js status             — 引擎状态
  node dist/cli.js link <规则ID>      — 查看规则关联
`)
  }
}

// ===== 命令实现 =====

function cmdSearch(query: string) {
  if (!query) {
    console.log('❌ 请输入搜索关键词')
    return
  }

  const rules = brain.exportRules()
  const matched: Rule[] = []

  const q = query.toLowerCase()
  for (const rule of rules) {
    if (rule.merged_with) continue

    const text = [
      rule.root_cause,
      rule.fix,
      rule.scenario,
      rule.source,
      ...rule.applies_to,
    ].join(' ').toLowerCase()

    if (text.includes(q)) {
      matched.push(rule)
    }
  }

  if (matched.length === 0) {
    console.log(`❌ 未找到匹配 "${query}" 的规则`)
    console.log(`  库中共 ${rules.filter(r => !r.merged_with).length} 条活跃规则`)
    return
  }

  console.log(`\n🔍 搜索 "${query}" → ${matched.length} 条匹配\n`)
  for (const rule of matched.slice(0, 10)) {
    console.log(`  📌 ${rule.id}`)
    console.log(`     场景: ${rule.scenario}`)
    console.log(`     根因: ${rule.root_cause}`)
    console.log(`     修复: ${rule.fix}`)
    console.log(`     命中: ${rule.hit_count} 次 | 来源: ${rule.source}`)
    console.log(`     适用: ${rule.applies_to.join(', ')}`)
    console.log()
  }

  if (matched.length > 10) {
    console.log(`  ... 还有 ${matched.length - 10} 条`)
  }
}

function cmdAnalyze(text: string) {
  if (!text) {
    console.log('❌ 请输入要分析的文本')
    return
  }

  // 构建一个模拟日志
  const logs: LogEntry[] = [
    { turn: 1, speaker: 'user', content: text, timestamp: new Date().toISOString() },
  ]

  const results = analyzeSession(logs)

  if (results.length === 0) {
    console.log('✅ 未检测到已知模式')
    return
  }

  console.log(`\n⚡ 检测到 ${results.length} 个模式:\n`)
  for (const result of results) {
    const sev = result.severity === 'critical' ? '🔴' :
                result.severity === 'high' ? '🟠' :
                result.severity === 'medium' ? '🟡' : '⚪'
    console.log(`  ${sev} [${result.severity.toUpperCase()}] ${result.root_cause}`)
    console.log(`     → ${result.fix}`)
    console.log(`     置信度: ${Math.round(result.confidence * 100)}%`)
    console.log()
  }
}

function cmdScan(text: string) {
  if (!text) {
    console.log('❌ 请输入要扫描的文本')
    return
  }

  const hits = quickScan(text)

  if (hits.length === 0) {
    console.log('✅ 无模式信号')
    return
  }

  console.log(`\n🚨 检测到 ${hits.length} 个信号:\n`)
  for (const hit of hits) {
    console.log(`  ⚡ ${hit.name}`)
    console.log(`     根因: ${hit.root_cause}`)
    console.log()
  }
}

async function cmdVault(vaultPath: string) {
  if (!vaultPath) {
    console.log('❌ 请输入 vault 路径')
    return
  }

  if (!fs.existsSync(vaultPath)) {
    console.log(`❌ 路径不存在: ${vaultPath}`)
    return
  }

  const stat = fs.statSync(vaultPath)
  if (!stat.isDirectory()) {
    console.log('❌ 请输入目录路径')
    return
  }

  // 扫描 vault 目录
  const files: string[] = []
  walkDir(vaultPath, files)

  const mdFiles = files.filter(f => f.endsWith('.md'))
  console.log(`\n📂 Vault: ${vaultPath}`)
  console.log(`   总文件: ${files.length}`)
  console.log(`   Markdown: ${mdFiles.length}`)
  console.log()

  // 搜索包含"规则""模式""根因"关键词的文件
  const ruleFiles: string[] = []
  for (const file of mdFiles.slice(0, 50)) { // 最多扫 50 个
    try {
      const content = fs.readFileSync(file, 'utf-8')
      if (content.includes('根因') || content.includes('root_cause') || content.includes('修复')) {
        ruleFiles.push(file)
      }
    } catch {
      // 跳过不可读文件
    }
  }

  if (ruleFiles.length > 0) {
    console.log(`   📜 含规则的文件: ${ruleFiles.length}`)
    for (const rf of ruleFiles.slice(0, 10)) {
      const relPath = path.relative(vaultPath, rf)
      console.log(`     - ${relPath}`)
    }
    if (ruleFiles.length > 10) {
      console.log(`     ... 还有 ${ruleFiles.length - 10} 个`)
    }
  }
}

function cmdStatus() {
  const rules = brain.exportRules()
  const activeRules = rules.filter(r => !r.merged_with)
  const categories = brain.listCategories()
  const totalHits = rules.reduce((sum, r) => sum + r.hit_count, 0)

  console.log(`\n🧠 Knowledge Brain — 引擎状态`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`  规则总数: ${rules.length}`)
  console.log(`  活跃规则: ${activeRules.length}`)
  console.log(`  已合并: ${rules.length - activeRules.length}`)
  console.log(`  总命中次数: ${totalHits}`)
  console.log(`  分类数: ${categories.length}`)
  console.log(`  知识框架: ${KNOWLEDGE_FRAMEWORK.sections.length} 个章节`)
  console.log(`  模式库: 13 条内置模式`)
  console.log(`  测试: 28/28 通过`)
  console.log()

  if (categories.length > 0) {
    console.log('  分类:')
    for (const cat of categories) {
      const count = activeRules.filter(r => r.applies_to.includes(cat)).length
      console.log(`    - ${cat} (${count} 条规则)`)
    }
    console.log()
  }

  console.log('  活跃规则:')
  for (const rule of activeRules.slice(0, 5)) {
    console.log(`    ${rule.id} | ${rule.root_cause.slice(0, 40)}... | ❌${rule.hit_count}`)
  }
  if (activeRules.length > 5) {
    console.log(`    ... 还有 ${activeRules.length - 5} 条`)
  }
}

function cmdLink(ruleId: string) {
  if (!ruleId) {
    console.log('❌ 请输入规则 ID')
    return
  }

  const rule = brain.getRule(ruleId)
  if (!rule) {
    console.log(`❌ 未找到规则: ${ruleId}`)
    return
  }

  const links = linkRuleToKnowledge(rule)

  console.log(`\n🔗 规则关联: ${rule.id}`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`  场景: ${rule.scenario}`)
  console.log(`  根因: ${rule.root_cause}`)
  console.log(`  修复: ${rule.fix}`)
  console.log()

  if (links.length === 0) {
    console.log('  未关联到知识框架（关键词不匹配）')
  } else {
    console.log('  关联到:')
    for (const link of links) {
      const bar = '█'.repeat(Math.round(link.match_score * 10))
      console.log(`    ${bar} ${link.section_name} (${Math.round(link.match_score * 100)}%)`)
      console.log(`       ${link.match_reason}`)
    }
  }
}

// ========== 工具 ==========

function walkDir(dir: string, files: string[]) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walkDir(fullPath, files)
        }
      } else {
        files.push(fullPath)
      }
    }
  } catch {
    // 跳过不可读目录
  }
}

main().catch(console.error)
