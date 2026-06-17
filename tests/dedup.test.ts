/**
 * dedup.test.ts — 规则去重引擎测试
 */

import { dedupRule } from '../src/dedup'
import { Rule } from '../src/core'

describe('dedupRule — 规则去重', () => {
  const baseRules: Rule[] = [
    {
      id: 'rule-001',
      source: '测试A',
      scenario: '收到截图后直接出回复',
      root_cause: '未执行9步强制流程就出话术',
      fix: '锁死：截图→搜库→匹配→标注来源→推导→出',
      applies_to: ['流程管理'],
      similar_rules: [],
      merged_with: null,
      created_at: '2026-06-17T08:00:00Z',
      hit_count: 3,
    },
    {
      id: 'rule-002',
      source: '测试B',
      scenario: '她说了喜欢上你了',
      root_cause: '把掩护信号当主体信号处理',
      fix: '直接接核心IOI：喜欢上就别下来了',
      applies_to: ['IOI识别'],
      similar_rules: [],
      merged_with: null,
      created_at: '2026-06-17T07:00:00Z',
      hit_count: 2,
    },
  ]

  test('完全相同 → duplicate', () => {
    const result = dedupRule({
      root_cause: '未执行9步强制流程就出话术',
      fix: '锁死：截图→搜库→匹配→标注来源→推导→出',
    }, baseRules)
    expect(result.action).toBe('duplicate')
    expect(result.targetId).toBe('rule-001')
  })

  test('相似但不同 → merged', () => {
    const result = dedupRule({
      root_cause: '未走强制流程就出话术',
      fix: '三步锁死：搜库→匹配→出',
    }, baseRules)
    // 字面重叠应该较高（共享10/12个字符）
    const valid = ['merged', 'duplicate']
    expect(valid).toContain(result.action)
  })

  test('完全不同 → new', () => {
    const result = dedupRule({
      root_cause: '归属混淆把用户说的当成对方说的',
      fix: '归属三检：确认最后一条消息的发送者',
    }, baseRules)
    expect(result.action).toBe('new')
  })

  test('已合并的规则被跳过', () => {
    const withMerged = [...baseRules]
    // rule-002 标记为已合并
    withMerged[1] = { ...withMerged[1], merged_with: 'rule-001' }

    const result = dedupRule({
      root_cause: '把掩护信号当主体信号处理',
    }, withMerged)
    // 应该跳过已合并的 rule-002
    expect(result.action).toBe('new')
  })

  test('空根因 → new', () => {
    const result = dedupRule({}, baseRules)
    expect(result.action).toBe('new')
  })
})
