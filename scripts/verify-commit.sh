#!/bin/bash
# 读取 commit message 文件
commit_msg_file=$1
commit_msg=$(cat "$commit_msg_file")

# 定义 Commit 格式的正则
# type(scope?): message
conventional_regex="^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|config)(\([a-zA-Z0-9_-]+\))?: .+$"

# 从正则中提取类型列表
commit_types=$(echo "$conventional_regex" | grep -oP '(?<=\^)\([^)]+\)' | sed 's/[()]//g')

# 验证格式
if [[ ! $commit_msg =~ $conventional_regex ]]; then
  echo -e "\033[31m✖ 提交信息格式错误：\033[0m"
  echo ""
  echo "提交信息必须符合以下格式："
  echo ""
  echo "  type(scope?): message"
  echo ""
  echo "示例："
  echo "  feat(core): 增加飞线特效模块"
  echo "  fix(renderer): 修复贴地飞行高度计算错误"
  echo "  refactor: 重构地图管理器"
  echo ""
  echo -e "\033[33m可用类型： $commit_types\033[0m"
  echo ""
  exit 1
fi

echo -e "\033[32m✔ Commit message 格式校验通过\033[0m"
exit 0
