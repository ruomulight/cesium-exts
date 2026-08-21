#!/usr/bin/env bash

set -e

# Git commit-msg hook
# 用于校验 Commit Message 是否符合：
#
#   type(scope?): message
#
# 示例：
#   feat(core): 增加飞线特效模块
#   fix(renderer): 修复贴地飞行高度计算错误
#   refactor: 重构地图管理器

commit_msg_file="$1"

# ------------------------------------------------------------
# 基础检查
# ------------------------------------------------------------

if [[ -z "$commit_msg_file" ]]; then
    printf '\033[31m✖ 未提供 commit message 文件\033[0m\n'
    exit 1
fi

if [[ ! -f "$commit_msg_file" ]]; then
    printf '\033[31m✖ Commit message 文件不存在：%s\033[0m\n' "$commit_msg_file"
    exit 1
fi

if [[ ! -r "$commit_msg_file" ]]; then
    printf '\033[31m✖ Commit message 文件无法读取：%s\033[0m\n' "$commit_msg_file"
    exit 1
fi

# ------------------------------------------------------------
# 读取第一行 Commit Message
# ------------------------------------------------------------

commit_msg=$(sed -n '1p' "$commit_msg_file")

# 兼容 Windows CRLF
commit_msg="${commit_msg%$'\r'}"

# ------------------------------------------------------------
# Commit 类型
# ------------------------------------------------------------

commit_types=(
    feat
    fix
    docs
    style
    refactor
    perf
    test
    build
    ci
    chore
    revert
    remove
    config
)

# ------------------------------------------------------------
# Commit Message 正则
#
# type(scope?): message
#
# scope:
#   - 字母
#   - 数字
#   - _
#   - /
#   - .
#   - -
#
# 示例：
#   feat: 增加功能
#   feat(core): 增加功能
#   fix(renderer/webgl): 修复问题
# ------------------------------------------------------------

conventional_regex='^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|remove|config)(\([a-zA-Z0-9_./-]+\))?: .+$'

# ------------------------------------------------------------
# 校验
# ------------------------------------------------------------

if [[ ! "$commit_msg" =~ $conventional_regex ]]; then

    printf '\033[31m✖ 提交信息格式错误\033[0m\n'
    printf '\n'

    printf '提交信息必须符合以下格式：\n'
    printf '\n'
    printf '  type(scope?): message\n'
    printf '\n'

    printf '示例：\n'
    printf '  feat(core): 增加飞线特效模块\n'
    printf '  fix(renderer): 修复贴地飞行高度计算错误\n'
    printf '  refactor: 重构地图管理器\n'
    printf '  docs(api): 补充 API 文档\n'
    printf '\n'

    printf '\033[33m可用类型：\033[0m\n'

    printf '  '
    printf '%s ' "${commit_types[@]}"
    printf '\n'

    printf '\n'
    printf '\033[33m当前提交：\033[0m%s\n' "$commit_msg"
    printf '\n'

    exit 1
fi

printf '\033[32m✔ Commit message 格式校验通过\033[0m\n'

exit 0