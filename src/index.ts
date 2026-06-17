/**
 * obsidian-knowledge-brain
 * 插件入口 — Obsidian 插件生命周期 + 窗口钩子
 */

import { Plugin } from 'obsidian'
import { brain, Rule, ExperienceExtract } from './core'

export default class KnowledgeBrainPlugin extends Plugin {
  async onload() {
    console.log('[KB] 知识大脑加载完成')

    // 注册窗口开/关钩子
    this.registerEvent(
      this.app.workspace.on('quit', () => this.windowClose())
    )

    // 命令注册
    this.addCommand({
      id: 'window-close-and-save',
      name: '关窗收经验',
      callback: () => this.windowClose(),
    })

    this.addCommand({
      id: 'window-open-load-rules',
      name: '开窗载入规则',
      callback: () => this.windowOpen(),
    })

    this.addCommand({
      id: 'rules-dedup',
      name: '规则去重',
      callback: () => {
        const result = brain.dedupAll()
        console.log(`[KB] 去重完成: 合并 ${result.merged} 条`)
      },
    })

    // 开窗自动加载
    this.windowOpen()
  }

  windowOpen() {
    const activeNote = this.app.workspace.getActiveFile()
    if (!activeNote) return

    const context = { thread: activeNote.path }
    const rules = brain.windowOpen(context)
    
    // 在 vault 中写入当前 session 的规则摘要
    if (rules.length > 0) {
      const summary = rules.map(r => `- ${r.root_cause} → ${r.fix}`).join('\n')
      // 使用 Obsidian API 写入元数据
    }
  }

  windowClose() {
    // 扫描当前 session 的对话日志
    // 提取经验 → 找根因 → 去重 → 入库
    // 这个钩子由 AI 代理调用
    console.log('[KB] 窗口关闭，开始收经验...')
    // brain.windowClose(extracts)
  }

  onunload() {
    console.log('[KB] 知识大脑卸载')
  }
}
