/**
 * 规则去重引擎
 * 
 * 新规则入库前先跟已有规则比对：
 * - 同一类问题 → 合并强化（增加命中次数/升级修复方案）
 * - 完全不同 → 新建
 */

import { Rule } from './core'

export interface DedupResult {
  action: 'new' | 'merged' | 'duplicate'
  targetId?: string
}

export function dedupRule(newRule: Partial<Rule>, existingRules: Rule[]): DedupResult {
  for (const existing of existingRules) {
    if (existing.merged_with) continue // 已合并的跳过

    const similarity = calculateSimilarity(newRule, existing)

    if (similarity > 0.85) {
      return { action: 'duplicate', targetId: existing.id }
    }

    if (similarity > 0.6) {
      return { action: 'merged', targetId: existing.id }
    }
  }

  return { action: 'new' }
}

function calculateSimilarity(a: Partial<Rule>, b: Rule): number {
  const aRoot = a.root_cause || ''
  const bRoot = b.root_cause || ''

  // 字面重叠比较
  const aChars = new Set(aRoot)
  const bChars = new Set(bRoot)
  const intersection = new Set([...aChars].filter(c => bChars.has(c)))
  const union = new Set([...aChars, ...bChars])

  if (union.size === 0) return 0
  return intersection.size / union.size
}
