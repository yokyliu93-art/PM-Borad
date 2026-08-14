import { Toaster } from 'react-hot-toast';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { UserSwitcher } from '../UserSwitcher';
import { Boxes, UserCheck, LayoutDashboard, BarChart3, List, Plus, Settings, NotebookTabs, Presentation, ChevronDown, Circle } from 'lucide-react';
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
          <div className="px-5 py-5">
            <div className="flex items-center gap-3">
              <img className="gxr-logo-mark h-11 w-11" src="/guixingren-logo.jpg" alt="硅星人" />
              <div>
                <p className="text-sm font-semibold text-slate-950">硅星人 PM Board</p>
                <p className="text-xs text-slate-500">Agent 驱动协作面板</p>
              </div>
            </div>
            <div className="gxr-brand-tag mt-5">Powered by 硅星人</div>
            <div className="mt-6 space-y-2">
              <NavLink to="/board" className={({ isActive }) => navClass(isActive)}>
                <BarChart3 size={16} />
                <span>部门大盘</span>
                <span className="ml-auto text-xs text-slate-400">老板视角</span>
              </NavLink>

              <NavGroup icon={NotebookTabs} title="选题" defaultOpen={location.pathname.startsWith('/topics')}>
                <SubNavLink to="/topics/daily" label="日常选题" />
                <SubNavLink to="/topics/deep" label="深度选题" />
              </NavGroup>

              <NavGroup icon={Presentation} title="Demo" defaultOpen={location.pathname.startsWith('/demo')}>
                <SubNavLink to="/demo" label="Memo 与评价" />
              </NavGroup>

              <NavGroup icon={List} title="Build" defaultOpen={location.pathname.startsWith('/projects')}>
                <SubNavLink to="/projects" label="全部 Build 项目" />
                {buildProjects.slice(0, 8).map((project) => (
                  <SubNavLink key={project.id} to={`/projects/${project.id}/pool`} label={project.name} />
                ))}
                <SubNavLink to="/projects/create" label="新增项目" icon={Plus} />
              </NavGroup>

              <NavLink to="/my-work" className={({ isActive }) => navClass(isActive)}>
                <UserCheck size={16} />
                <span>我的任务</span>
              </NavLink>
            </div>
            {isInProject ? <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="px-3 text-xs font-medium text-slate-400">当前 Build</p>
              <div className="mt-2 space-y-1">
                {projectNav.map(([path, label, Icon]) => (
                  <NavLink
                    key={path}
                    to={path}
                    className={({ isActive }) =>
                      `flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'
                      }`
                    }
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                    {path.endsWith('/pool') && tasks.length > 0 ? (
                      <span className="ml-auto rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">{tasks.length}</span>
                    ) : null}
                  </NavLink>
                ))}
              </div>
            </div> : null}
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 px-4 py-4 backdrop-blur md:px-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs text-slate-500">{projectId ? `Build #${projectId.slice(0, 8)}` : 'PM board'}</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950 md:text-3xl">硅星人 PM Board</h1>
              </div>
              <UserSwitcher />
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
  return `flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition ${
    isActive
      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
  }`;
}

function NavGroup({ icon: Icon, title, children, defaultOpen = false }) {
  return (
    <details open={defaultOpen} className="group rounded-md">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">
        <Icon size={16} />
        <span>{title}</span>
        <ChevronDown size={14} className="ml-auto text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="mt-1 space-y-1 pl-6">{children}</div>
    </details>
  );
}

function SubNavLink({ to, label, icon: Icon = Circle }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
          isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950'
        }`
      }
    >
      <Icon size={Icon === Circle ? 7 : 14} />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}
