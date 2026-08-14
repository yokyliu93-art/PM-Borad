import { Toaster } from 'react-hot-toast';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useStore } from '../../store';
import { UserSwitcher } from '../UserSwitcher';
import { Boxes, UserCheck, LayoutDashboard, BarChart3, List, Plus, Settings, NotebookTabs, Presentation } from 'lucide-react';

export function Shell() {
  const { tasks, activeProject, currentUser } = useStore();
  const location = useLocation();

  // Extract projectId from URL: /projects/:projectId/...
  const match = location.pathname.match(/^\/projects\/([^/]+)/);
  const projectId = match ? match[1] : null;
  const isInProject = !!projectId && projectId !== 'create';

  const nav = [
    ['/board', '部门大盘', BarChart3],
    ['/topics', '选题', NotebookTabs],
    ['/demo', 'Demo', Presentation],
    ['/projects', 'Build', List],
    ['/my-work', '我的任务', UserCheck],
  ];

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
            <div className="mt-6 space-y-1">
              {nav.map(([path, label, Icon]) => (
                <NavLink
                  key={path}
                  to={path}
                  end={path === '/projects'}
                  className={({ isActive }) =>
                    `flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
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
            <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="px-3 text-xs font-medium text-slate-400">{isInProject ? '当前 Build' : 'Build 操作'}</p>
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
