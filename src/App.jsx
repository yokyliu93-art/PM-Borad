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
import { PublicEval } from './pages/PublicEval';
import { MyWorkspace } from './pages/MyWorkspace';
import { ArrowRight, Check, FlaskConical, LayoutDashboard, Loader2, Microscope, Newspaper, ShieldCheck } from 'lucide-react';

const landingFlow = [
  { title: '周会进来', detail: '周会文档、速记文档和 memo 作为来源，不再散落在群里' },
  { title: '板块归位', detail: '选题、Demo、Eval、Build、Frontier、Prompt 各自沉淀' },
  { title: '负责人推进', detail: '王兆洋分配选题，作者和 Agent 每天同步进度' },
  { title: '统帅总览', detail: '老板授权后直接看全局进度、负责人和阻塞点' },
];

const productTour = [
  { title: '选题推进', detail: '日常、商务、深度选题分开看。一级卡片只看重点，点进去看周会讨论、初稿和编辑建议。', icon: Newspaper },
  { title: 'Demo 与 Memo', detail: '团队把体验和 memo 扔进池子，沉淀出可 demo 的项目候选。', icon: FlaskConical },
  { title: 'Eval 测试集', detail: '飞书文档解析成一道一道可复制的 prompt，方便大家测新模型。', icon: Microscope },
  { title: 'Build 项目', detail: '复杂项目单独进入 Build，用 Agent key 回传模块、timeline 和进度。', icon: LayoutDashboard },
];

const scenarioCards = [
  { title: '每天更新', detail: '作者和自己的 Agent 同步今天完成了什么、明天推进什么。' },
  { title: '每周复盘', detail: '周会文档和速记文档进入系统，形成本周选题、讨论纪要和后续动作。' },
  { title: '给老板看', detail: '统帅视角聚合 Eval、Build、选题、Demo，不需要翻一堆群消息。' },
];

const openSourceNotes = [
  '飞书授权登录',
  '个人 Agent Key',
  '飞书文档解析',
  '可扩展到外部团队',
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
            <small>硅星人日常协作工作台</small>
          </div>
        </a>
        <a className="pm-nav-login" href="/api/auth/login">飞书登录</a>
      </header>

      <section className="pm-hero">
        <div className="pm-hero-copy">
          <p className="pm-badge"><ShieldCheck size={15} />硅星人内部协作中枢</p>
          <h1>把周会、选题、Demo、Eval 和 Build 放回一张板</h1>
          <p>PM Board 是硅星人的日常协作入口。大家用飞书登录，让自己的 Agent 同步进度；老板授权后看统帅视角，直接知道每块事情谁在推进、卡在哪里。</p>
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
            <span>飞书授权</span>
            <span>周会解析</span>
            <span>选题推进</span>
            <span>Agent 同步</span>
            <span>统帅视角</span>
          </div>
        </div>

        <section className="pm-product-panel">
          <div className="pm-panel-head">
            <img className="gxr-logo-mark" src="/guixingren-logo.jpg" alt="硅星人" />
            <div>
              <strong>硅星人 PM Board</strong>
              <small>从周会到日常推进</small>
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
            <strong>登录后进入硅星人协作面板</strong>
            <p>你会看到部门大盘、选题池、Demo memo、Eval 测试集、Build 项目和自己的任务。</p>
          </div>
        </section>
      </section>

      <section id="tour" className="pm-section">
        <div className="pm-section-copy">
          <h2>它不是旧版项目大厅</h2>
          <p>现在的 PM Board 要服务硅星人编辑部的真实节奏：周会定方向，编辑分配选题，作者推进初稿，Agent 每天回传进度。</p>
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
              <h2>一周工作如何沉淀</h2>
            </div>
            <span>进行中</span>
          </div>
          <div className="pm-showcase-lanes">
            <div>
              <span>周会文档</span>
              <strong>选题、复盘、速记</strong>
              <p>飞书链接作为真实来源</p>
            </div>
            <div>
              <span>内容板块</span>
              <strong>选题 / Demo / Eval</strong>
              <p>每块各自归档和推进</p>
            </div>
            <div className="pm-active-lane">
              <span>负责人</span>
              <strong>9 位成员协作中</strong>
              <p>状态、建议、初稿同步</p>
            </div>
          </div>
        </div>
        <div className="pm-section-copy">
          <h2>给团队看的不是页面，而是工作现场</h2>
          <p>每一条飞书文档、每一次周会讨论、每个作者的初稿和编辑建议，都应该能找到位置。</p>
        </div>
      </section>

      <section className="pm-section">
        <div className="pm-section-copy">
          <h2>先服务硅星人的日常，再考虑开源</h2>
          <p>内部先跑通流程：选题、Demo、Eval、Build 都能接 Agent；之后再把登录、权限和数据源做成可替换能力。</p>
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
          <h2>未来给别人用，也要能换壳</h2>
          <p>硅星人版先接飞书和内部权限。开源以后，别人可以替换登录、数据库、组织结构和消息推送。</p>
        </div>
        <div>
          {openSourceNotes.map((item) => (
            <span key={item}><Check size={16} />{item}</span>
          ))}
        </div>
      </section>

      <section className="pm-final-cta">
        <h2>进入硅星人 PM Board</h2>
        <p>飞书授权后进入内部协作面板。未授权的人只看到入口，不会直接进入工作区。</p>
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
      <Route path="/p/eval/:id" element={<PublicEval />} />
      <Route element={<AuthGate />}>
          <Route element={<Shell />}>
          <Route index element={<Navigate to="/board" replace />} />
          <Route path="/board" element={<BossBoard />} />
          <Route path="/topics" element={<ContentHub mode="topics" initialTopicType="daily" />} />
          <Route path="/topics/daily" element={<ContentHub mode="topics" initialTopicType="daily" />} />
          <Route path="/topics/business" element={<ContentHub mode="topics" initialTopicType="business" />} />
          <Route path="/topics/deep" element={<ContentHub mode="topics" initialTopicType="deep" />} />
          <Route path="/topics/frontier" element={<ContentHub mode="frontier" initialTopicType="frontier" />} />
          <Route path="/topics/prompt" element={<ContentHub mode="prompt" initialTopicType="prompt" />} />
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
