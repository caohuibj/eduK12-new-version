#!/bin/bash
# PTool 本地部署测试脚本
# 适用于本地开发环境测试

set -e

echo '此宿主机本地部署脚本已停用；请使用 server-version/docker-compose.yml 的本地 Compose 入口。升级发布必须先 drain/stop 旧 backend、worker 和 public traffic，再执行备份、迁移、四类 public-token backfill、release-preflight 和 smoke。' >&2
exit 1

: <<'LEGACY_SCRIPT'

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "========================================"
echo "  PTool 本地部署测试"
echo "========================================"
echo ""

# 检查依赖
check_dependencies() {
    print_step "1/6 检查依赖..."
    
    local missing_deps=()
    
    if ! command -v node &> /dev/null; then
        missing_deps+=("Node.js")
    fi
    
    if ! command -v npm &> /dev/null; then
        missing_deps+=("npm")
    fi
    
    if ! command -v psql &> /dev/null; then
        print_warn "PostgreSQL 客户端未安装，将使用 SQLite 测试模式"
        export DATABASE_URL="file:./prisma/dev.db"
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        print_error "缺少依赖: ${missing_deps[*]}"
        echo "请安装后重试"
        exit 1
    fi
    
    print_info "依赖检查通过"
    echo "  Node.js: $(node -v)"
    echo "  npm: $(npm -v)"
}

# 检查端口可用性
check_ports() {
    print_step "2/6 检查端口..."
    
    local ports=(3000 5173 6379)
    local used_ports=()
    
    for port in "${ports[@]}"; do
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            used_ports+=($port)
        fi
    done
    
    if [ ${#used_ports[@]} -ne 0 ]; then
        print_warn "以下端口已被占用: ${used_ports[*]}"
        echo "将尝试使用备用端口..."
    else
        print_info "所有端口可用"
    fi
}

# 设置环境变量
setup_environment() {
    print_step "3/6 设置环境变量..."
    
    # 后端环境
    cd "$PROJECT_ROOT/backend"
    
    if [ ! -f .env ]; then
        print_info "创建 .env 文件..."
        cat > .env << EOF
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://localhost:5432/ptool?schema=public
JWT_SECRET=${JWT_SECRET:?set JWT_SECRET in the protected local environment}
JWT_EXPIRES_IN=7d
UPLOAD_DIR=./uploads
ADMIN_USERNAME=admin
ADMIN_PASSWORD=REPLACE_WITH_A_LOCAL_PASSWORD
LOG_LEVEL=debug
EOF
        print_info ".env 文件已创建"
    else
        print_info ".env 文件已存在"
    fi
    
    # 前端环境
    cd "$PROJECT_ROOT/frontend"
    
    if [ ! -f .env ]; then
        print_info "创建前端 .env 文件..."
        cat > .env << EOF
VITE_API_URL=http://localhost:3000
EOF
        print_info "前端 .env 文件已创建"
    fi
    
    cd "$PROJECT_ROOT"
}

# 安装依赖
install_dependencies() {
    print_step "4/6 安装依赖..."
    
    # 后端依赖
    print_info "安装后端依赖..."
    cd "$PROJECT_ROOT/backend"
    npm install
    
    # 前端依赖
    print_info "安装前端依赖..."
    cd "$PROJECT_ROOT/frontend"
    npm install
    
    cd "$PROJECT_ROOT"
}

# 数据库设置
setup_database() {
    print_step "5/6 设置数据库..."
    
    cd "$PROJECT_ROOT/backend"
    
    # 检查 PostgreSQL 是否运行
    if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
        print_info "PostgreSQL 已运行"
        
        # 创建数据库 (如果不存在)
        if ! psql -U postgres -lqt | cut -d \| -f 1 | grep -qw ptool; then
            print_info "创建数据库 'ptool'..."
            psql -U postgres -c "CREATE DATABASE ptool;" 2>/dev/null || {
                print_warn "无法创建数据库，可能需要密码或其他配置"
                print_info "请手动创建数据库: CREATE DATABASE ptool;"
            }
        else
            print_info "数据库 'ptool' 已存在"
        fi
    else
        print_warn "PostgreSQL 未运行，尝试使用 SQLite..."
        # 修改 .env 使用 SQLite
        sed -i 's|DATABASE_URL=.*|DATABASE_URL=file:./prisma/dev.db|' .env
    fi
    
    # 运行迁移
    print_info "运行数据库迁移..."
    npx prisma migrate deploy 2>/dev/null || {
        print_warn "迁移失败，尝试使用 db push..."
        npx prisma db push --accept-data-loss
    }
    
    # 生成 Prisma Client
    npx prisma generate
    
    print_info "数据库设置完成"
}

# 构建项目
build_project() {
    print_step "6/6 构建项目..."
    
    # 构建后端
    print_info "构建后端..."
    cd "$PROJECT_ROOT/backend"
    npm run build
    
    # 构建前端
    print_info "构建前端..."
    cd "$PROJECT_ROOT/frontend"
    npm run build
    
    cd "$PROJECT_ROOT"
    print_info "构建完成"
}

# 启动服务
start_services() {
    echo ""
    echo "========================================"
    echo "  启动服务"
    echo "========================================"
    echo ""
    
    # 创建启动脚本
    cat > "$PROJECT_ROOT/start-local.sh" << 'EOF'
#!/bin/bash
# 本地启动脚本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "启动 PTool 本地服务..."
echo ""

# 启动后端
cd "$SCRIPT_DIR/backend"
echo "🚀 启动后端 (http://localhost:3000)"
npm run dev &
BACKEND_PID=$!

# 启动前端
cd "$SCRIPT_DIR/frontend"
echo "🚀 启动前端 (http://localhost:5173)"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "服务已启动:"
echo "  后端: http://localhost:3000"
echo "  前端: http://localhost:5173"
echo ""
echo "按 Ctrl+C 停止服务"
echo ""

# 等待中断
trap "echo ''; echo '停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait
EOF
    
    chmod +x "$PROJECT_ROOT/start-local.sh"
    
    print_info "启动脚本已创建: start-local.sh"
    echo ""
    echo "运行以下命令启动服务:"
    echo "  cd $PROJECT_ROOT"
    echo "  bash start-local.sh"
    echo ""
    echo "或直接启动:"
    echo "  cd backend && npm run dev"
    echo "  cd frontend && npm run dev"
}

# 运行测试
run_tests() {
    echo ""
    read -p "是否运行测试? (y/n): " run_test
    if [ "$run_test" = "y" ]; then
        print_info "运行后端测试..."
        cd "$PROJECT_ROOT/backend"
        npm test 2>/dev/null || print_warn "测试未通过或没有测试"
    fi
}

# 主函数
main() {
    check_dependencies
    check_ports
    setup_environment
    install_dependencies
    setup_database
    build_project
    
    echo ""
    echo "========================================"
    echo "  ✅ 本地部署测试完成"
    echo "========================================"
    echo ""
    
    start_services
    run_tests
    
    echo ""
    echo "========================================"
    echo "  部署信息"
    echo "========================================"
    echo "  项目路径: $PROJECT_ROOT"
    echo "  后端地址: http://localhost:3000"
    echo "  前端地址: http://localhost:5173"
    echo "  管理员凭据: 读取本地受保护配置"
    echo "========================================"
    echo ""
    print_info "部署完成! 请使用 'bash start-local.sh' 启动服务"
}

# 运行主函数
main

LEGACY_SCRIPT
