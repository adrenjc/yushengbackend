# 智能商品匹配系统 - 后端 API

基于 Node.js + Express + MongoDB 的智能商品匹配系统后端服务。

## 🚀 快速开始

### 环境要求

- Node.js >= 18.0.0
- MongoDB >= 7.0
- Redis >= 7.0
- npm 或 pnpm

### 安装依赖

```bash
# 使用npm
npm install

# 使用pnpm (推荐)
pnpm install
```

### 环境配置

1. 复制环境变量模板文件：

```bash
cp .env.example .env
```

2. 编辑 `.env` 文件，配置数据库连接等信息：

```env
NODE_ENV=development
PORT=3001

# 数据库配置
MONGODB_URI=mongodb://localhost:27017/smartmatch
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT配置
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h

# 其他配置...
```

### 启动服务

```bash
# 开发环境
npm run dev

# 生产环境
npm start

# 使用PM2
pm2 start ecosystem.config.js
```

服务将在 `http://localhost:3001` 启动。

## 📚 API 文档

### 基础端点

- **健康检查**: `GET /health`
- **API 信息**: `GET /api`

### 认证相关

- **用户注册**: `POST /api/auth/register`
- **用户登录**: `POST /api/auth/login`
- **刷新令牌**: `POST /api/auth/refresh`
- **用户登出**: `POST /api/auth/logout`
- **获取用户信息**: `GET /api/auth/me`

### 商品管理

- **获取商品列表**: `GET /api/products`
- **搜索商品**: `GET /api/products/search`
- **获取商品详情**: `GET /api/products/:id`
- **创建商品**: `POST /api/products`
- **更新商品**: `PUT /api/products/:id`
- **删除商品**: `DELETE /api/products/:id`
- **批量操作**: `POST /api/products/batch`

### 匹配任务

- **创建匹配任务**: `POST /api/matching/tasks`
- **获取任务列表**: `GET /api/matching/tasks`
- **获取任务详情**: `GET /api/matching/tasks/:id`

## 🏗️ 项目结构

```
src/
├── app.js                 # 应用入口文件
├── config/                # 配置文件
│   ├── env.js            # 环境变量配置
│   ├── database.js       # 数据库连接配置
│   └── redis.js          # Redis连接配置
├── controllers/           # 控制器
│   ├── auth.controller.js
│   └── product.controller.js
├── middleware/            # 中间件
│   ├── auth.middleware.js
│   ├── validation.middleware.js
│   └── error.middleware.js
├── models/                # 数据模型
│   ├── User.js
│   ├── Product.js
│   ├── MatchingTask.js
│   └── MatchingRecord.js
├── routes/                # 路由定义
│   ├── auth.routes.js
│   ├── product.routes.js
│   ├── matching.routes.js
│   └── user.routes.js
├── services/              # 业务逻辑服务
├── utils/                 # 工具函数
│   ├── logger.js
│   ├── matching-algorithm.js
│   └── excel-parser.js
└── tests/                 # 测试文件
```

## 🔧 技术栈

- **运行时**: Node.js 18.x
- **框架**: Express.js 4.x
- **数据库**: MongoDB 7.x + Mongoose ODM
- **缓存**: Redis 7.x
- **认证**: JWT + bcrypt
- **文件处理**: multer + xlsx
- **日志**: Winston + Morgan
- **进程管理**: PM2
- **任务队列**: Bull Queue

## 🛡️ 安全特性

- JWT 令牌认证
- 密码加密存储
- 请求频率限制
- CORS 策略配置
- 输入数据验证
- 错误信息脱敏

## 🔍 核心功能

### 智能匹配算法

- 多维度相似度计算（名称、品牌、关键词、包装、价格）
- 可配置的权重和阈值
- 自学习优化机制
- 品牌和包装类型识别

### 用户权限管理

- 基于角色的权限控制 (RBAC)
- 细粒度权限配置
- 多层级审核流程

### 文件处理

- Excel 文件解析和验证
- 批量数据导入
- 错误检测和报告

## 📊 监控和日志

### 日志配置

- 结构化日志输出
- 日志轮转和压缩
- 分级日志记录
- 操作审计日志

### 健康检查

访问 `/health` 端点获取系统状态：

```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "services": {
    "database": "healthy",
    "redis": "healthy"
  }
}
```

## 🚀 部署

### Docker 部署 (推荐)

```bash
# 构建镜像
docker build -t smart-match-api .

# 运行容器
docker run -d \
  --name smart-match-api \
  -p 3001:3001 \
  -e NODE_ENV=production \
  smart-match-api
```

### PM2 部署

```bash
# 安装PM2
npm install -g pm2

# 启动应用
pm2 start ecosystem.config.js --env production

# 查看状态
pm2 status

# 查看日志
pm2 logs
```

## 🧪 测试

```bash
# 运行测试
npm test

# 运行测试覆盖率
npm run test:coverage

# 运行特定测试
npm test -- --grep "匹配算法"
```

## 📝 开发指南

### 添加新的 API 端点

1. 在相应的控制器中添加处理函数
2. 在对应的路由文件中定义路由
3. 添加必要的验证规则
4. 编写测试用例

### 数据库模型

使用 Mongoose ODM，所有模型都包含：

- 数据验证
- 索引配置
- 虚拟字段
- 中间件钩子

### 错误处理

统一的错误处理机制：

- 业务错误：`BusinessError`
- 验证错误：`ValidationError`
- 权限错误：`PermissionError`
- 资源不存在：`NotFoundError`

## 🔧 故障排除

### 常见问题

1. **数据库连接失败**

   - 检查 MongoDB 服务状态
   - 验证连接字符串配置
   - 确认网络连接

2. **Redis 连接失败**

   - 检查 Redis 服务状态
   - 验证 Redis 配置
   - 检查防火墙设置

3. **JWT 认证失败**
   - 检查 JWT 密钥配置
   - 验证令牌格式
   - 确认令牌有效期

### 调试模式

启用调试日志：

```bash
LOG_LEVEL=debug npm run dev
```

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 联系方式

如有问题，请联系开发团队。


