import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Loader2, Settings, UserCheck, LayoutDashboard } from 'lucide-react';
import { get } from '../../lib/api';
import { useStore } from '../../store';
import { Progress } from '../../components/ui/Progress';

export function MyWorkspace() {
  const { currentTeamId, currentUser, setActiveProjectId } = useStore();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!currentTeamId) return;
    loadProjects();
  }, [currentTeamId]);

  async function loadProjects() {
    setLoading(true);
    setError('');
    try {
      const res = await get(`/api/projects?teamId=${currentTeamId}`);
      setProjects(res.data || []);
    } catch {
      setError('无法加载我的任务');
    }
    setLoading(false);
  }

  const myProjects = useMemo(() => projects.filter((project) => (
    project.my_task_count > 0 || project.pm_user_id === currentUser?.id || project.pending_review_count > 0
  )), [projects, currentUser?.id]);

  function go(project, path) {
    setActiveProjectId(project.id);
    navigate(`/projects/${project.id}/${path}`);
  }

  if (loading) return <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-slate-400" size={32} /></div>;
  if (error) return (
    <div className="grid h-64 place-items-center text-center">
      <div>
        <AlertTriangle className="mx-auto text-amber-500" size={30} />
        <p className="mt-3 text-sm text-slate-500">{error}</p>
      </div>
    </div>
  );

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-emerald-100 bg-white p-5 shadow-sm shadow-emerald-950/5">
        <p className="text-sm font-medium text-emerald-700">我的任务</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">我负责的执行和管理入口</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">这里收起项目 PM 面板和项目设置。普通成员看自己的执行台，项目 PM 可以继续进入 PM 面板和设置。</p>
      </div>

      {myProjects.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {myProjects.map((project) => {
            const isPM = project.pm_user_id === currentUser?.id;
            return (
              <article key={project.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-950">{project.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">总 PM：{project.pm_name}</p>
                  </div>
                  {isPM ? <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">我是项目 PM</span> : null}
                </div>
                <div className="mt-4">
                  <div className="mb-2 flex justify-between text-xs text-slate-500"><span>项目进度</span><span>{project.progress || 0}%</span></div>
                  <Progress value={project.progress || 0} />
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button onClick={() => go(project, 'mine')} className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                    <UserCheck size={15} />我的执行台 <ArrowRight size={14} />
                  </button>
                  {isPM ? (
                    <>
                      <button onClick={() => go(project, 'commander')} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        <LayoutDashboard size={15} />项目 PM 面板
                      </button>
                      <button onClick={() => go(project, 'edit')} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        <Settings size={15} />项目设置
                      </button>
                    </>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <p className="text-lg font-semibold text-slate-950">暂时没有分配给你的任务</p>
          <p className="mt-2 text-sm text-slate-500">等 Agent 回传模块或项目 PM 指派后，这里会出现你的执行入口。</p>
        </div>
      )}
    </section>
  );
}
