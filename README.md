# PM board

一个使用 React + Tailwind CSS 构建的「人人都是PM」认领制协作面板 SPA 原型。

## 启动方式

```bash
npm install
npm run dev
```

开发服务器启动后，打开终端里显示的 Local URL。

## 演示链路

- 项目发起：创建 PM board World Cup 项目，编辑 Markdown 项目计划书
- 任务拆分：点击 AI 智能拆分，1.5 秒后生成 7 个预设任务
- 公共任务池：切换团队成员视角，认领任务并生成子项目入口
- 子项目管理：调整进度、切换状态、添加子任务、分配协作者、关联飞书文档、发布更新
- 总PM Dashboard：查看整体进度、任务卡片、更新 Feed、人员负载和成员筛选
- 部门大盘：老板视角查看多个项目，并展开内部任务分布

## 技术说明

- Vite + React 18
- Tailwind CSS
- 本地 React state 模拟数据，不依赖后端
- 代码集中在 `src/App.jsx`，方便后续拆分模块并接入飞书 API
