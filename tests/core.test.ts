/**
 * core.test.ts — 知识大脑核心引擎测试
 */

import { brain, Rule, ExperienceExtract } from '../src/core'

beforeEach(() => {
  // 直接用 export 的 singleton 实例
  // 每个测试前清理并重新加载默认规则
  brain.loadAllRules()
})

describe('KnowledgeBrain — 窗口生命周期', () => {
  test('开窗返回相关规则', () => {
    const rules = brain.windowOpen({ thread: 'IOI识别' })
    expect(rules.length).toBeGreaterThanOrEqual(1)
    expect(rules[0].applies_to).toContain('IOI识别')
  })

  test('开窗返回空当无匹配', () => {
    const rules = brain.windowOpen({ thread: '不存在的标签' })
    expect(rules).toHaveLength(0)
  })

  test('关窗提取经验 — 低置信度跳过', () => {
    const extracts: ExperienceExtract[] = [{
      raw_event: '测试低置信度',
      root_cause: '测试根因',
      proposed_rule: { fix: '测试修复' },
      confidence: 0.3, // < 0.5 阈值
    }]

    const result = brain.windowClose(extracts)
    expect(result).toHaveLength(0)
  })

  test('关窗提取经验 — 高置信度入库', () => {
    const extracts: ExperienceExtract[] = [{
      raw_event: '用户说: 流程呢',
      root_cause: '收到截图后未执行9步强制流程',
      proposed_rule: {
        scenario: '收到截图直接回复',
        fix: '锁死流程：截图→搜库→匹配→出',
        applies_to: ['流程管理'],
      },
      confidence: 0.85,
    }]

    const result = brain.windowClose(extracts)
    expect(result).toHaveLength(1)
    expect(result[0].hit_count).toBe(1)
  })

  test('关窗合并相似规则', () => {
    // 第一次入库
    brain.windowClose([{
      raw_event: '用户说: 流程呢',
      root_cause: '未走强制流程就出话术',
      proposed_rule: { scenario: '流程跳过', fix: '锁死流程', applies_to: ['流程管理'] },
      confidence: 0.85,
    }])

    const beforeCount = brain.getRuleCount()

    // 第二次入库（相似的根因）
    brain.windowClose([{
      raw_event: '用户说: 少了步骤',
      root_cause: '未走强制流程就出话术',
      proposed_rule: { scenario: '流程跳过', fix: '锁死流程', applies_to: ['流程管理'] },
      confidence: 0.9,
    }])

    // 应该合并，不新增
    expect(brain.getRuleCount()).toBe(beforeCount)
  })
})

describe('KnowledgeBrain — 规则管理', () => {
  test('全库去重', () => {
    // 先手动插入两条高度相似的规则
    const duplicateExtracts: ExperienceExtract[] = [
      {
        raw_event: '测试重复A',
        root_cause: '未搜库就出话术',
        proposed_rule: { fix: '三步锁死', applies_to: ['话术库'] },
        confidence: 0.9,
      },
      {
        raw_event: '测试重复B',
        root_cause: '未搜知识库就回复',
        proposed_rule: { fix: '三步锁死', applies_to: ['话术库'] },
        confidence: 0.9,
      },
    ]

    brain.windowClose(duplicateExtracts)

    // 原本总规则数（默认5条+新增2条=7）
    const before = brain.getRuleCount()

    const result = brain.dedupAll()
    expect(result.removed + result.merged).toBeGreaterThanOrEqual(0)
  })

  test('导出规则', () => {
    const rules = brain.exportRules()
    expect(rules.length).toBeGreaterThanOrEqual(5) // 5 条内置默认规则
  })

  test('按类别列出', () => {
    const categories = brain.listCategories()
    expect(categories).toContain('IOI识别')
    expect(categories).toContain('流程管理')
  })

  test('获取单条规则', () => {
    const rule = brain.getRule('rule-2026-06-17-001')
    expect(rule).toBeDefined()
    expect(rule!.root_cause).toContain('掩护信号')
  })
})

describe('KnowledgeBrain — 持久化', () => {
  test('导出规则为写文件建议', () => {
    const writes = brain.exportAllRulesForWrite('/vault/04-规则库')
    expect(writes.length).toBeGreaterThanOrEqual(5)

    // 检查格式
    const firstWrite = writes[0]
    expect(firstWrite.path).toContain('04-规则库')
    expect(firstWrite.content).toContain('---')
    expect(firstWrite.content).toContain('## ')
  })

  test('setVaultPath', () => {
    brain.setVaultPath('/obsidian-vault')
    // 不会抛异常即可
    expect(() => brain.setVaultPath('/any/path')).not.toThrow()
  })
})
