import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useParams, Outlet } from 'react-router-dom';
import { get, getOptional, post } from './lib/api';
import { useStore } from './store';
import { Shell } from './components/layout/Shell';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ProjectList } from './pages/ProjectList';
import { ProjectCreate } from './pages/ProjectCreate';
import { TaskPool } from './pages/TaskPool';
import { PersonalPanel } from './pages/PersonalPanel';
import { Subproject } from './pages/Subproject';
import { Dashboard } from './pages/Dashboard';
import { BossBoard } from './pages/BossBoard';
import { ContentHub } from './pages/ContentHub';
import { MyWorkspace } from './pages/MyWorkspace';
import { ArrowRight, Check, FileText, LayoutDashboard, Loader2, ShieldCheck, UsersRound } from 'lucide-react';

const landingFlow = [
  { title: '看清项目', detail: '把目标、时间线和关键事项放在同一个入口' },
  { title: '交给 Agent', detail: '总PM复制 API Key 和说明书，在自己的 Agent 里拆模块' },
  { title: '回传模块', detail: 'Agent 确认后把模块、计划和资源配合传回 PM Board' },
  { title: '提交复盘', detail: '交付物、进展和确认记录都沉淀下来' },
];

const productTour = [
  { title: '项目负责人发起项目', detail: '创建项目组、导入计划书，复制总PM Agent 包。', icon: FileText },
  { title: 'Agent 回传模块', detail: '拆解在 Agent 里完成，PM Board 接收模块、计划和资源需求。', icon: UsersRound },
  { title: '过程透明推进', detail: '进展更新、任务确认和复盘材料留在同一个工作台。', icon: LayoutDashboard },
];

const scenarioCards = [
  { title: '公司项目', detail: '飞书授权后自动进入组织空间，适合跨部门项目协同。' },
  { title: '活动筹备', detail: '把嘉宾、赞助、物料、宣发拆成公开任务，成员自己认领。' },
  { title: '开源团队', detail: '可以替换登录系统和数据库，让外部贡献者进入项目组。' },
];

const openSourceNotes = [
  '可替换登录方式',
  '可配置组织和项目组',
  '可连接你自己的数据库',
  '适合二次开发成内部工具',
];

function LandingPage() {
  return (
    <main className="pm-landing">
      <div className="pm-landing-field" />
      <header className="pm-landing-nav">
        <a className="pm-brand" href="/">
          <img className="gxr-logo-mark" src="/guixingren-logo.jpg" alt="硅星人" />
          <div>
            <strong>硅星人 PM Board</strong>
            <small>给 Agent 协作项目用的内部工作台</small>
          </div>
        </a>
        <a className="pm-nav-login" href="/api/auth/login">飞书登录</a>
      </header>

      <section className="pm-hero">
        <div className="pm-hero-copy">
          <p className="pm-badge"><ShieldCheck size={15} />硅星人项目协作实验</p>
          <h1>让项目计划变成可认领的责任网络</h1>
          <p>总 PM 把项目计划交给自己的 Agent 拆解。Agent 确认后回传模块，硅星人 PM Board 再承接认领、进展和交付记录。</p>
          <div className="pm-actions">
            <a href="/api/auth/login" className="pm-primary">
              使用飞书登录
              <ArrowRight size={17} />
            </a>
            <a href="#tour" className="pm-secondary">看看怎么用</a>
            <a href="/api/auth/dev-login" className="pm-secondary">本地开发进入</a>
          </div>
          <div className="pm-signal-strip" aria-label="PM Board 核心流程">
            <span>硅星人</span>
            <span>组织授权</span>
            <span>Agent 包</span>
            <span>模块回传</span>
            <span>复盘记录</span>
          </div>
        </div>

        <section className="pm-product-panel">
          <div className="pm-panel-head">
            <img className="gxr-logo-mark" src="/guixingren-logo.jpg" alt="硅星人" />
            <div>
              <strong>硅星人 PM Board</strong>
              <small>从 Agent 拆解到进度沉淀</small>
            </div>
          </div>
          <div className="pm-flow-list">
            {landingFlow.map((item, index) => (
              <div key={item.title} className="pm-flow-row">
                <span>{index + 1}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="pm-product-note">
            <strong>登录后进入你的组织项目</strong>
            <p>你会看到 Agent 回传的模块、自己负责的任务和交付进展。</p>
          </div>
        </section>
      </section>

      <section id="tour" className="pm-section">
        <div className="pm-section-copy">
          <h2>它不是再做一个任务列表</h2>
          <p>它把 Agent 回传的模块、责任人和交付记录放在一条线上，让每个人都知道自己负责什么、需要推进什么。</p>
        </div>
        <div className="pm-tour-grid">
          {productTour.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="pm-tour-card">
                <span className="pm-icon-tile"><Icon size={19} /></span>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="pm-showcase">
        <div className="pm-showcase-board">
          <div className="pm-showcase-header">
            <div>
              <p>硅星人 PM Board</p>
              <h2>一个项目如何跑起来</h2>
            </div>
            <span>进行中</span>
          </div>
          <div className="pm-showcase-lanes">
            <div>
              <span>计划书</span>
              <strong>赛事筹备总计划</strong>
              <p>目标、预算、关键时间点</p>
            </div>
            <div>
              <span>Agent 回传模块</span>
              <strong>24 个责任模块</strong>
              <p>宣发、赞助、嘉宾、直播</p>
            </div>
            <div className="pm-active-lane">
              <span>责任人</span>
              <strong>12 位成员推进中</strong>
              <p>状态、进度、邀请记录同步</p>
            </div>
          </div>
        </div>
        <div className="pm-section-copy">
          <h2>给团队展示的不是页面，而是一套协作动作</h2>
          <p>发起项目的人负责和 Agent 把模块拆清楚；成员进入项目组后认领对应模块；每次更新都会进入项目复盘记录。</p>
        </div>
      </section>

      <section className="pm-section">
        <div className="pm-section-copy">
          <h2>适合这些项目组先用起来</h2>
          <p>PM Board 更适合任务边界还在变化、但必须有人负责推进的项目。</p>
        </div>
        <div className="pm-scenario-grid">
          {scenarioCards.map((item) => (
            <article key={item.title} className="pm-scenario-card">
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pm-open-section">
        <div>
          <h2>以后开源给别人用，也说得通</h2>
          <p>登录方式、组织权限和项目组模型都可以替换。公司可以接飞书，外部团队可以接 Google，开源部署可以继续扩展。</p>
        </div>
        <div>
          {openSourceNotes.map((item) => (
            <span key={item}><Check size={16} />{item}</span>
          ))}
        </div>
      </section>

      <section className="pm-final-cta">
        <h2>先登录进去，看一遍完整流程</h2>
        <p>等飞书权限开好，这里就会成为公司成员进入项目空间的正式入口。</p>
        <a href="/api/auth/login" className="pm-primary">
          飞书登录
          <ArrowRight size={17} />
        </a>
        <a href="/api/auth/dev-login" className="pm-secondary">本地开发进入</a>
      </section>
    </main>
  );
}

function AuthGate() {
  const { setCurrentUser, setCurrentTeamId, currentUser } = useStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getOptional('/api/auth/me').then(async (r) => {
      if (r.ok) {
        setCurrentUser(r.data);
        const defaultTeamId = r.data.defaultTeamId;
        const tRes = await get('/api/teams');
        let teams = tRes.data || [];
        if (teams.length === 0) {
          await post('/api/teams', { name: '我的团队' });
          const tRes2 = await get('/api/teams');
          teams = tRes2.data || [];
        }
        // Prefer the shared default team (all projects live there), else the newest team.
        const preferred = teams.find((t) => t.id === defaultTeamId) || teams[0];
        if (preferred) setCurrentTeamId(preferred.id);
        setChecking(false);
      } else {
        setChecking(false);
      }
    }).catch(() => setChecking(false));
  }, []);

  if (checking) return <div className="claude-skin min-h-screen bg-[#f4efe7] grid place-items-center"><Loader2 className="animate-spin" size={32} /></div>;
  if (!currentUser) {
    return <LandingPage />;
  }

  return <Outlet />;
}

function ProjectRoutes() {
  const { projectId } = useParams();
  const { setActiveProjectId, setActiveProject } = useStore();

  useEffect(() => {
    if (projectId) {
      setActiveProjectId(projectId);
      get(`/api/projects/${projectId}`).then((r) => {
        if (r.ok) setActiveProject(r.data);
      });
    }
  }, [projectId]);

  return (
    <Routes>
      <Route index element={<Navigate to="pool" replace />} />
      <Route path="pool" element={<TaskPool />} />
      <Route path="content" element={<ContentHub />} />
      <Route path="edit" element={<ProjectCreate />} />
      <Route path="mine" element={<PersonalPanel />} />
      <Route path="tasks/:taskId" element={<Subproject />} />
      <Route path="commander" element={<Dashboard />} />
      <Route path="boss" element={<BossBoard />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AuthGate />}>
          <Route element={<Shell />}>
          <Route index element={<Navigate to="/board" replace />} />
          <Route path="/board" element={<BossBoard />} />
          <Route path="/topics" element={<Navigate to="/topics/daily" replace />} />
          <Route path="/topics/daily" element={<ContentHub mode="topics" initialTopicType="daily" />} />
          <Route path="/topics/deep" element={<ContentHub mode="topics" initialTopicType="deep" />} />
          <Route path="/demo" element={<ContentHub mode="demo" />} />
          <Route path="/eval" element={<ContentHub mode="eval" />} />
          <Route path="/my-work" element={<MyWorkspace />} />
          <Route path="/projects" element={<ProjectList />} />
          <Route path="/projects/create" element={<ProjectCreate />} />
          <Route path="/projects/:projectId/*" element={<ErrorBoundary><ProjectRoutes /></ErrorBoundary>} />
        </Route>
      </Route>
    </Routes>
  );
}
