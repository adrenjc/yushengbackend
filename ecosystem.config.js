/**
 * PM2 生产环境配置
 * 智能商品匹配系统
 */
module.exports = {
  apps: [
    {
      name: "smart-match-api",
      script: "src/app.js",
      cwd: __dirname,

      // 进程配置 - 根据服务器配置调整
      instances: "max", // 自动使用所有CPU核心
      exec_mode: "cluster",
      watch: false, // 生产环境关闭文件监控
      max_memory_restart: "2G", // 内存限制

      // 环境变量
      env: {
        NODE_ENV: "development",
        PORT: 8080,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 8080,
      },
      env_development: {
        NODE_ENV: "development",
        PORT: 8080,
        instances: 1,
        watch: true,
        watch_delay: 1000,
        ignore_watch: ["node_modules", "logs", "uploads"],
      },

      // 日志配置
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_file: "./logs/pm2-combined.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
      log_type: "json",
      max_logs: "10", // 保留最近10个日志文件

      // 重启策略
      autorestart: true,
      exp_backoff_restart_delay: 100,
      max_restarts: 15, // 增加重启次数容错
      min_uptime: "30s", // 最小运行时间
      restart_delay: 1000,

      // 优雅关闭配置
      kill_timeout: 5000, // 优雅关闭超时时间
      wait_ready: true,
      listen_timeout: 3000,
      shutdown_with_message: true,

      // 性能监控
      status_interval: 60000, // 60秒收集一次状态

      // Node.js 性能优化参数
      node_args: [
        "--max-old-space-size=1536", // 1.5GB内存限制
        "--optimize-for-size", // 优化内存使用
        "--max-http-header-size=8192", // HTTP头大小限制
        "--gc-interval=200", // GC频率控制
      ],

      // 集群负载均衡
      increment_var: "PORT",
      instance_var: "INSTANCE_ID",

      // 健康检查
      health_check_http: true,
      health_check_grace_period: 3000,
    },
  ],
}
