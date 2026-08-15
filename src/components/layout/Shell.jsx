import { Toaster } from 'react-hot-toast';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { AgentAccountMenu } from '../AgentAccountMenu';
import { Boxes, UserCheck, LayoutDashboard, BarChart3, List, Plus, Settings, NotebookTabs, Presentation, ChevronDown, Circle, Microscope, Sparkles, MessageSquareText } from 'lucide-react';
import { get } from '../../lib/api';

export function Shell() {
  const { tasks, activeProject, currentUser, currentTeamId } = useStore();
  const location = useLocation();
  const [buildProjects, setBuildProjects] = useState([]);

  // Extract projectId from URL: /projects/:projectId/...
  const match = location.pathname.match(/^\/projects\/([^/]+)/);
  const projectId = match ? match[1] : null;
  const isInProject = !!projectId && projectId !== 'create';

  useEffect(() => {
    if (!currentTeamId) return;
    get(`/api/projects?teamId=${currentTeamId}`).then((res) => {
      if (res.ok) setBuildProjects(res.data || []);
    }).catch(() => {});
  }, [currentTeamId, location.pathname]);

  const projectNav = isInProject
    ? [
        [`/projects/${projectId}/pool`, 'Agent 回传', Boxes],
        [`/projects/${projectId}/content`, '项目内容池', NotebookTabs],
        [`/projects/${projectId}/mine`, '项目内任务', UserCheck],
        [`/projects/${projectId}/commander`, '项目 PM 面板', LayoutDashboard],
        ...(activeProject?.pm_user_id === currentUser?.id ? [[`/projects/${projectId}/edit`, '项目设置', Settings]] : []),
      ]
    : [
        ['/projects/create', '新增 Build 项目', Plus],
      ];

  return (
    <div className="claude-skin min-h-screen bg-[#f6f8fb] text-[#17211f]">
      <ErrorBoundary>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#ffffff',
              color: '#17211f',
              border: '1px solid #e6eaf0',
            },
          }}
        />
      </ErrorBoundary>
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-slate-200 bg-white/90 lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r">
          <div className="flex min-h-full flex-col px-4 py-4">
            <div className="flex items-center gap-3">
              <img className="gxr-logo-mark h-10 w-10" src="/guixingren-logo.jpg" alt="硅星人" />
              <div>
                <p className="text-sm font-semibold text-slate-950">硅星人 PM Board</p>
                <p className="text-xs text-slate-500">Agent 驱动协作面板</p>
              </div>
            </div>
            <div className="gxr-brand-tag mt-3">Powered by 硅星人</div>
            <div className="mt-4 flex-1 space-y-1.5">
              <NavLink to="/board" className={({ isActive }) => navClass(isActive)}>
                <BarChart3 size={16} />
                <span>部门大盘</span>
                <span className="ml-auto text-xs text-slate-400">统帅视角</span>
              </NavLink>

              <NavLink to="/topics" className={({ isActive }) => navClass(isActive || location.pathname === '/topics/daily' || location.pathname === '/topics/business' || location.pathname === '/topics/deep')}>
                <NotebookTabs size={16} />
                <span>选题</span>
              </NavLink>

              <NavLink to="/topics/frontier" className={({ isActive }) => navClass(isActive)}>
                <Sparkles size={16} />
                <span>Frontier</span>
              </NavLink>

              <NavLink to="/topics/prompt" className={({ isActive }) => navClass(isActive)}>
                <MessageSquareText size={16} />
                <span>Prompt PR</span>
              </NavLink>

              <NavGroup icon={Presentation} title="Demo" defaultOpen={location.pathname.startsWith('/demo')}>
                <SubNavLink to="/demo" label="Memo 与评价" />
              </NavGroup>

              <NavGroup icon={Microscope} title="Eval" defaultOpen={location.pathname.startsWith('/eval')}>
                <SubNavLink to="/eval" label="测试集" />
              </NavGroup>

              <NavGroup icon={List} title="Build" defaultOpen={location.pathname.startsWith('/projects')}>
                <SubNavLink to="/projects" label="全部 Build 项目" />
                {buildProjects.slice(0, 8).map((project) => (
                  <SubNavLink key={project.id} to={`/projects/${project.id}/pool`} label={project.name} />
                ))}
                <SubNavLink to="/projects/create" label="新增项目" icon={Plus} />
              </NavGroup>

              <NavGroup icon={UserCheck} title="我的任务" defaultOpen={location.pathname.startsWith('/my-work') || isInProject}>
                <SubNavLink to="/my-work" label="全部我的任务" icon={UserCheck} />
                {isInProject ? projectNav.map(([path, label, Icon]) => (
                  <SubNavLink
                    key={path}
                    to={path}
                    label={path.endsWith('/pool') && tasks.length > 0 ? `${label} · ${tasks.length}` : label}
                    icon={Icon}
                  />
                )) : null}
              </NavGroup>
            </div>
            <div className="mt-auto pt-4">
              <AgentAccountMenu />
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 px-4 py-4 backdrop-blur md:px-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs text-slate-500">{projectId ? `Build #${projectId.slice(0, 8)}` : 'PM board'}</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950 md:text-3xl">硅星人 PM Board</h1>
              </div>
            </div>
          </header>

          <div className="px-4 py-6 md:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function navClass(isActive) {
  return `flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm transition ${
    isActive
      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
  }`;
}

function NavGroup({ icon: Icon, title, children, defaultOpen = false }) {
  return (
    <details open={defaultOpen} className="group rounded-md">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-md px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">
        <Icon size={16} />
        <span>{title}</span>
        <ChevronDown size={14} className="ml-auto text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="mt-1 space-y-0.5 pl-6">{children}</div>
    </details>
  );
}

function SubNavLink({ to, label, icon: Icon = Circle }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
          isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950'
        }`
      }
    >
      <Icon size={Icon === Circle ? 7 : 14} />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}
