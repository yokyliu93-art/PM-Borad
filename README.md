# PM Board Demo

一个清爽的「人人都是 PM」协作入口 Demo。它展示了开源 PM board 产品的核心 onboarding：

1. 选择使用身份：总 PM、成员、观察者
2. 选择登录方式：飞书账号或 Google 登录
3. 完成实名信息
4. 加入项目组
5. 进入公共任务池工作台

当前版本是前端 Demo，登录为本地模拟，不会真正跳转飞书或 Google。

## 本地运行

```bash
npm install
npm run dev
```

打开终端显示的本地地址，通常是：

```text
http://127.0.0.1:5173/
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
- 本地 React state 模拟数据

## 下一步

如果要变成公司内部可用版本，需要补齐：

- 后端服务
- 飞书 OAuth 回调
- Google OAuth 回调
- 用户表和组织表
- 项目组权限
- 任务数据持久化
- 部署域名和环境变量
