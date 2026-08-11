import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  ChevronRight,
  CircleUserRound,
  FileText,
  Globe2,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Mail,
  Send,
  Search,
  Sparkles,
  UsersRound,
} from 'lucide-react'

const roles = [
  {
    id: 'lead',
    name: '发起项目',
    title: '我是总 PM',
    text: '上传计划，拆出公共任务池，让成员认领责任。',
  },
  {
    id: 'member',
    name: '加入协作',
    title: '我是成员',
    text: '选择项目组，认领任务，成为自己模块的子 PM。',
  },
  {
    id: 'viewer',
    name: '查看进展',
    title: '我是观察者',
    text: '不用打扰团队，也能看到项目节奏和风险变化。',
  },
]

const providers = {
  feishu: { name: '飞书账号', hint: '推荐给企业和项目组', icon: Building2, authPath: '/api/auth/login' },
  google: { name: 'Google 登录', hint: '适合外部成员和开源用户', icon: Mail, authPath: '/api/auth/google/login' },
}

const groups = [
  { id: 'demo', name: 'PM Board Demo', members: 18, tasks: 32, summary: '开源演示项目，包含任务认领、实名责任人和项目复盘。' },
  { id: 'agentank', name: 'AgenTank World Cup', members: 12, tasks: 24, summary: '赛事筹备项目，覆盖赞助、宣发、产品、直播和赛后内容。' },
  { id: 'community', name: 'Community Ops', members: 9, tasks: 15, summary: '社区运营项目，管理活动排期、成员协作和内容节奏。' },
]

const members = ['雅婷', '奚晨', '雨霏', '饶帅', '小艺', 'Yoky']

const starterTasks = [
  { title: '整理项目计划书', owner: 'Yoky', status: '进行中', due: '今天', progress: 72, invited: [] },
  { title: '拆分公共任务池', owner: '雅婷', status: '进行中', due: '明天', progress: 64, invited: [] },
  { title: '确认项目组成员', owner: '', status: '待认领', due: '本周', progress: 0, invited: ['奚晨'] },
  { title: '发布阶段复盘', owner: '', status: '待认领', due: '下周', progress: 0, invited: [] },
]

const starterUpdates = [
  ['雅婷', '认领了公共任务池拆分', '2 分钟前'],
  ['奚晨', '邀请 3 位成员加入项目组', '12 分钟前'],
  ['Yoky', '更新了项目计划书', '25 分钟前'],
]

function App() {
  const [stage, setStage] = useState('intro')
  const [role, setRole] = useState('member')
  const [provider, setProvider] = useState('')
  const [loadingProvider, setLoadingProvider] = useState('')
  const [verified, setVerified] = useState({ realName: '', org: '', roleName: '项目成员' })
  const [selectedGroup, setSelectedGroup] = useState('demo')
  const [taskItems, setTaskItems] = useState(starterTasks)
  const [activityItems, setActivityItems] = useState(starterUpdates)

  const selectedRole = roles.find((item) => item.id === role) ?? roles[1]
  const selected = groups.find((item) => item.id === selectedGroup) ?? groups[0]
  const progress = useMemo(() => Math.round(taskItems.reduce((sum, task) => sum + task.progress, 0) / taskItems.length), [taskItems])

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!body?.ok) return
        setVerified((current) => ({
          ...current,
          realName: body.data?.name || current.realName,
          org: body.data?.department || current.org,
        }))
        setStage('groups')
      })
      .catch(() => {})
  }, [])

  function startLogin(nextProvider) {
    setProvider(nextProvider)
    setLoadingProvider(nextProvider)
    window.location.href = providers[nextProvider].authPath
  }

  function submitVerify(event) {
    event.preventDefault()
    if (!verified.realName.trim()) return
    setStage('groups')
  }

  function reset() {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    setStage('intro')
    setProvider('')
    setLoadingProvider('')
    setVerified({ realName: '', org: '', roleName: '项目成员' })
    setSelectedGroup('demo')
    setTaskItems(starterTasks)
    setActivityItems(starterUpdates)
  }

  function inviteMember(taskTitle, memberName) {
    setTaskItems((items) =>
      items.map((task) =>
        task.title === taskTitle
          ? {
              ...task,
              status: task.owner ? task.status : '已邀请',
              invited: task.invited.includes(memberName) ? task.invited : [...task.invited, memberName],
            }
          : task,
      ),
    )
    setActivityItems((items) => [['Yoky', `邀请 ${memberName} 认领「${taskTitle}」`, '刚刚'], ...items])
  }

  return (
    <main className="min-h-[100dvh] bg-[#f7fbfb] text-slate-950">
      <div className="soft-grid" />
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <Header stage={stage} onReset={reset} />

        {stage === 'intro' ? (
          <IntroScreen selectedRole={selectedRole} role={role} setRole={setRole} onContinue={() => setStage('auth')} />
        ) : null}
        {stage === 'auth' ? (
          <AuthScreen selectedRole={selectedRole} loadingProvider={loadingProvider} onLogin={startLogin} />
        ) : null}
        {stage === 'verify' ? (
          <VerifyScreen provider={provider} verified={verified} setVerified={setVerified} onSubmit={submitVerify} />
        ) : null}
        {stage === 'groups' ? (
          <GroupScreen selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} onEnter={() => setStage('board')} />
        ) : null}
        {stage === 'board' ? <BoardScreen group={selected} progress={progress} tasks={taskItems} updates={activityItems} onInvite={inviteMember} onReset={reset} /> : null}
      </div>
    </main>
  )
}

function Header({ stage, onReset }) {
  const steps = ['选择', '登录', '实名', '项目组', '工作台']
  const active = { intro: 0, auth: 1, verify: 2, groups: 3, board: 4 }[stage]

  return (
    <header className="flex h-16 items-center justify-between">
      <button onClick={onReset} className="flex items-center gap-3 text-left">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-teal-700 shadow-sm ring-1 ring-slate-200">
          <Sparkles size={18} />
        </span>
        <span>
          <span className="block text-sm font-semibold">PM Board</span>
          <span className="block text-xs text-slate-500">open collaboration workspace</span>
        </span>
      </button>

      <nav className="hidden rounded-full border border-slate-200 bg-white/80 p-1 shadow-sm backdrop-blur md:flex">
        {steps.map((step, index) => (
          <span key={step} className={`rounded-full px-3 py-1.5 text-xs transition ${index === active ? 'bg-slate-950 text-white' : index < active ? 'text-teal-700' : 'text-slate-400'}`}>
            {step}
          </span>
        ))}
      </nav>

      <a className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-950 sm:flex" href="https://github.com" target="_blank" rel="noreferrer">
        <Globe2 size={16} />
        Open source ready
      </a>
    </header>
  )
}

function IntroScreen({ selectedRole, role, setRole, onContinue }) {
  return (
    <section className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[0.92fr_1.08fr]">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white px-3 py-1 text-sm text-teal-700 shadow-sm">
          <Globe2 size={15} />
          给任何团队自部署的 PM 协作入口
        </p>
        <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[1.04] tracking-normal text-slate-950 md:text-7xl">
          先选角色，
          <span className="block text-slate-500">再进入项目。</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-slate-600">
          一个清爽的开源 PM board：登录、实名、入组、认领任务，流程简单但责任清楚。
        </p>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/70">
        <div className="grid gap-3 sm:grid-cols-3">
          {roles.map((item) => (
            <button key={item.id} onClick={() => setRole(item.id)} className={`rounded-2xl border p-4 text-left transition ${role === item.id ? 'border-teal-300 bg-teal-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
              <span className="text-xs font-medium text-teal-700">{item.name}</span>
              <span className="mt-2 block font-semibold">{item.title}</span>
              <span className="mt-2 block text-sm leading-6 text-slate-500">{item.text}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-3xl border border-slate-200 bg-[#f8fbfb] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">当前选择</p>
              <h2 className="mt-1 text-2xl font-semibold">{selectedRole.title}</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">{selectedRole.text}</p>
            </div>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-teal-700 shadow-sm ring-1 ring-slate-200">
              <LayoutDashboard size={20} />
            </span>
          </div>

          <div className="mt-6 space-y-3">
            {starterTasks.slice(0, 3).map((task) => (
              <div key={task.title} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100">
                <div>
                  <p className="text-sm font-medium">{task.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{task.owner} / {task.due}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{task.status}</span>
              </div>
            ))}
          </div>

          <button onClick={onContinue} className="primary-button mt-6 w-full">
            继续登录
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </section>
  )
}

function AuthScreen({ selectedRole, loadingProvider, onLogin }) {
  return (
    <section className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[0.86fr_440px]">
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-teal-700">你将以「{selectedRole.title}」进入</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-normal md:text-6xl">登录后保存你的责任边界</h1>
        <p className="mt-5 text-base leading-7 text-slate-600">
          飞书适合企业成员，Google 适合外部协作者和开源部署。后续可以接邮箱密码或 GitHub 登录。
        </p>
      </div>

      <Panel>
        <div className="mb-6">
          <p className="text-sm text-slate-500">账号登录</p>
          <h2 className="mt-1 text-2xl font-semibold">选择登录方式</h2>
        </div>
        <div className="space-y-3">
          {Object.entries(providers).map(([id, provider]) => (
            <ProviderButton key={id} id={id} provider={provider} loadingProvider={loadingProvider} onLogin={onLogin} />
          ))}
        </div>
        <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600 ring-1 ring-slate-200">
          <LockKeyhole className="mb-2 text-teal-700" size={18} />
          这里会跳转到后端 OAuth 路由。开发环境需要同时启动前端和后端，并配置对应登录密钥。
        </div>
      </Panel>
    </section>
  )
}

function ProviderButton({ id, provider, loadingProvider, onLogin }) {
  const Icon = provider.icon
  const loading = loadingProvider === id
  return (
    <button onClick={() => onLogin(id)} disabled={Boolean(loadingProvider)} className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-teal-300 hover:bg-teal-50 active:translate-y-px disabled:opacity-60">
      <span className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white">
          <Icon size={20} />
        </span>
        <span>
          <span className="block font-medium">{provider.name}</span>
          <span className="mt-1 block text-sm text-slate-500">{provider.hint}</span>
        </span>
      </span>
      {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" /> : <ChevronRight size={19} />}
    </button>
  )
}

function VerifyScreen({ provider, verified, setVerified, onSubmit }) {
  return (
    <section className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[0.85fr_1fr]">
      <Panel>
        <p className="text-sm text-slate-500">已通过 {providers[provider]?.name}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-normal">实名让任务可追踪</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">开源版本可以把实名改成组织内成员资料，也可以关闭实名要求。</p>
        <div className="mt-7 space-y-4">
          <ProcessItem icon={BadgeCheck} title="账号已绑定" detail="登录来源已记录。" done />
          <ProcessItem icon={CircleUserRound} title="补充实名" detail="填写真实姓名和组织。" active />
          <ProcessItem icon={UsersRound} title="选择项目组" detail="加入对应工作空间。" />
        </div>
      </Panel>

      <form onSubmit={onSubmit} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70">
        <div className="grid gap-5">
          <Field label="真实姓名" helper="用于任务认领和复盘归档">
            <input value={verified.realName} onChange={(event) => setVerified({ ...verified, realName: event.target.value })} className="input" placeholder="输入你的姓名" />
          </Field>
          <Field label="组织名称" helper="公司、社群、学校或开源团队">
            <input value={verified.org} onChange={(event) => setVerified({ ...verified, org: event.target.value })} className="input" placeholder="例如 PM Board Community" />
          </Field>
          <Field label="默认角色" helper="进入项目组后仍可调整">
            <select value={verified.roleName} onChange={(event) => setVerified({ ...verified, roleName: event.target.value })} className="input">
              <option>项目成员</option>
              <option>总 PM</option>
              <option>子 PM</option>
              <option>观察者</option>
            </select>
          </Field>
        </div>
        <button className="primary-button mt-6 w-full" disabled={!verified.realName.trim()}>
          完成实名
          <ArrowRight size={17} />
        </button>
      </form>
    </section>
  )
}

function GroupScreen({ selectedGroup, setSelectedGroup, onEnter }) {
  return (
    <section className="flex flex-1 flex-col justify-center py-8">
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-teal-700">项目组</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-normal md:text-6xl">选择一个工作空间</h1>
        <p className="mt-4 text-base leading-7 text-slate-600">每个项目组都有独立的任务池、成员、权限和复盘记录。</p>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {groups.map((group) => (
          <button key={group.id} onClick={() => setSelectedGroup(group.id)} className={`rounded-[24px] border p-5 text-left transition hover:-translate-y-0.5 ${selectedGroup === group.id ? 'border-teal-300 bg-teal-50 shadow-lg shadow-teal-100' : 'border-slate-200 bg-white shadow-sm hover:border-slate-300'}`}>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-teal-700 shadow-sm ring-1 ring-slate-200">
              <UsersRound size={20} />
            </span>
            <h2 className="mt-6 text-xl font-semibold">{group.name}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{group.summary}</p>
            <div className="mt-6 flex gap-3 text-sm text-slate-500">
              <span>{group.members} 人</span>
              <span>{group.tasks} 个任务</span>
            </div>
          </button>
        ))}
      </div>

      <button onClick={onEnter} className="primary-button ml-auto mt-8">
        进入工作台
        <ArrowRight size={17} />
      </button>
    </section>
  )
}

function BoardScreen({ group, progress, tasks, updates, onInvite, onReset }) {
  const [inviteTask, setInviteTask] = useState('')

  return (
    <section className="grid flex-1 gap-5 py-5 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
            <LayoutDashboard size={20} />
          </span>
          <div>
            <p className="font-semibold">{group.name}</p>
            <p className="text-sm text-slate-500">项目工作台</p>
          </div>
        </div>
        <div className="mt-6 grid gap-3">
          <MiniStat label="总进度" value={`${progress}%`} />
          <MiniStat label="成员" value={String(group.members)} />
          <MiniStat label="任务" value={String(group.tasks)} />
        </div>
        <button onClick={onReset} className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-3 py-3 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-slate-950">
          <LogOut size={16} />
          退出演示账号
        </button>
      </aside>

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-700">公共任务池</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal">认领后，你就是这块的 PM</h1>
          </div>
          <div className="flex gap-2">
            <button className="icon-button"><Search size={17} /></button>
            <button className="icon-button"><FileText size={17} /></button>
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          {tasks.map((task) => (
            <div key={task.title} className="rounded-2xl border border-slate-200 bg-[#fbfefe] p-4 transition hover:border-teal-200 hover:shadow-sm">
              <div className="grid gap-4 md:grid-cols-[1fr_100px_100px_190px] md:items-center">
                <div>
                  <p className="font-medium">{task.title}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {task.owner ? `${task.owner} / ${task.due}` : `暂无认领 / ${task.due}`}
                  </p>
                  {task.invited.length ? <p className="mt-2 text-xs text-teal-700">已邀请：{task.invited.join('、')}</p> : null}
                </div>
                <span className="text-sm text-slate-500">{task.progress}%</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-center text-sm text-slate-600">{task.status}</span>
                <div className="flex gap-2">
                  <button className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-700">认领</button>
                  <button onClick={() => setInviteTask(inviteTask === task.title ? '' : task.title)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-teal-200 hover:bg-teal-50">
                    <Send size={15} />
                    邀请
                  </button>
                </div>
              </div>
              {inviteTask === task.title ? (
                <div className="mt-4 rounded-2xl border border-teal-100 bg-teal-50/70 p-3">
                  <p className="text-sm font-medium text-slate-800">邀请谁来负责这个任务？</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {members.map((member) => (
                      <button
                        key={member}
                        onClick={() => onInvite(task.title, member)}
                        className="rounded-full border border-teal-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition hover:bg-teal-600 hover:text-white"
                      >
                        {member}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <p className="text-sm font-medium">最近动态</p>
          <div className="mt-3 grid gap-2">
            {updates.map(([name, text, time]) => (
              <p key={`${name}-${text}`} className="text-sm text-slate-600">
                <span className="font-medium text-slate-950">{name}</span> {text}
                <span className="ml-2 text-slate-400">{time}</span>
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Panel({ children }) {
  return <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70">{children}</div>
}

function ProcessItem({ icon: Icon, title, detail, done = false, active = false }) {
  return (
    <div className="flex gap-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${done ? 'bg-teal-600 text-white' : active ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-400'}`}>
        {done ? <Check size={18} /> : <Icon size={18} />}
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-sm text-slate-500">{detail}</span>
      </span>
    </div>
  )
}

function Field({ label, helper, children }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-slate-800">{label}</span>
      {children}
      <span className="text-xs text-slate-500">{helper}</span>
    </label>
  )
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  )
}

export default App
