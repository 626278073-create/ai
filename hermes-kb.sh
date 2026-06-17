#!/bin/bash
# hermes-kb.sh — Hermes Agent 知识大脑桥接脚本
# 用法: ./hermes-kb.sh search <query>
#       ./hermes-kb.sh analyze <text>
#       ./hermes-kb.sh scan <text>
#       ./hermes-kb.sh status
#       ./hermes-kb.sh vault <path>

KB_DIR="$HOME/Desktop/obsidian-knowledge-brain"

case "$1" in
  search)
    shift
    cd "$KB_DIR" && node dist/cli.js search "$*" 2>/dev/null
    ;;
  analyze)
    shift
    cd "$KB_DIR" && node dist/cli.js analyze "$*" 2>/dev/null
    ;;
  scan)
    shift
    cd "$KB_DIR" && node dist/cli.js scan "$*" 2>/dev/null
    ;;
  status)
    cd "$KB_DIR" && node dist/cli.js status 2>/dev/null
    ;;
  vault)
    cd "$KB_DIR" && node dist/cli.js vault "$2" 2>/dev/null
    ;;
  link)
    cd "$KB_DIR" && node dist/cli.js link "$2" 2>/dev/null
    ;;
  *)
    echo "用法: $0 {search|analyze|scan|status|vault|link} [参数]"
    exit 1
    ;;
esac
