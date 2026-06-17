/**
 * obsidian-knowledge-brain
 * 插件入口 — Obsidian 插件生命周期 + 窗口钩子 + CLI 接口
 *
 * v2: 暴露 linker / extractor / persistence 三大能力
 */

import { Plugin } from 'obsidian'
import { brain, Rule, ExperienceExtract, WindowEvent } from './core'
import { analyzeSession, AnalysisResult, quickScan, LogEntry } from './extractor'
import { linkRuleToKnowledge, relateToExistingRules, suggestVaultWrite, KNOWLEDGE_FRAMEWORK } from './linker'

export default class KnowledgeBrainPlugin extends Plugin {
  private sessionLogs: LogEntry[] = []

  async onload() {
    console.log('[KB] 知识大脑 v2 加载完成')

    // 初始化：加载 vault 路径 + 默认规则
    const vaultBase = (this.app.vault.adapter as any).getBasePath()
    brain.setVaultPath(`${vaultBase}/知识大脑`)
    brain.loadAllRules()

    // ===== 窗口钩子 =====

    this.registerEvent(
      this.app.workspace.on('quit', () => this.handleWindowClose())
    )

    // 文件切换 = 开窗
    this.registerEvent(
      this.app.workspace.on('file-open', () => this.handleWindowOpen())
    )

    // ===== 命令注册 =====

    this.addCommand({
      id: 'window-close-and-save',
      name: '关窗收经验',
      callback: () => this.handleWindowClose(),
    })

    this.addCommand({
      id: 'window-open-load-rules',
      name: '开窗载入规则',
      callback: () => this.handleWindowOpen(),
    })

    this.addCommand({
      id: 'rules-dedup',
      name: '规则去重',
      callback: () => {
        const result = brain.dedupAll()
        const msg = `去重完成: 合并 ${result.merged} 条，标记 ${result.removed} 条`
        console.log(`[KB] ${msg}`)
      },
    })

    this.addCommand({
      id: 'rules-list',
      name: '列出当前规则',
      callback: () => {
        const rules = brain.exportRules()
        const msg = `共 ${rules.length} 条规则\n${rules.filter(r => !r.merged_with).map(r => `  - ${r.id}: ${r.root_cause.slice(0, 30)}...`).join('\n')}`
        console.log(msg)
      },
    })

    this.addCommand({
      id: 'rules-export-to-vault',
      name: '导出规则到 vault',
      callback: () => this.exportRulesToVault(),
    })

    this.addCommand({
      id: 'session-analyze',
      name: '分析当前 session',
      callback: () => this.analyzeCurrentSession(),
    })

    this.addCommand({
      id: 'knowledge-framework-status',
      name: '知识框架状态',
      callback: () => {
        const sections = KNOWLEDGE_FRAMEWORK.sections
        const msg = `知识框架: ${sections.length} 个章节\n${sections.map(s => `  - [${s.id}] ${s.name}`).join('\n')}`
        console.log(msg)
      },
    })

    // 开窗自动加载
    this.handleWindowOpen()

    console.log('[KB] 命令注册完成: 关窗收经验 / 开窗载入规则 / 规则去重 / 列出规则 / 导出规则 / 分析session')
  }

  // ===== 窗口事件处理 =====

  handleWindowOpen() {
    const activeNote = this.app.workspace.getActiveFile()
    if (!activeNote) return

    const context = { thread: activeNote.path }
    const rules = brain.windowOpen(context)
    console.log(`[KB] 开窗: ${activeNote.path}`)
    console.log(`[KB] 激活规则: ${rules.length} 条`)

    // 写入文件元数据
    if (rules.length > 0) {
      const summary = rules.map(r => `- ${r.root_cause} → ${r.fix}`).join('\n')
      console.log(`[KB] 当前规则摘要:\n${summary}`)
    }
  }

  handleWindowClose() {
    console.log('[KB] 窗口关闭，开始收经验...')

    if (this.sessionLogs.length < 2) {
      console.log('[KB] 日志太少，跳过提取')
      this.sessionLogs = []
      return
    }

    this.analyzeCurrentSession()

    // 清空 session 日志，准备下次
    this.sessionLogs = []
  }

  // ===== 核心功能 =====

  analyzeCurrentSession() {
    console.log(`[KB] 分析 session (${this.sessionLogs.length} 条日志)`)
    console.log(`[KB] 最后 3 条:\n${this.sessionLogs.slice(-3).map(l => `  [${l.speaker}] ${l.content.slice(0, 60)}`).join('\n')}`)

    if (this.sessionLogs.length < 2) {
      console.log('[KB] 日志不足 2 条，跳过分析')
      return
    }

    const results = analyzeSession(this.sessionLogs)

    if (results.length === 0) {
      console.log('[KB] 本次无经验可提取')
      return
    }

    console.log(`[KB] 发现 ${results.length} 个可提取模式:`)
    for (const result of results) {
      console.log(`  [${result.severity.toUpperCase()}] ${result.root_cause.slice(0, 50)}...`)
      console.log(`    → ${result.fix.slice(0, 60)}...`)
      console.log(`    置信度: ${Math.round(result.confidence * 100)}%`)
    }

    // 自动入库高置信度的经验
    const extracts: ExperienceExtract[] = results
      .filter(r => r.confidence >= 0.5)
      .map(r => ({
        raw_event: r.evidence.join(' | ') || 'session analysis',
        root_cause: r.root_cause,
        proposed_rule: {
          scenario: r.evidence[0] || '',
          fix: r.fix,
          applies_to: extractAppliesTo(r.root_cause),
        },
        confidence: r.confidence,
      }))

    if (extracts.length > 0) {
      const newRules = brain.windowClose(extracts)
      console.log(`[KB] 自动入库 ${newRules.length} 条新规则`)

      // 对新规则做知识关联
      for (const rule of newRules) {
        const links = linkRuleToKnowledge(rule)
        console.log(`[KB] 规则 ${rule.id} → 关联到: ${links.map(l => l.section_name).join(', ') || '无匹配章节'}`)
      }
    }
  }

  /**
   * 手动添加一条日志
   */
  logConversation(speaker: string, content: string) {
    this.sessionLogs.push({
      turn: this.sessionLogs.length + 1,
      speaker,
      content,
      timestamp: new Date().toISOString(),
    })

    // 实时扫描
    const signals = quickScan(content)
    if (signals.length > 0) {
      console.log(`[KB] 实时信号: ${signals.map(s => `[${s.name}]`).join(' ')}`)
    }
  }

  /**
   * 导出规则到 vault 作为 markdown 文件
   */
  async exportRulesToVault() {
    const rulesDir = '知识大脑/规则库'
    const writes = brain.exportAllRulesForWrite(rulesDir)

    for (const { path, content } of writes) {
      try {
        const exists = await this.app.vault.adapter.exists(path)
        if (!exists) {
          await this.app.vault.adapter.write(path, content)
          console.log(`[KB] 写入: ${path}`)
        }
      } catch (e) {
        console.log(`[KB] 写入失败: ${path} — ${e}`)
      }
    }

    console.log(`[KB] 导出完成: ${writes.length} 条规则`)
  }

  // ===== 训练闭环接口 =====

  /**
   * 记录用户修正，用于训练迭代
   */
  logUserCorrection(originalOutput: string, userCorrection: string) {
    this.logConversation('user', `纠正: ${userCorrection}`)

    const training = extractAppliesTo(originalOutput)
    const correctionType = originalOutput.length > userCorrection.length
      ? '精简优化'
      : userCorrection.length > originalOutput.length * 1.2
        ? '补充完善'
        : '方向修正'

    console.log(`[KB] 训练闭环: ${correctionType}`)
    console.log(`[KB] 原始: ${originalOutput.slice(0, 60)}...`)
    console.log(`[KB] 修正: ${userCorrection.slice(0, 60)}...`)
  }

  onunload() {
    console.log('[KB] 知识大脑 v2 卸载')
  }
}

// ========== 辅助 ==========

function extractAppliesTo(text: string): string[] {
  const topics: string[] = []
  const topicMap: Record<string, string[]> = {
    '流程': ['流程管理'],
    '搜索': ['话术库', '知识库'],
    '进攻': ['拉升', '升高'],
    '安全': ['窗口管理'],
    '延伸': ['延伸vs曲解'],
    '曲解': ['延伸vs曲解'],
    'IOI': ['IOI识别'],
    '归属': ['归属确认'],
    '天门': ['天门模型'],
    '训练': ['训练闭环'],
    '入库': ['知识管理'],
  }

  for (const [keyword, tags] of Object.entries(topicMap)) {
    if (text.includes(keyword)) {
      topics.push(...tags)
    }
  }

  return [...new Set(topics)]
}
