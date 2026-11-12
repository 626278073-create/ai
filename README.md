# obsidian-knowledge-brain 🧠

**Obsidian 知识库 + AI 的实时进化引擎**

关窗口自动存经验，开窗口自动变聪明。

---

## 问题

传统 AI 知识库的工作流：

```
你犯错 → 手动记笔记 → 每周复盘 → 批量更新规则 → 下次可能还用不上
```

七天经验真空期，规则越堆越冗余，根本原因总是被忽略。

## 解法

```
关窗口 → 自动提取经验 + 找根因
开窗口 → 秒级加载相关规则
新规则 → 先去重 → 能合并就合并 → 能强化就强化
```

### 三大核心能力

| 能力 | v1.0 | v2.0 |
|------|------|------|
| **进化速度** | 每周日扫描，7天空窗 | 关窗立即收经验，开窗就用 |
| **问题诊断** | 数错误数量 | 找根因，一条规则防一类 |
| **规则质量** | 越堆越多，重复冗余 | 先查重，能合并不新建 |

---

## 架构

```
obsidian-knowledge-brain/
├── src/
│   ├── core.ts              # 核心引擎：窗口生命周期管理
│   ├── extractor.ts         # 经验提取器：从对话中提取可复用规则
│   ├── dedup.ts             # 去重引擎：新旧规则比对合并
│   ├── linker.ts            # 知识关联：新规则挂载到已有框架
│   └── index.ts             # 插件入口
├── docs/
│   ├── architecture.md      # 架构说明
│   ├── window-lifecycle.md  # 窗口生命周期协议
│   └── rule-format.md       # 规则格式规范
├── examples/
│   └── rules/               # 示例规则库
├── tests/
│   └── ...
└── manifest.json            # Obsidian 插件清单
```

## 核心概念：窗口

窗口 = 一次独立的对话。

- **开窗（window_open）**：读取 vault 中与当前上下文相关的历史规则，预加载到工作区
- **关窗（window_close）**：提取本次对话中的新经验，分析根因，生成规则，去重后写入 vault
- **窗口心跳（window_heartbeat）**：持续监测对话状态，识别关键转折点

## 规则格式

每条规则遵循统一结构：

```yaml
rule:
  id: "rule-2026-06-17-001"
  source: "李景怡线·实战修正"
  scenario: "她说'喜欢上你了怎么办' → 后面跟害羞/啰嗦/自嘲"
  root_cause: "把掩护信号当成主体信号处理"
  fix: "直接接核心IOI（喜欢上你了），不处理后缀装饰"
  applies_to: ["IOI识别", "ASD破解"]
  similar_rules: ["rule-2026-06-10-003"]
  merged_with: null
```

## 安装

```bash
# 前提：已安装 Obsidian + Node.js 18+
cd <你的 Obsidian vault>/.obsidian/plugins/
git clone https://github.com/<你的用户名>/obsidian-knowledge-brain.git
cd obsidian-knowledge-brain
npm install
npm run build
```

然后在 Obsidian 设置中启用插件。

## 使用

正常聊天就好。插件会自动：

1. **关窗时**：扫描对话，提取可复用的经验
2. **识别根因**：不是数「错了多少次」，是找「根本原因是什么」
3. **去重入库**：新规则先跟已有的规则比对，能合并就不新建
4. **开窗时**：加载相关规则到工作区

### 手动触发

```bash
# 立即关窗收经验
obsidian-knowledge-brain window close

# 查看当前已加载的规则
obsidian-knowledge-brain rules list

# 手动触发规则去重
obsidian-knowledge-brain rules dedup
```

## 与 Hermes Agent 配合

该项目设计为与 AI 代理协同工作：

1. AI 代理在对话结束时调用 `window_close`
2. 插件提取经验并写入 vault
3. 下次对话开始时调用 `window_open`
4. 插件将相关规则注入 AI 上下文

---

## 许可证

MIT

## 路线图

- [x] 窗口生命周期协议
- [x] 经验提取器 v2（12+ 模式，实战训出）
- [x] 根因分析引擎
- [x] 规则去重引擎
- [x] 中文模式识别库（13 条内置模式）
- [x] 知识关联引擎（linker.ts）
- [x] 训练闭环（用户修正自动入库）
- [x] 规则持久化（vault 文件读写）
- [x] 28 个单元测试，全部通过
- [ ] Obsidian 插件打包（.zip 发布）
- [ ] Hermes Agent CLI 集成
- [ ] Web UI 规则浏览器
