/**
 * obsidian-knowledge-brain
 * 经验提取器 v2 — 从对话/交互中提取可复用规则
 *
 * v2 升级：
 * - 模式库从 2 条扩展到 12+ 条（基于实战训练产出）
 * - 加权评分（不是简单计数）
 * - 多轮对话上下文分析
 * - 根因优先级排序（先修高频+高损）
 * - 支持训练闭环：用户给更好版本 → 拆解 → 入库 → 迭代
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
  confidence: number // 0-1
  severity: 'low' | 'medium' | 'high' | 'critical'
  evidence: string[] // 触发证据
  similar_to?: string // 已有规则 ID
  training_version?: string // 用户实战修正版本
}

/**
 * 模式定义
 * 每条模式 = 识别条件 + 根因 + 修复 + 严重度 + 权重
 */
interface Pattern {
  id: string
  name: string
  triggers: string[]     // 触发关键词
  weight: number         // 0-1，出现时贡献的置信度
  root_cause: string
  fix: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  // 正向验证：如果同时出现这些信号，降低置信度（防止误判）
  negate_triggers?: string[]
}

/** 内置模式库 */
const PATTERNS: Pattern[] = [
  // ===== 流程相关 =====
  {
    id: 'flow-skip',
    name: '流程跳过',
    triggers: ['流程呢', '重新走', '少了步骤', '怎么不回', '截图', '分析'],
    weight: 0.7,
    root_cause: '收到截图/对话后未执行9步强制流程就出回复',
    fix: '锁死：截图→搜库→匹配模式→标注来源→推导话术→出。缺一步不出。',
    severity: 'critical',
    negate_triggers: ['已经走了', '走完了'],
  },
  {
    id: 'no-vault-search',
    name: '不搜库直接出',
    triggers: ['没搜库', '知识库里没有', '搜索了吗', '看库了吗'],
    weight: 0.8,
    root_cause: '出话术前没先搜知识库匹配模式',
    fix: '出话术三步锁：①搜 vault 关键词 → ②读命中章节 → ③标注来源后出。说不出模式来源=不合格。',
    severity: 'critical',
  },
  {
    id: 'no-merge-with-existing',
    name: '用户修正未迭代入库',
    triggers: ['训练闭环', '更好的版本', '为什么好', '拆解', '入库没有'],
    weight: 0.6,
    root_cause: '用户给出更好话术版本后，未执行训练闭环（拆解→入库→迭代）',
    fix: '用户修正三步：①拆解为什么更好 ②提取框架模式 ③patch入库并标注「用户实战修正」。下次同类场景优先用。',
    severity: 'high',
  },

  // ===== 策略决策 =====
  {
    id: 'safe-play-when-should-attack',
    name: '有窗口时出安全牌',
    triggers: ['安全牌', '不进攻', '窗口', '反应好', '应该进', '上升期'],
    weight: 0.75,
    root_cause: '高动力/高IOI窗口出现时未拉升，出了保守回复',
    fix: '模块三核心：反应好时→进。她释放高IOI（主动分享私密/喜欢上你了/约你）时必须大胆升高，不出安全牌。',
    severity: 'critical',
    negate_triggers: ['A类', '天门'],
  },
  {
    id: 'ignore-core-ioi',
    name: '忽略核心IOI，处理后缀装饰',
    triggers: ['核心', 'IOI', '喜欢上你', '重点不是', '掩护', '主体'],
    weight: 0.85,
    root_cause: '把掩护信号（害羞/啰嗦/自嘲）当成主体信号处理，忽略了她说的"喜欢上你了"核心IOI',
    fix: '当她说"喜欢上你了怎么办"→接"喜欢上就别下来了"。后面的害羞/啰嗦/自嘲全是掩护，不是你要处理的问题。',
    severity: 'critical',
  },
  {
    id: 'no-ownership-of-rule',
    name: '规则不自知——说不出话术来源',
    triggers: ['编的', '自己想的', '来源呢', '从哪来的', '不知道'],
    weight: 0.9,
    root_cause: '话术不是从知识库/话术库匹配推导的，是自己空手现编的',
    fix: '每次出话术前自问：①这个模式来自哪个模块？②推导逻辑是什么？③来源标注写了吗？说不清楚就是不合格。',
    severity: 'critical',
  },

  // ===== 归因与理解 =====
  {
    id: 'attribution-error',
    name: '归属混淆——把用户说的当成她说的',
    triggers: ['归属', '搞反了', '理解反了', '不是她说的', '你搞混了'],
    weight: 0.9,
    root_cause: '未确认对话归属（微信绿/白气泡）就把内容归错说话人',
    fix: '归属三检：①截图确认最后一条消息是谁发的 ②颜色双检（绿=用户 白=她）③资料卡对比确认不混线。',
    severity: 'critical',
  },
  {
    id: 'extension-vs-distortion',
    name: '曲解代替延伸（B/C类场景）',
    triggers: ['曲解', '延伸', '不是眼神', '场景边界', '限定场景'],
    weight: 0.8,
    root_cause: 'B/C类女生限定场景时用了曲解（改变解读）而非延伸（扩大场景边界）',
    fix: '延伸=扩大场景边界（"不只是在桌上哦"），曲解=改变她对场景的解读（"你现在在被我欺负"）。B/C类吃延伸不吃曲解。',
    severity: 'high',
  },
  {
    id: 'asd-misread',
    name: '把ASD当拒绝读',
    triggers: ['ASD', '不合适', '做朋友', '安全', '拒绝', '算了'],
    weight: 0.7,
    root_cause: '女生设安全栏（ASD）后被读成拒绝，未识别出这是保护自己的社交防御',
    fix: 'ASD不是拒绝是防御。解法：①不追问"为什么" ②不当真 ③隔1-2周重新激活。她说的"不合适"后面可能跟着"可是"。',
    severity: 'high',
  },

  // ===== 知识管理 =====
  {
    id: 'memory-not-vault',
    name: '依赖会话记忆而非vault',
    triggers: ['memory', '缓存', '清空', '忘了', '记得上次'],
    weight: 0.6,
    root_cause: '重要信息（规则/案例/模式）只存在于临时会话中，未写入vault持久化',
    fix: '写库铁律：任何材料/分析/建议交付后最后一步 = 写入vault对应文件。vault是唯一持久层，没进vault等于没发生过。',
    severity: 'high',
  },
  {
    id: 'not-update-thread-card',
    name: '关键节点后未更新资料卡',
    triggers: ['资料卡', '线程卡', '更新', '没写'],
    weight: 0.6,
    root_cause: '线程发生关键变化后未更新资料卡（三元模型/核心画像/时间线）',
    fix: '每条线程关键节点后：①更新三元模型数值 ②更新时间线 ③更新当前策略。资料卡是线程的标准化交付物。',
    severity: 'medium',
  },
  {
    id: 'bulk-import-no-extraction',
    name: '批量入库只复制框架未提取案例',
    triggers: ['框架', '血肉', '案例', '深度', '只是'],
    weight: 0.7,
    root_cause: '批量处理材料时只提取了框架骨架（50%），未同步提取原始案例血肉（补完剩下50%）',
    fix: '三步血肉提取法：①识别原始案例（有场景+对话原文+操作拆解）②提取场景-操作-结果三要素 ③写入vault对应章节的案例子目录。',
    severity: 'high',
  },

  // ===== 天门模型专用 =====
  {
    id: 'tianmen-unsafe-activation',
    name: '对非A类用了天门',
    triggers: ['天门', '速推', '直给', '饿汉', '高能'],
    weight: 0.5,
    root_cause: '未确认女生属性（A/B/C类）就启用天门模型',
    fix: '天门启用规则：①属性明显A类 ②用户试探过 ③她释放了IOI。B/C/D类一律走常规渐进线。默认不用天门。',
    severity: 'high',
  },
]

/**
 * 分析一组对话日志，提取可复用经验
 */
export function analyzeSession(logs: LogEntry[]): AnalysisResult[] {
  const results: AnalysisResult[] = []

  // 把所有日志文本合并
  const allText = logs.map(l => `${l.speaker}: ${l.content}`).join('\n')
  const userText = logs.filter(l => l.speaker === 'user').map(l => l.content).join(' ')
  const assistantText = logs.filter(l => l.speaker === 'assistant').map(l => l.content).join(' ')

  // 逐模式检测
  for (const pattern of PATTERNS) {
    const evidence: string[] = []
    let totalWeight = 0
    let negateWeight = 0

    // 在用户（纠正者）的文本中检测触发词
    let hitCount = 0
    for (const trigger of pattern.triggers) {
      if (userText.includes(trigger)) {
        evidence.push(`用户说: "${findExcerpt(userText, trigger, 20)}"`)
        hitCount++
      }
    }

    // 基础权重：至少有一个触发词命中就有 0.5 保底，每多一个加权重/词数
    totalWeight = hitCount > 0 ? Math.max(0.5, hitCount * (pattern.weight / pattern.triggers.length)) : 0

    // 负向触发（降低置信度）
    if (pattern.negate_triggers) {
      for (const negTrigger of pattern.negate_triggers) {
        if (function () {
          // 在 assistant 回复中找负向触发
          return assistantText.includes(negTrigger)
        }()) {
          negateWeight += pattern.weight * 0.4
        }
      }
    }

    // 在 assistant 行为中检测（自动化检测）
    for (const trigger of pattern.triggers) {
      if (assistantText.includes(trigger)) {
        evidence.push(`助手自触: "${findExcerpt(assistantText, trigger, 20)}"`)
        totalWeight += pattern.weight * 0.3 / pattern.triggers.length
      }
    }

    if (totalWeight === 0) continue

    const confidence = Math.min(Math.max(totalWeight - negateWeight, 0), 1)

    if (confidence < 0.3) continue

    results.push({
      root_cause: pattern.root_cause,
      fix: pattern.fix,
      confidence,
      severity: pattern.severity,
      evidence: evidence.slice(0, 3), // 最多3条证据
    })
  }

  // 按严重度+置信度排序
  const severityRank = { critical: 4, high: 3, medium: 2, low: 1 }
  results.sort((a, b) => {
    const rankA = severityRank[a.severity] * a.confidence
    const rankB = severityRank[b.severity] * b.confidence
    return rankB - rankA
  })

  return results
}

/**
 * 轻量分析：快速扫描单条消息判断是否含有模式信号
 * 用于实时场景（收到截图时快速检出自检）
 */
export function quickScan(message: string): Pattern[] {
  const hits: Pattern[] = []

  for (const pattern of PATTERNS) {
    for (const trigger of pattern.triggers) {
      if (message.includes(trigger)) {
        hits.push(pattern)
        break
      }
    }
  }

  return hits
}

/**
 * 训练闭环：用户给出更好话术版本时，提取新模式/迭代现有模式
 */
export function extractTrainingCorrection(
  originalOutput: string,
  userCorrection: string,
): { pattern: string; root_cause: string; fix: string } {
  // 检测方向性改进
  const improvements: string[] = []

  if (userCorrection.includes('延伸') && !originalOutput.includes('延伸')) {
    improvements.push('延伸替代曲解')
  }

  if (userCorrection.includes('核心') && !originalOutput.includes('核心')) {
    improvements.push('接核心IOI而非后缀装饰')
  }

  if (userCorrection.includes('搜库') && !originalOutput.includes('搜库')) {
    improvements.push('补充搜库验证过程')
  }

  if (userCorrection.includes('进攻') && originalOutput.includes('安全')) {
    improvements.push('从安全牌转为进攻')
  }

  // 如果用户修正更长，可能是补充完善
  if (improvements.length === 0 && userCorrection.length > originalOutput.length * 1.3) {
    improvements.push('补充完善')
  }

  return {
    pattern: improvements.length > 0 ? improvements.join(' + ') : '未识别方向的修正',
    root_cause: improvements.length > 0
      ? '原始输出缺失了关键框架步骤'
      : '需要人工识别改进方向',
    fix: improvements.length > 0
      ? userCorrection
      : '需人工分析修正逻辑',
  }
}

// ========== 内部工具 ==========

function findExcerpt(text: string, keyword: string, contextLen: number): string {
  const idx = text.indexOf(keyword)
  if (idx === -1) return keyword

  const start = Math.max(0, idx - contextLen)
  const end = Math.min(text.length, idx + keyword.length + contextLen)
  let excerpt = text.slice(start, end).replace(/\n/g, ' ')

  if (start > 0) excerpt = '…' + excerpt
  if (end < text.length) excerpt = excerpt + '…'

  return excerpt
}
