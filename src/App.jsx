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
  { id: 'lead', name: '发起项目', title: '我是总 PM', text: '上传计划，拆出公共任务池，让成员认领责任。' },
  { id: 'member', name: '加入协作', title: '我是成员', text: '选择项目组，认领任务，成为自己模块的子 PM。' },
  { id: 'viewer', name: '查看进展', title: '我是观察者', text: '不用打扰团队，也能看到项目节奏和风险变化。' },
]

const providers = {
  feishu: { name: '飞书账号', hint: '适合公司内部统一登录', icon: Building2, authPath: '/api/auth/login' },
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

function cx(...classes) {
  return classes.filter(Boolean).join(' ')
}

function App() {
  const [stage, setStage] = useState('intro')
  const [role, setRole] = useState('member')
  const [provider, setProvider] = useState('')
  const [loadingProvider, setLoadingProvider] = useState('')
  const [authError, setAuthError] = useState('')
  const [verified, setVerified] = useState({ realName: '', org: '', roleName: '项目成员' })
  const [selectedGroup, setSelectedGroup] = useState('demo')
  const [taskItems, setTaskItems] = useState(starterTasks)
  const [activityItems, setActivityItems] = useState(starterUpdates)

  const selectedRole = roles.find((item) => item.id === role) ?? roles[1]
  const selected = groups.find((item) => item.id === selectedGroup) ?? groups[0]
  const progress = useMemo(() => Math.round(taskItems.reduce((sum, task) => sum + task.progress, 0) / taskItems.length), [taskItems])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const incomingAuthError = params.get('auth_error')
    if (incomingAuthError) {
      setAuthError(incomingAuthError)
      setStage('auth')
      window.history.replaceState(null, '', window.location.pathname)
    }

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
    setAuthError('')
    setLoadingProvider(nextProvider)
    window.location.href = providers[nextProvider].authPath
  }

  function startDemoLogin() {
    setProvider('demo')
    setAuthError('')
    setLoadingProvider('demo')
    window.location.href = '/api/auth/dev-login'
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
    setAuthError('')
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
    <main className="min-h-[100dvh] overflow-hidden bg-[var(--page)] text-[var(--ink)]">
      <div className="ambient-grid" />
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <Header stage={stage} onReset={reset} />
        <div className="stage-shell">
          {stage === 'intro' ? <IntroScreen selectedRole={selectedRole} role={role} setRole={setRole} onContinue={() => setStage('auth')} /> : null}
          {stage === 'auth' ? <AuthScreen selectedRole={selectedRole} loadingProvider={loadingProvider} authError={authError} onLogin={startLogin} onDemoLogin={startDemoLogin} /> : null}
          {stage === 'verify' ? <VerifyScreen provider={provider} verified={verified} setVerified={setVerified} onSubmit={submitVerify} /> : null}
          {stage === 'groups' ? <GroupScreen selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} onEnter={() => setStage('board')} /> : null}
          {stage === 'board' ? <BoardScreen group={selected} progress={progress} tasks={taskItems} updates={activityItems} onInvite={inviteMember} onReset={reset} /> : null}
        </div>
      </div>
    </main>
  )
}

function Header({ stage, onReset }) {
  const steps = ['选择', '登录', '实名', '项目组', '工作台']
  const active = { intro: 0, auth: 1, verify: 2, groups: 3, board: 4 }[stage]

  return (
    <header className="flex h-16 items-center justify-between">
      <button onClick={onReset} className="brand-button">
        <span className="brand-mark"><Sparkles size={17} /></span>
        <span>
          <span className="block text-sm font-semibold">PM Board</span>
          <span className="block text-xs text-[var(--muted)]">open collaboration workspace</span>
        </span>
      </button>

      <nav className="step-nav">
        {steps.map((step, index) => (
          <span key={step} className={cx('step-pill', index === active && 'step-pill-active', index < active && 'step-pill-done')}>
            {step}
          </span>
        ))}
      </nav>

      <a className="ghost-link" href="https://github.com/yokyliu93-art/PM-Borad" target="_blank" rel="noreferrer">
        <Globe2 size={16} />
        Open source
      </a>
    </header>
  )
}

function IntroScreen({ selectedRole, role, setRole, onContinue }) {
  return (
    <section className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="max-w-2xl">
        <p className="quiet-badge"><Globe2 size={15} />给任何团队自部署的 PM 协作入口</p>
        <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-normal text-[var(--ink)] md:text-7xl">
          先选角色，
          <span className="block text-[var(--muted-strong)]">再进入项目。</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-[var(--muted)]">
          登录、实名、入组、认领任务。开源也能保持清楚的责任流转。
        </p>
      </div>

      <GlassPanel className="p-3">
        <div className="grid gap-2 sm:grid-cols-3">
          {roles.map((item) => (
            <button key={item.id} onClick={() => setRole(item.id)} className={cx('choice-card', role === item.id && 'choice-card-active')}>
              <span className="text-xs font-medium text-[var(--accent)]">{item.name}</span>
              <span className="mt-2 block font-semibold">{item.title}</span>
              <span className="mt-2 block text-sm leading-6 text-[var(--muted)]">{item.text}</span>
            </button>
          ))}
        </div>

        <div className="preview-panel mt-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-[var(--muted)]">当前选择</p>
              <h2 className="mt-1 text-2xl font-semibold">{selectedRole.title}</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">{selectedRole.text}</p>
            </div>
            <span className="icon-tile"><LayoutDashboard size={20} /></span>
          </div>

          <div className="mt-6 grid gap-2">
            {starterTasks.slice(0, 3).map((task) => (
              <TaskStrip key={task.title} task={task} compact />
            ))}
          </div>

          <button onClick={onContinue} className="primary-button mt-6 w-full">
            继续登录
            <ArrowRight size={17} />
          </button>
        </div>
      </GlassPanel>
    </section>
  )
}

function AuthScreen({ selectedRole, loadingProvider, authError, onLogin, onDemoLogin }) {
  return (
    <section className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[0.86fr_440px]">
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-[var(--accent)]">你将以「{selectedRole.title}」进入</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-normal md:text-6xl">登录后保存你的责任边界</h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-[var(--muted)]">
          飞书面向公司内部，Google 面向外部协作和开源部署。
        </p>
      </div>

      <GlassPanel className="p-6">
        <div className="mb-6">
          <p className="text-sm text-[var(--muted)]">账号登录</p>
          <h2 className="mt-1 text-2xl font-semibold">选择登录方式</h2>
        </div>
        {authError ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            <span className="block font-semibold">登录暂时没有配置好</span>
            <span className="mt-1 block">{authError}</span>
          </div>
        ) : null}
        <div className="space-y-2">
          {Object.entries(providers).map(([id, item]) => (
            <ProviderButton key={id} id={id} provider={item} loadingProvider={loadingProvider} onLogin={onLogin} />
          ))}
        </div>
        <button onClick={onDemoLogin} disabled={Boolean(loadingProvider)} className="demo-login-button">
          <span className="flex items-center gap-3">
            <span className="icon-tile bg-white text-[var(--accent)]"><Sparkles size={20} /></span>
            <span>
              <span className="block font-medium">使用演示账号进入</span>
              <span className="mt-1 block text-sm text-[var(--muted)]">先体验入组、认领和邀请流程</span>
            </span>
          </span>
          {loadingProvider === 'demo' ? <span className="loader-dot" /> : <ChevronRight size={19} />}
        </button>
        <div className="notice-box mt-5">
          <LockKeyhole className="text-[var(--accent)]" size={18} />
          <span>正式登录需要 OAuth 密钥。没有密钥时，可以先用演示账号。</span>
        </div>
      </GlassPanel>
    </section>
  )
}

function ProviderButton({ id, provider, loadingProvider, onLogin }) {
  const Icon = provider.icon
  const loading = loadingProvider === id
  return (
    <button onClick={() => onLogin(id)} disabled={Boolean(loadingProvider)} className="provider-button">
      <span className="flex items-center gap-3">
        <span className="provider-icon"><Icon size={20} /></span>
        <span>
          <span className="block font-medium">{provider.name}</span>
          <span className="mt-1 block text-sm text-[var(--muted)]">{provider.hint}</span>
        </span>
      </span>
      {loading ? <span className="loader-dot" /> : <ChevronRight size={19} />}
    </button>
  )
}

function VerifyScreen({ provider, verified, setVerified, onSubmit }) {
  const providerName = providers[provider]?.name || '演示账号'

  return (
    <section className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[0.85fr_1fr]">
      <GlassPanel className="p-6">
        <p className="text-sm text-[var(--muted)]">已通过 {providerName}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-normal">实名让任务可追踪</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">开源版本可以改成组织成员资料，也可以关闭实名要求。</p>
        <div className="mt-7 space-y-4">
          <ProcessItem icon={BadgeCheck} title="账号已绑定" detail="登录来源已记录。" done />
          <ProcessItem icon={CircleUserRound} title="补充实名" detail="填写真实姓名和组织。" active />
          <ProcessItem icon={UsersRound} title="选择项目组" detail="加入对应工作空间。" />
        </div>
      </GlassPanel>

      <form onSubmit={onSubmit} className="glass-panel p-6">
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
        <p className="text-sm font-medium text-[var(--accent)]">项目组</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-normal md:text-6xl">选择一个工作空间</h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)]">每个项目组都有独立的任务池、成员、权限和复盘记录。</p>
      </div>

      <div className="mt-8 grid gap-3 lg:grid-cols-3">
        {groups.map((group) => (
          <button key={group.id} onClick={() => setSelectedGroup(group.id)} className={cx('group-card', selectedGroup === group.id && 'group-card-active')}>
            <span className="icon-tile"><UsersRound size={20} /></span>
            <h2 className="mt-6 text-xl font-semibold">{group.name}</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{group.summary}</p>
            <div className="mt-6 flex gap-3 text-sm text-[var(--muted)]">
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
    <section className="grid flex-1 gap-4 py-5 lg:grid-cols-[280px_1fr]">
      <aside className="glass-panel p-5">
        <div className="flex items-center gap-3">
          <span className="icon-tile"><LayoutDashboard size={20} /></span>
          <div>
            <p className="font-semibold">{group.name}</p>
            <p className="text-sm text-[var(--muted)]">项目工作台</p>
          </div>
        </div>
        <div className="mt-6 grid gap-2">
          <MiniStat label="总进度" value={`${progress}%`} />
          <MiniStat label="成员" value={String(group.members)} />
          <MiniStat label="任务" value={String(group.tasks)} />
        </div>
        <button onClick={onReset} className="secondary-button mt-8 w-full">
          <LogOut size={16} />
          退出演示账号
        </button>
      </aside>

      <div className="glass-panel p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--accent)]">公共任务池</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal">认领后，你就是这块的 PM</h1>
          </div>
          <div className="flex gap-2">
            <button className="icon-button" aria-label="搜索"><Search size={17} /></button>
            <button className="icon-button" aria-label="文档"><FileText size={17} /></button>
          </div>
        </div>

        <div className="mt-6 grid gap-2">
          {tasks.map((task) => (
            <div key={task.title} className="task-card">
              <div className="grid gap-4 md:grid-cols-[1fr_82px_88px_174px] md:items-center">
                <div>
                  <p className="font-medium">{task.title}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{task.owner ? `${task.owner} / ${task.due}` : `暂无认领 / ${task.due}`}</p>
                  {task.invited.length ? <p className="mt-2 text-xs text-[var(--accent)]">已邀请：{task.invited.join('、')}</p> : null}
                </div>
                <span className="text-sm text-[var(--muted)]">{task.progress}%</span>
                <StatusBadge status={task.status} />
                <div className="flex gap-2">
                  <button className="small-primary">认领</button>
                  <button onClick={() => setInviteTask(inviteTask === task.title ? '' : task.title)} className="small-secondary">
                    <Send size={15} />
                    邀请
                  </button>
                </div>
              </div>
              {inviteTask === task.title ? (
                <div className="invite-panel">
                  <p className="text-sm font-medium text-[var(--ink)]">邀请谁来负责这个任务？</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {members.map((member) => (
                      <button key={member} onClick={() => onInvite(task.title, member)} className="member-chip">
                        {member}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="activity-panel mt-6">
          <p className="text-sm font-medium">最近动态</p>
          <div className="mt-3 grid gap-2">
            {updates.map(([name, text, time]) => (
              <p key={`${name}-${text}`} className="text-sm text-[var(--muted)]">
                <span className="font-medium text-[var(--ink)]">{name}</span> {text}
                <span className="ml-2 text-[var(--muted-soft)]">{time}</span>
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function GlassPanel({ children, className = '' }) {
  return <div className={cx('glass-panel', className)}>{children}</div>
}

function TaskStrip({ task }) {
  return (
    <div className="task-strip">
      <div>
        <p className="text-sm font-medium">{task.title}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{task.owner || '暂无认领'} / {task.due}</p>
      </div>
      <StatusBadge status={task.status} />
    </div>
  )
}

function StatusBadge({ status }) {
  return <span className={cx('status-badge', status === '进行中' && 'status-active', status === '已邀请' && 'status-invited')}>{status}</span>
}

function ProcessItem({ icon: Icon, title, detail, done = false, active = false }) {
  return (
    <div className="flex gap-3">
      <span className={cx('process-icon', done && 'process-icon-done', active && 'process-icon-active')}>
        {done ? <Check size={18} /> : <Icon size={18} />}
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-sm text-[var(--muted)]">{detail}</span>
      </span>
    </div>
  )
}

function Field({ label, helper, children }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-[var(--ink)]">{label}</span>
      {children}
      <span className="text-xs text-[var(--muted)]">{helper}</span>
    </label>
  )
}

function MiniStat({ label, value }) {
  return (
    <div className="mini-stat">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{label}</p>
    </div>
  )
}

export default App
