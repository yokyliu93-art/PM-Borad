# PM Board Demo

一个清爽的「人人都是 PM」协作入口 Demo。它展示了开源 PM board 产品的核心 onboarding：

1. 选择使用身份：总 PM、成员、观察者
2. 选择登录方式：飞书账号或 Google 登录
3. 完成实名信息
4. 加入项目组
5. 进入公共任务池工作台

当前前端仍是 Demo 登录流程。仓库里已经加入 Express + SQLite 后端骨架，可作为后续接飞书 OAuth、项目组权限和任务持久化的基础。

## 本地运行

```bash
npm install
npm run dev
```

打开终端显示的本地地址，通常是：

```text
http://127.0.0.1:5173/
```

## 后端骨架

压缩包中的后端已经整理到 `server/`，包含：

- Express API
- SQLite 数据库迁移和 seed
- JWT cookie 登录态
- 飞书 OAuth 路由骨架
- 项目、团队、任务、模板和 dashboard API
- Socket.IO 实时事件骨架

启动后端：

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

开发环境可以用：

```text
http://localhost:3001/api/auth/dev-login
```

真实飞书登录需要先在飞书开放平台拿到 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`，并配置线上回调地址。

## 演示路径

- 第一屏选择「我是成员」
- 点击「继续登录」
- 点击「飞书账号」或「Google 登录」
- 在实名页填写真实姓名
- 选择 `PM Board Demo`
- 点击「进入工作台」
- 对无人认领的任务点击「邀请」
- 选择一个成员，生成邀请记录

## 技术栈

- Vite
- React 18
- Tailwind CSS
- lucide-react
- Express
- SQLite
- Socket.IO
- 本地 React state 模拟前端 Demo 数据

## 下一步

如果要变成公司内部可用版本，需要补齐：

- 后端服务
- 飞书 OAuth 回调
- Google OAuth 回调
- 用户表和组织表
- 项目组权限
- 任务数据持久化
- 部署域名和环境变量
