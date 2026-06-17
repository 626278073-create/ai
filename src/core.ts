/**
 * obsidian-knowledge-brain
 * 核心引擎：窗口生命周期管理
 * 
 * 关窗口自动收经验，开窗口自动变聪明。
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
  confidence: number // 0-1
}

class KnowledgeBrain {
  private rules: Map<string, Rule> = new Map()
  private activeSession: string | null = null

  /**
   * 开窗：加载当前线程相关的历史规则
   */
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

  /**
   * 关窗：提取经验 → 找根因 → 去重 → 入库
   */
  windowClose(extracts: ExperienceExtract[]): Rule[] {
    const newRules: Rule[] = []

    for (const extract of extracts) {
      if (extract.confidence < 0.5) continue // 置信度太低，不收录

      // 找根因 === 去重检查
      const existing = this.findSimilar(extract)
      
      if (existing) {
        // 已有相似规则 → 强化（增加命中次数）
        existing.hit_count++
        if (existing.hit_count > 2 && !existing.merged_with && extract.proposed_rule.fix) {
          // 多次命中说明这个是关键规则，合并强化
          this.mergeRule(existing, extract)
        }
        continue
      }

      // 无重复 → 新建规则
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

  /**
   * 查找相似规则（去重核心逻辑）
   */
  private findSimilar(extract: ExperienceExtract): Rule | null {
    const keywords = extract.root_cause.split(/[\s，。！？,.!?]+/).filter(k => k.length > 2)
    
    for (const rule of this.rules.values()) {
      if (rule.merged_with) continue // 已合并的规则不参与比对

      // 检查根因关键词重叠度
      const ruleKeywords = rule.root_cause.split(/[\s，。！？,.!?]+/)
      const overlap = keywords.filter(k => ruleKeywords.includes(k))
      
      if (overlap.length >= Math.min(keywords.length, ruleKeywords.length) * 0.6) {
        return rule
      }
    }

    return null
  }

  /**
   * 合并规则
   */
  private mergeRule(existing: Rule, extract: ExperienceExtract): void {
    if (!extract.proposed_rule.fix) return

    // 规则合并策略：取更具体的修复方案
    const oldFix = existing.fix
    const newFix = extract.proposed_rule.fix

    if (newFix.length > oldFix.length) {
      existing.fix = `${oldFix} | 增强: ${newFix}`
    }

    // 合并适用范围
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

  /**
   * 手动触发全库去重
   */
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
          // 高度重复，合并到更老的那条
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

  /**
   * 导出规则库
   */
  exportRules(): Rule[] {
    return Array.from(this.rules.values())
  }
}

export const brain = new KnowledgeBrain()
