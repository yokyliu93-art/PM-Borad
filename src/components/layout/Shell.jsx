import { Toaster } from 'react-hot-toast';
import { Bot } from 'lucide-react';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useStore } from '../../store';
import { UserSwitcher } from '../UserSwitcher';
import { Users, UserCheck, LayoutDashboard, BarChart3, List, Plus } from 'lucide-react';

export function Shell() {
  const { tasks } = useStore();
  const location = useLocation();

  // Extract projectId from URL: /projects/:projectId/...
  const match = location.pathname.match(/^\/projects\/([^/]+)/);
  const projectId = match ? match[1] : null;
  const isInProject = !!projectId && projectId !== 'create';

  const nav = isInProject
    ? [
        ['/projects', '项目列表', List],
        [`/projects/${projectId}/pool`, '公共任务池', Users],
        [`/projects/${projectId}/mine`, '个人面板', UserCheck],
        [`/projects/${projectId}/commander`, '项目总面板', LayoutDashboard],
        [`/projects/${projectId}/boss`, '部门大盘', BarChart3],
      ]
    : [
        ['/projects', '项目列表', List],
        ['/projects/create', '发起新项目', Plus],
      ];

  return (
    <div className="claude-skin min-h-screen bg-[#070a09] text-[#f4fbf7]">
      <ErrorBoundary>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#101614',
              color: '#f4fbf7',
              border: '1px solid rgba(244,251,247,0.12)',
            },
          }}
        />
      </ErrorBoundary>
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-white/10 bg-[#11141d]/95 lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r">
          <div className="px-5 py-5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/30">
                <Bot size={21} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">PM Board</p>
                <p className="text-xs text-slate-400">认领制协作面板</p>
              </div>
            </div>
            <div className="mt-6 space-y-1">
              {nav.map(([path, label, Icon]) => (
                <NavLink
                  key={path}
                  to={path}
                  end={path === '/projects'}
                  className={({ isActive }) =>
                    `flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition ${
                      isActive ? 'bg-white text-[#0f1117]' : 'text-slate-300 hover:bg-white/8 hover:text-white'
                    }`
                  }
                >
                  <Icon size={16} />
                  <span>{label}</span>
                  {path.endsWith('/pool') && tasks.length > 0 ? (
                    <span className="ml-auto rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-200">{tasks.length}</span>
                  ) : null}
                </NavLink>
              ))}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0f1117]/85 px-4 py-4 backdrop-blur md:px-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs text-slate-500">{projectId ? `项目 #${projectId.slice(0, 8)}` : 'PM board'}</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-normal text-white md:text-3xl">每个认领人，都是这一块的 PM</h1>
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
