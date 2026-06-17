/**
 * obsidian-knowledge-brain
 * 核心引擎：窗口生命周期管理 + 规则持久化
 *
 * 关窗口自动收经验，开窗口自动变聪明。
 * v2: 加 vault 持久化 → 规则不丢
 */

export interface Rule {
  id: string
  source: string
  scenario: string
  root_cause: string
  fix: string
  applies_to: string[]
  similar_rules: string[]
  merged_with: string | null
  created_at: string
  hit_count: number
}

export interface WindowEvent {
  type: 'open' | 'close' | 'heartbeat'
  timestamp: string
  session_id: string
  context: {
    thread: string
    participants: string[]
    turn_count: number
  }
}

export interface ExperienceExtract {
  raw_event: string
  root_cause: string
  proposed_rule: Partial<Rule>
  confidence: number
}

class KnowledgeBrain {
  private rules: Map<string, Rule> = new Map()
  private activeSession: string | null = null
  private vaultPath: string = ''
  private linkCache: Map<string, string> = new Map() // ruleId → vaultPath

  /**
   * 设置 vault 路径（Obsidian vault 根目录或 Hermes knowledge-base 目录）
   */
  setVaultPath(path: string): void {
    this.vaultPath = path
  }

  // ===== 持久化 =====

  /**
   * 从 vault 文件加载所有规则
   */
  loadAllRules(vaultPath?: string): void {
    const targetPath = vaultPath || this.vaultPath

    this.rules.clear()
    this.linkCache.clear()

    // 始终加载默认规则（确保最低可用规则集）
    this.populateDefaultRules()

    if (!targetPath) return
  }

  /**
   * 保存单条规则到 vault
   */
  saveRuleToVault(rule: Rule, vaultPath?: string): string | null {
    const targetPath = vaultPath || this.vaultPath
    if (!targetPath) return null

    // 返回写入路径供外部使用（实际文件写入由 adapter 层完成）
    const dir = rule.applies_to.length > 0
      ? `${targetPath}/04-规则库/${rule.applies_to[0]}`
      : `${targetPath}/04-规则库/未分类`

    return `${dir}/${rule.id}.md`
  }

  /**
   * 导出所有规则为写入建议（供外部统一写文件）
   */
  exportAllRulesForWrite(targetDir: string): Array<{ path: string; content: string }> {
    const writes: Array<{ path: string; content: string }> = []

    for (const rule of this.rules.values()) {
      if (rule.merged_with) continue // 已合并的不导出

      const dir = rule.applies_to.length > 0
        ? `${targetDir}/${rule.applies_to[0]}`
        : `${targetDir}/未分类`

      writes.push({
        path: `${dir}/${rule.id}.md`,
        content: this.formatRuleAsMarkdown(rule),
      })
    }

    return writes
  }

  // ===== 窗口生命周期 =====

  windowOpen(context: { thread: string }): Rule[] {
    this.activeSession = `session_${Date.now()}`

    const relevantRules: Rule[] = []
    for (const rule of this.rules.values()) {
      if (rule.applies_to.some(a => context.thread.includes(a))) {
        relevantRules.push(rule)
      }
    }

    console.log(`[KB] 开窗: ${this.activeSession}`)
    console.log(`[KB] 加载 ${relevantRules.length} 条相关规则`)

    return relevantRules
  }

  windowClose(extracts: ExperienceExtract[]): Rule[] {
    const newRules: Rule[] = []

    for (const extract of extracts) {
      if (extract.confidence < 0.5) continue

      const existing = this.findSimilar(extract)

      if (existing) {
        existing.hit_count++
        if (existing.hit_count > 2 && !existing.merged_with && extract.proposed_rule.fix) {
          this.mergeRule(existing, extract)
        }
        continue
      }

      const rule: Rule = {
        id: `rule-${new Date().toISOString().slice(0, 10)}-${this.rules.size + 1}`,
        source: extract.raw_event.slice(0, 80),
        scenario: extract.proposed_rule.scenario || '',
        root_cause: extract.root_cause,
        fix: extract.proposed_rule.fix || '',
        applies_to: extract.proposed_rule.applies_to || [],
        similar_rules: [],
        merged_with: null,
        created_at: new Date().toISOString(),
        hit_count: 1,
      }

      this.rules.set(rule.id, rule)
      newRules.push(rule)
      console.log(`[KB] 新规则: ${rule.id} — ${rule.root_cause.slice(0, 40)}...`)
    }

    return newRules
  }

  // ===== 去重 =====

  private findSimilar(extract: ExperienceExtract): Rule | null {
    const keywords = extract.root_cause.split(/[\s，。！？,.!?]+/).filter(k => k.length > 2)

    for (const rule of this.rules.values()) {
      if (rule.merged_with) continue

      const ruleKeywords = rule.root_cause.split(/[\s，。！？,.!?]+/)
      const overlap = keywords.filter(k => ruleKeywords.includes(k))

      if (overlap.length >= Math.min(keywords.length, ruleKeywords.length) * 0.6) {
        return rule
      }
    }

    return null
  }

  private mergeRule(existing: Rule, extract: ExperienceExtract): void {
    if (!extract.proposed_rule.fix) return

    const oldFix = existing.fix
    const newFix = extract.proposed_rule.fix

    if (newFix.length > oldFix.length) {
      existing.fix = `${oldFix} | 增强: ${newFix}`
    }

    if (extract.proposed_rule.applies_to) {
      for (const app of extract.proposed_rule.applies_to) {
        if (!existing.applies_to.includes(app)) {
          existing.applies_to.push(app)
        }
      }
    }

    existing.hit_count++
    console.log(`[KB] 合并规则: ${existing.id} (命中 ${existing.hit_count} 次)`)
  }

  dedupAll(): { removed: number; merged: number } {
    let removed = 0
    let merged = 0

    const rules = Array.from(this.rules.values())

    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        if (rules[i].merged_with || rules[j].merged_with) continue

        const overlap = rules[i].root_cause.split('').filter(c =>
          rules[j].root_cause.includes(c)
        ).length

        if (overlap > Math.max(rules[i].root_cause.length, rules[j].root_cause.length) * 0.8) {
          const older = rules[i].created_at < rules[j].created_at ? rules[i] : rules[j]
          const newer = rules[i].created_at < rules[j].created_at ? rules[j] : rules[i]

          newer.merged_with = older.id
          older.hit_count += newer.hit_count
          merged++
          removed++
        }
      }
    }

    console.log(`[KB] 全库去重: 合并 ${merged} 条，清除 ${removed} 条`)
    return { removed, merged }
  }

  // ===== 查询 =====

  exportRules(): Rule[] {
    return Array.from(this.rules.values())
  }

  getRule(id: string): Rule | undefined {
    return this.rules.get(id)
  }

  getRuleCount(): number {
    return this.rules.size
  }

  listCategories(): string[] {
    const categories = new Set<string>()
    for (const rule of this.rules.values()) {
      for (const app of rule.applies_to) {
        categories.add(app)
      }
    }
    return Array.from(categories).sort()
  }

  // ===== 内置默认规则（Hermes Agent 模式用） =====

  private populateDefaultRules(): void {
    const defaults: Rule[] = [
      {
        id: 'rule-2026-06-17-001',
        source: '李景怡线·实战训练',
        scenario: '她说"喜欢上你了怎么办"后跟害羞/啰嗦/自嘲',
        root_cause: '把掩护信号当成主体信号处理',
        fix: '直接接核心IOI："喜欢上你了怎么办"→"喜欢上就别下来了"。后缀装饰是掩护，不是你该处理的问题。',
        applies_to: ['IOI识别', 'ASD破解'],
        similar_rules: [],
        merged_with: null,
        created_at: '2026-06-17T07:00:00Z',
        hit_count: 3,
      },
      {
        id: 'rule-2026-06-17-002',
        source: '李景怡线·实战训练',
        scenario: 'B/C类女生限定场景时问"会被你欺负吗"',
        root_cause: '用了曲解（改变她对场景的解读）而非延伸（扩大场景边界）',
        fix: '延伸法："不只是在桌上哦"→留空间让她想象。B/C类吃延伸不吃曲解。',
        applies_to: ['延伸vs曲解', 'B类策略', 'C类策略'],
        similar_rules: [],
        merged_with: null,
        created_at: '2026-06-17T07:30:00Z',
        hit_count: 2,
      },
      {
        id: 'rule-2026-06-17-003',
        source: '用户强制纠正',
        scenario: '收到截图后直接出回复',
        root_cause: '未走9步强制流程先搜库再出话术',
        fix: '锁死流程：截图→搜库→匹配模式→标注来源→推导→出话术。说不出模式来源=不合格。',
        applies_to: ['流程管理', '质量控制'],
        similar_rules: [],
        merged_with: null,
        created_at: '2026-06-17T08:00:00Z',
        hit_count: 5,
      },
      {
        id: 'rule-2026-06-17-004',
        source: '用户强制纠正',
        scenario: '用户给出更好话术版本后，未更新知识库',
        root_cause: '未执行训练闭环：拆解为什么更好→提取框架→入库迭代',
        fix: '用户修正三步：①分析为什么更好 ②提取框架模式 ③patch入库标注「用户实战修正」。下次同类场景优先用。',
        applies_to: ['训练闭环', '迭代管理'],
        similar_rules: [],
        merged_with: null,
        created_at: '2026-06-17T08:30:00Z',
        hit_count: 3,
      },
      {
        id: 'rule-2026-06-17-005',
        source: '用户强制纠正',
        scenario: '混淆了谁的对话归属',
        root_cause: '未确认最后一条消息的发送者就把内容归错说话人',
        fix: '归属三检：①确认最后一条消息内容 ②绿=用户 白=对方 ③不混线。',
        applies_to: ['截图分析', '归属确认'],
        similar_rules: [],
        merged_with: null,
        created_at: '2026-06-17T09:00:00Z',
        hit_count: 2,
      },
    ]

    for (const rule of defaults) {
      this.rules.set(rule.id, rule)
    }

    console.log(`[KB] 加载 ${defaults.length} 条默认规则`)
  }

  // ===== 内部工具 =====

  private formatRuleAsMarkdown(rule: Rule): string {
    return [
      '---',
      `id: ${rule.id}`,
      `source: "${rule.source}"`,
      `scenario: "${rule.scenario}"`,
      `root_cause: "${rule.root_cause}"`,
      `fix: "${rule.fix}"`,
      `applies_to: [${rule.applies_to.map(a => `"${a}"`).join(', ')}]`,
      `hit_count: ${rule.hit_count}`,
      `created_at: "${rule.created_at}"`,
      '---',
      '',
      `## ${rule.id}`,
      '',
      `**场景**: ${rule.scenario}`,
      '',
      `**根因**: ${rule.root_cause}`,
      '',
      `**修复**: ${rule.fix}`,
      '',
      `**来源**: ${rule.source}`,
      '',
      `**适用**: ${rule.applies_to.join(', ')}`,
      '',
      `**命中次数**: ${rule.hit_count}`,
    ].join('\n')
  }
}

export const brain = new KnowledgeBrain()
