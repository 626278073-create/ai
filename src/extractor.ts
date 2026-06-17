/**
 * 经验提取器
 * 
 * 从对话/交互中提取可复用的规则。
 * 核心逻辑：不是数错误次数，是找根本原因。
 */

export interface LogEntry {
  turn: number
  speaker: string
  content: string
  timestamp: string
}

export interface AnalysisResult {
  root_cause: string
  fix: string
  confidence: number
  similar_to?: string
}

/**
 * 分析一组对话日志，找出可提取的经验
 */
export function analyzeSession(logs: LogEntry[]): AnalysisResult[] {
  const results: AnalysisResult[] = []
  const errors: LogEntry[] = []

  // Step 1: 识别被纠正的行为
  for (let i = 1; i < logs.length; i++) {
    const current = logs[i]
    const prev = logs[i - 1]

    // 被纠正 = 用户说「不对」「错了」「重来」「不是这个意思」
    if (isCorrection(current.content)) {
      errors.push(prev)
    }
  }

  if (errors.length === 0) return results

  // Step 2: 找根因（不是数次数，是找模式）
  const patterns = findPatterns(errors)
  
  for (const pattern of patterns) {
    results.push({
      root_cause: pattern.root_cause,
      fix: pattern.fix,
      confidence: pattern.hit_count / errors.length,
    })
  }

  return results
}

function isCorrection(text: string): boolean {
  const keywords = ['不对', '错了', '重来', '不是', '流程呢', '重新出', '不是这个意思']
  return keywords.some(k => text.includes(k))
}

function findPatterns(errors: LogEntry[]): Array<{
  root_cause: string
  fix: string
  hit_count: number
}> {
  const patternMap = new Map<string, { count: number }>()

  for (const err of errors) {
    // 这里接入分类逻辑
    // 示例：如果错误内容包含「流程」「知识库」「搜库」
    if (err.content.includes('流程') || err.content.includes('搜库')) {
      const key = '未执行流程搜索即出话术'
      if (!patternMap.has(key)) patternMap.set(key, { count: 0 })
      patternMap.get(key)!.count++
    }

    if (err.content.includes('进攻') || err.content.includes('安全')) {
      const key = '有窗口动力时未进攻，出了安全牌'
      if (!patternMap.has(key)) patternMap.set(key, { count: 0 })
      patternMap.get(key)!.count++
    }
  }

  return Array.from(patternMap.entries()).map(([root_cause, data]) => ({
    root_cause,
    fix: getFixForPattern(root_cause),
    hit_count: data.count,
  }))
}

function getFixForPattern(root_cause: string): string {
  const fixes: Record<string, string> = {
    '未执行流程搜索即出话术': '收到截图/问怎么回/说分析一下 → 锁死流程：搜库→匹配→标注来源→出话术。缺一步不出。',
    '有窗口动力时未进攻，出了安全牌': '模块三第67行：反应好时→进。高动力时必须大胆升高，不得出安全牌。',
  }
  return fixes[root_cause] || '暂无预置修复方案，需人工补充'
}
