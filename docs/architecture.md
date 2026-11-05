# 架构说明

## 概述

obsidian-knowledge-brain 是一个三层架构的 Obsidian 插件，核心在运行时自动提取经验、关联知识、去重入库。

```
┌─────────────────────────────────────┐
│           插件层 (index.ts)           │
│  Obsidian 生命周期钩子 · CLI 命令    │
├─────────────────────────────────────┤
│           引擎层                     │
│  ┌──────────┐  ┌──────────┐        │
│  │ core.ts  │  │linker.ts │        │
│  │ 窗口管理  │  │ 知识关联  │        │
│  │ 规则引擎  │  │ 框架映射  │        │
│  │ 持久化    │  │ 冲突检测  │        │
│  └──────────┘  └──────────┘        │
│  ┌──────────┐  ┌──────────┐        │
│  │dedup.ts  │  │extractor│        │
│  │ 去重引擎  │  │ .ts     │        │
│  │ Jaccard  │  │ 模式识别  │        │
│  │ 相似度   │  │ 根因分析  │        │
│  └──────────┘  └──────────┘        │
├─────────────────────────────────────┤
│        数据层 (vault/本地文件)        │
│  04-规则库/                          │
│  ├── IOI识别/                       │
│  ├── 流程管理/                      │
│  ├── 延伸vs曲解/                   │
│  └── ...                            │
└─────────────────────────────────────┘
```

## 核心流程

### 开窗（window_open）
1. 用户打开 Obsidian 文件
2. 插件捕获 `file-open` 事件
3. 从内存规则库中匹配与当前文件相关的规则
4. 注入规则到当前 session 上下文

### 关窗（window_close）
1. 用户关闭 Obsidian / 手动触发
2. 扫描本 session 的对话日志
3. 逐模式匹配（extractor.ts → analyzeSession）
4. 提取高置信度经验 → 生成规则
5. 关联到知识框架（linker.ts → linkRuleToKnowledge）
6. 去重入库（core.ts → windowClose）
7. 写入 vault 持久化

### 训练闭环
1. 用户给出更好的话术版本
2. extractor.ts → extractTrainingCorrection 分析改进方向
3. 生成新模式 / 强化已有模式
4. 标记「用户实战修正」来源
5. 同类场景优先使用

## 各模块职责

| 模块 | 职责 | 关键接口 |
|------|------|---------|
| core.ts | 窗口生命周期、规则引擎、持久化、去重 | windowOpen, windowClose, dedupAll, loadAllRules |
| extractor.ts | 对话分析、模式识别、根因提取、实时扫描、训练闭环 | analyzeSession, quickScan, extractTrainingCorrection |
| linker.ts | 知识关联、框架映射、冲突检测、vault写入建议 | linkRuleToKnowledge, relateToExistingRules, suggestVaultWrite |
| dedup.ts | 独立去重工具函数 | dedupRule |

## 规则生命周期

```
新经验 → analyzeSession → ExperienceExtract → windowClose
  → findSimilar (去重检查)
    ├── 重复 → hit_count++ (强化)
    ├── 相似 → mergeRule (合并)
    └── 全新 → 生成规则ID → 入库
  → linkRuleToKnowledge (关联框架)
  → saveRuleToVault (持久化)
```

## 模式库（extractor.ts）

内置 13 条模式，按严重度分级：

- **critical**: 流程跳过、不搜库直接出、忽略核心IOI、归属混淆、规则不自知、有窗口时出安全牌
- **high**: 用户修正未入库、曲解代替延伸、ASD误读、依赖记忆非vault、批量入库缺案例、天门错误激活
- **medium**: 关键节点未更新资料卡

模式具有：触发词、权重、严重度、负向触发（防误判）。
