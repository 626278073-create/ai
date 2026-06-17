/**
 * obsidian-knowledge-brain
 * 知识关联引擎：新规则 → 挂载到已有知识框架
 *
 * 不是简单打标签，是找到规则在知识体系中的生态位：
 * - 属于哪个核心模型（短线密码/天门/M3/话术库）
 * - 跟哪条已有规则形成互补/对立/强化关系
 * - 应该写入哪个 vault 章节目录
 */

import { Rule } from './core'

/**
 * 知识框架章节
 * 对应 Obsidian vault 的目录结构
 */
export const KNOWLEDGE_FRAMEWORK = {
  sections: [
    {
      id: 'short-term-dna',
      name: '短线密码',
      path: '01-道-底层原理/短线密码×天门模型-全链路整合.md',
      keywords: ['好开', '四原则', '三元', '暴击', 'ABC', '属性', '开放度'],
    },
    {
      id: 'm3',
      name: 'M3模型',
      path: '02-法-系统方法/第廿二章-M3模型汉化改造.md',
      keywords: ['吸引', '联系感', '亲密感', 'C1', 'C2', 'C3', '阶段', '窗口'],
    },
    {
      id: 'techniques',
      name: '核心技巧',
      path: '02-法-系统方法/第廿三章-核心技巧汉化对照.md',
      keywords: ['废测', '框架', 'IOD', 'IOI', '拉升', '打压', '服从性'],
    },
    {
      id: 'line-library',
      name: '话术库',
      path: '03-术-实操招式/话术库-v3.0.md',
      keywords: ['话术', '回复', '话术模板', '钩子', '预设', '惯例'],
    },
    {
      id: 'pattern-cards',
      name: '模式卡',
      path: '03-术-实操招式/回复模式卡-速查手册.md',
      keywords: ['卡', '模式', '场景', '反模式', '速查'],
    },
    {
      id: 'red-pill',
      name: '红丸框架',
      path: '01-道/红丸宏观框架.md',
      keywords: ['红丸', '框架', '博弈', '筛选', '带领', '供养者', '情人'],
    },
    {
      id: 'cold-reading',
      name: '冷读术',
      path: '03-术/冷读术精华.md',
      keywords: ['冷读', '共鸣', '她是什么样的人', '情绪', '共情'],
    },
    {
      id: 'tianmen',
      name: '天门模型',
      path: '03-术-实操招式/天门模型-饿汉模型-拆解分析.md',
      keywords: ['天门', '速推', 'A类', '高开', '直给', '拉升'],
    },
  ],
} as const

export interface LinkResult {
  section_id: string
  section_name: string
  target_path: string
  match_score: number // 0-1
  match_reason: string
}

/**
 * 将一条新规则关联到知识框架中最匹配的章节
 */
export function linkRuleToKnowledge(rule: Rule): LinkResult[] {
  const results: LinkResult[] = []

  const ruleText = [
    rule.scenario,
    rule.root_cause,
    rule.fix,
    ...(rule.applies_to || []),
    rule.source,
  ].join(' ').toLowerCase()

  for (const section of KNOWLEDGE_FRAMEWORK.sections) {
    let hits = 0

    for (const keyword of section.keywords) {
      if (ruleText.includes(keyword.toLowerCase())) {
        hits++
      }
    }

    if (hits > 0) {
      const matchScore = hits / section.keywords.length
      results.push({
        section_id: section.id,
        section_name: section.name,
        target_path: section.path,
        match_score: Math.min(matchScore, 1),
        match_reason: `命中 ${hits}/${section.keywords.length} 关键词 » ${section.keywords.filter(k => ruleText.includes(k.toLowerCase())).slice(0, 3).join(', ')}`,
      })
    }
  }

  // 按匹配度降序
  return results.sort((a, b) => b.match_score - a.match_score)
}

/**
 * 检查新规则与已有规则的关系
 * 返回：互补 / 对立 / 强化 / 重复 四种关系
 */
export function relateToExistingRules(
  newRule: Rule,
  existingRules: Rule[],
): { type: 'complement' | 'conflict' | 'reinforce' | 'duplicate'; targetId: string; reason: string }[] {
  const relations: { type: 'complement' | 'conflict' | 'reinforce' | 'duplicate'; targetId: string; reason: string }[] = []

  const newWords = extractKeywords(newRule.root_cause + ' ' + newRule.fix)
  const newFixes = extractKeywords(newRule.fix)

  for (const existing of existingRules) {
    if (existing.id === newRule.id) continue
    if (existing.merged_with) continue

    const existWords = extractKeywords(existing.root_cause + ' ' + existing.fix)
    const existFixes = extractKeywords(existing.fix)

    // 根因重叠度
    const commonRoots = newWords.filter(w => existWords.includes(w))
    const rootOverlap = newWords.length > 0 ? commonRoots.length / Math.max(newWords.length, 1) : 0

    if (rootOverlap > 0.7 && newFixes.some(f => existFixes.includes(f))) {
      relations.push({
        type: 'duplicate',
        targetId: existing.id,
        reason: `根因重叠度 ${Math.round(rootOverlap * 100)}%，修复方案相似`,
      })
    } else if (rootOverlap > 0.5) {
      relations.push({
        type: 'reinforce',
        targetId: existing.id,
        reason: `根因重叠度 ${Math.round(rootOverlap * 100)}%，可强化`,
      })
    } else if (rootOverlap > 0.3) {
      relations.push({
        type: 'complement',
        targetId: existing.id,
        reason: `根因部分重叠 ${Math.round(rootOverlap * 100)}%，可互补`,
      })
    }

    // 对立检测：新规则的 fix 跟现有规则的 fix 方向相反
    if (detectConflict(newRule.fix, existing.fix)) {
      relations.push({
        type: 'conflict',
        targetId: existing.id,
        reason: `修复方案方向冲突: "${newRule.fix.slice(0, 30)}" v.s. "${existing.fix.slice(0, 30)}"`,
      })
    }
  }

  return relations
}

/**
 * 将规则写入 vault 的正确位置
 * 返回写入建议（不实际写文件，由外部调用者执行）
 */
export function suggestVaultWrite(
  rule: Rule,
  links: LinkResult[],
): { path: string; appendAfter: string; content: string } {
  const topLink = links[0]

  if (!topLink) {
    return {
      path: '04-案例库/未归档规则.md',
      appendAfter: '## 未归档规则',
      content: formatRuleForVault(rule),
    }
  }

  return {
    path: topLink.target_path,
    appendAfter: `## ${topLink.section_name}`,
    content: formatRuleForVault(rule),
  }
}

// ========== 内部工具 ==========

function extractKeywords(text: string): string[] {
  // 简单中文关键词提取：按标点/空格分割，去掉单字
  return text
    .split(/[\s，。！？,.!?、：:；;()（）「」""''/\\]+/)
    .filter(w => w.length > 1)
    .map(w => w.toLowerCase())
}

function detectConflict(fixA: string, fixB: string): boolean {
  const conflictPairs: [string, string][] = [
    ['进攻', '防守'],
    ['拉升', '后退'],
    ['直接', '委婉'],
    ['天门', '常规'],
    ['主动', '被动'],
    ['升高', '安全'],
  ]

  const aLower = fixA.toLowerCase()
  const bLower = fixB.toLowerCase()

  for (const [a, b] of conflictPairs) {
    if ((aLower.includes(a) && bLower.includes(b)) ||
        (aLower.includes(b) && bLower.includes(a))) {
      return true
    }
  }

  return false
}

function formatRuleForVault(rule: Rule): string {
  return [
    '',
    `### ${rule.id}`,
    `- **场景**: ${rule.scenario}`,
    `- **根因**: ${rule.root_cause}`,
    `- **修复**: ${rule.fix}`,
    `- **来源**: ${rule.source}`,
    `- **适用**: ${rule.applies_to.join(', ')}`,
    `- **命中次数**: ${rule.hit_count}`,
    '',
  ].join('\n')
}
