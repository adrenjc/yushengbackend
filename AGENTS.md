# 所有回答都要使用中文

所有回答 都要使用中文

# 已安装

- ast-grep
- busybox (无需带 busybox 前缀 e.g `{"command":["sed","-n","1p","file"]}`)
- rg
- dust (Like du but more intuitive)
- gh
- jq

# shell 调用限制

进行代码搜索或批量替换时必须优先使用`ast-grep` 而不是使用`rg` 因为`ast-grep`更适合查找代码

已安装的工具必须直接调用(e.g `{"command":["sg", "-p", "'console.log($$$ARGS)'"],"timeout_ms":120000,"workdir":"C:\\Users\\username"}`)

必须使用`workdir`指定路径 而不是在命令中使用`cd`

禁止使用`bash -lc`或者`pwsh.exe -NoLogo -NoProfile -Command`或者`powershell.exe -NoLogo -NoProfile -Command`包裹调用已安装的工具

# Repository Guidelines

The Smart Match API backend relies on Express, MongoDB, and Redis. Use this guide to locate code, run the toolchain, and deliver dependable updates.

## Project Structure & Module Organization

Entry code is in `src/app.js`, which loads configuration, middleware, and routes. Domain controllers live in `src/controllers`, business helpers in `src/services`, and persistence layers in `src/models`. HTTP surfaces are defined under `src/routes`, with request guards in `src/middleware` and shared utilities in `src/utils`. Environment, logging, and connection settings sit in `src/config`. Operational outputs land in `logs/`, user files in `uploads/`, and maintenance helpers remain in `scripts/`.

## Build, Test, and Development Commands

- `npm run dev`: start the API with nodemon for hot reload.
- `npm start`: run the service with development env vars and no watcher.
- `npm run start:prod`: boot using production flags locally.
- `npm test`: execute the Jest suite.
- `npm run lint` / `npm run lint:fix`: check or auto-fix ESLint issues.
- `npm run seed`, `npm run clean-db`, `npm run init-db`: manage seed data.
- `npm run pm2:dev`, `npm run pm2:reload`, `npm run pm2:logs`: manage PM2 processes.

## Coding Style & Naming Conventions

Target Node 18 syntax, two-space indentation, and CommonJS exports. Prefer `const`/`let`, avoid dangling semicolons, and lean on the project ESLint profile. Name files with `feature.role.js` (e.g., `memory.controller.js`, `matching.routes.js`). Controllers should stay thin, pushing validation to Joi schemas and delegating heavy work to services.

## Testing Guidelines

Author Jest specs either beside features as `.spec.js` files or under `src/**/__tests__`. Use Supertest for route coverage and reuse the seed helpers when preparing fixtures. Aim for at least 80% coverage on new code and block merges on failing `npm test`. Record prerequisite data or toggles at the top of each spec for quick reproduction.

## Commit & Pull Request Guidelines

Follow conventional prefixes such as `feat:`, `fix:`, `refactor:`, and keep scope lines short and descriptive. PRs should summarize behavioral changes, link issues, note schema or env adjustments, and attach sample payloads or screenshots for API shifts. Confirm linting, tests, and any PM2 reload steps before assigning reviewers.

## Security & Configuration Tips

Use `npm run setup:env` to scaffold `.env.development` and `.env.production`, then populate secrets manually. Check Redis and Mongo URIs before enabling queues or cron jobs (`services/scheduler.service.js`). Keep uploads sanitized via existing Multer filters and avoid committing sensitive dumps in `logs/` or `uploads/`.
