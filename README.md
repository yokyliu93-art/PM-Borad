# PM Board Demo

一个清爽的「人人都是 PM」协作入口 Demo。它展示了开源 PM board 产品的核心 onboarding：

1. 选择使用身份：总 PM、成员、观察者
2. 选择登录方式：飞书账号或 Google 登录
3. 完成实名信息
4. 加入项目组
5. 进入公共任务池工作台

当前版本已经接入 Express + SQLite 后端骨架，并提供飞书 OAuth 与 Google OAuth 登录路由。没有配置 OAuth 密钥时，登录按钮会进入后端错误提示；配置密钥后即可跳转到对应账号授权页。

## 本地运行前端

```bash
npm install
npm run dev
```

打开终端显示的本地地址，通常是：

```text
http://127.0.0.1:5173/
```

## 后端

压缩包中的后端已经整理到 `server/`，包含：

- Express API
- SQLite 数据库迁移和 seed
- JWT cookie 登录态
- 飞书 OAuth 路由
- Google OAuth 路由
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

## Google 登录配置

在 Google Cloud Console 创建 OAuth Client：

1. 打开 Google Cloud Console
2. 创建或选择一个项目
3. 进入 APIs & Services
4. 配置 OAuth consent screen
5. 创建 OAuth 2.0 Client ID，类型选择 Web application
6. 添加本地回调地址：

```text
http://localhost:3001/api/auth/google/callback
```

7. 线上部署后，再添加线上回调地址，例如：

```text
https://pmboard.yourcompany.com/api/auth/google/callback
```

8. 把拿到的值填到 `server/.env`：

```text
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
SERVER_URL=http://localhost:3001
CLIENT_URL=http://localhost:5173
```

本地开发时需要同时启动：

```bash
npm run dev
cd server
npm run dev
```

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
- 用户表和组织表
- 项目组权限
- 任务数据持久化
- 部署域名和环境变量
