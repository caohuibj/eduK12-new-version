#!/bin/bash
# CDN 缓存刷新脚本
# 用于部署后自动刷新腾讯云 CDN 缓存

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# CDN 域名配置
CDN_DOMAIN="${CDN_DOMAIN:-eduk12.top}"

# 打印函数
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 tccli 配置
check_tccli() {
    if ! command -v tccli &> /dev/null; then
        print_error "tccli 未安装"
        print_info "安装方法: pip install tccli"
        return 1
    fi
    
    # 测试 API 调用
    if ! tccli cdn DescribeDomains --Limit 1 &> /dev/null; then
        print_error "tccli API 密钥未配置或无效"
        print_info "配置方法: tccli configure"
        print_info "需要输入: SecretId, SecretKey, Region"
        return 1
    fi
    
    return 0
}

# 使用 tccli 刷新 URL
refresh_urls_tccli() {
    local urls=("$@")
    
    print_info "使用 tccli 刷新 CDN 缓存..."
    
    # 构建 URL 列表 JSON
    local url_json=$(printf '%s\n' "${urls[@]}" | jq -R . | jq -s .)
    
    # 调用刷新 API
    local result=$(tccli cdn PurgeUrlsCache --Urls "$url_json" 2>&1)
    
    if echo "$result" | jq -e '.TaskId' &> /dev/null; then
        local task_id=$(echo "$result" | jq -r '.TaskId')
        print_info "刷新任务已提交: TaskId=$task_id"
        return 0
    else
        print_error "刷新失败: $result"
        return 1
    fi
}

# 使用 curl + API 签名刷新（备用方案）
refresh_urls_api() {
    local urls=("$@")
    
    # 从环境变量读取密钥
    local secret_id="${TENCENT_SECRET_ID:-}"
    local secret_key="${TENCENT_SECRET_KEY:-}"
    
    if [ -z "$secret_id" ] || [ -z "$secret_key" ]; then
        print_error "请设置环境变量 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY"
        return 1
    fi
    
    print_info "使用 API 直接调用刷新 CDN..."
    
    # 生成时间戳和随机数
    local timestamp=$(date +%s)
    local nonce=$((RANDOM * 10000 + RANDOM))
    
    # 构建请求参数
    local url_list=$(printf '%s\n' "${urls[@]}" | jq -R . | jq -s .)
    
    # 这里需要实现腾讯云 API 签名算法
    # 简化版：建议使用 tccli
    print_warn "API 直接调用需要实现签名算法，建议配置 tccli"
    return 1
}

# 刷新前端静态资源
refresh_frontend() {
    print_info "刷新前端静态资源..."
    
    local urls=(
        "https://${CDN_DOMAIN}/"
        "https://${CDN_DOMAIN}/index.html"
    )
    
    # 如果提供了特定文件，也添加进去
    if [ -n "$REFRESH_FILES" ]; then
        IFS=',' read -ra files <<< "$REFRESH_FILES"
        for file in "${files[@]}"; do
            urls+=("https://${CDN_DOMAIN}${file}")
        done
    fi
    
    if check_tccli; then
        refresh_urls_tccli "${urls[@]}"
    else
        refresh_urls_api "${urls[@]}"
    fi
}

# 刷新指定 URL
refresh_custom_urls() {
    local urls=("$@")
    
    if [ ${#urls[@]} -eq 0 ]; then
        print_error "请提供要刷新的 URL"
        return 1
    fi
    
    if check_tccli; then
        refresh_urls_tccli "${urls[@]}"
    else
        refresh_urls_api "${urls[@]}"
    fi
}

# 查询刷新任务状态
query_task() {
    local task_id="$1"
    
    if [ -z "$task_id" ]; then
        print_error "请提供 TaskId"
        return 1
    fi
    
    if ! check_tccli; then
        return 1
    fi
    
    print_info "查询刷新任务状态: $task_id"
    tccli cdn DescribePurgeTasks --TaskId "$task_id"
}

# 显示帮助
show_help() {
    echo "用法: $0 [命令] [参数]"
    echo ""
    echo "命令:"
    echo "  frontend       刷新前端静态资源 (index.html 等)"
    echo "  url <URL...>   刷新指定的 URL"
    echo "  query <TaskId> 查询刷新任务状态"
    echo "  help           显示此帮助信息"
    echo ""
    echo "环境变量:"
    echo "  CDN_DOMAIN          CDN 域名 (默认: eduk12.top)"
    echo "  REFRESH_FILES       额外刷新的文件路径，逗号分隔"
    echo "  TENCENT_SECRET_ID   腾讯云 SecretId (API 直接调用时需要)"
    echo "  TENCENT_SECRET_KEY  腾讯云 SecretKey (API 直接调用时需要)"
    echo ""
    echo "示例:"
    echo "  $0 frontend                    # 刷新前端首页"
    echo "  $0 url https://eduk12.top/a.js # 刷新指定 URL"
    echo "  CDN_DOMAIN=example.com $0 frontend  # 指定域名"
}

# 主函数
main() {
    local command="${1:-help}"
    shift || true
    
    case "$command" in
        frontend)
            refresh_frontend
            ;;
        url)
            refresh_custom_urls "$@"
            ;;
        query)
            query_task "$1"
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "未知命令: $command"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
