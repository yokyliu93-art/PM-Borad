import { useEffect, useState } from 'react';
import { get } from '../../lib/api';
import { useStore } from '../../store';
import { StatusPill } from '../../components/ui/StatusPill';
import { Progress } from '../../components/ui/Progress';
import { ChevronDown, Loader2, AlertTriangle } from 'lucide-react';

export function BossBoard() {
  const { currentTeamId, expandedProject, setExpandedProject } = useStore();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadProjects() {
    setLoading(true);
    setError(null);
    try {
      const r = await get(`/api/dashboard/boss?teamId=${currentTeamId}`);
      setProjects(r.data || []);
    } catch {
      setError('无法连接服务器，请确认后端已启动');
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!currentTeamId) return;
    loadProjects();
  }, [currentTeamId]);

  if (loading) return <div className="grid place-items-center h-64"><Loader2 className="animate-spin text-slate-400" size={32} /></div>;

  if (error) return (
    <div className="grid place-items-center h-64">
      <div className="text-center">
        <AlertTriangle size={32} className="mx-auto text-amber-400" />
        <p className="mt-3 text-slate-300">{error}</p>
        <button onClick={loadProjects} className="mt-4 rounded-md bg-violet-500 px-3 py-2 text-sm text-white">重试</button>
      </div>
    </div>
  );

  return (
    <section className="space-y-5">
      <div>
        <p className="text-sm font-medium text-violet-200">部门大盘视图</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-normal text-white">老板视角：多个项目一屏看清</h2>
      </div>
      <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
        {projects.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">还没有项目</p>
        ) : (
          projects.map((project) => {
            const progress = project.tasks.length ? Math.round(project.tasks.reduce((s, t) => s + t.progress, 0) / project.tasks.length) : 0;
            return (
              <div key={project.id} className="border-b border-white/10 last:border-b-0">
                <button onClick={() => setExpandedProject(expandedProject === project.id ? null : project.id)} className="grid w-full gap-4 p-4 text-left md:grid-cols-[1fr_140px_180px_120px_32px] md:items-center">
                  <div>
                    <p className="font-semibold text-white">{project.name}</p>
                    <p className="mt-1 text-sm text-slate-500">总PM：{project.pm_name}</p>
                  </div>
                  <StatusPill status={project.status === 'active' ? '进行中' : project.status === 'draft' ? '筹备中' : project.status} />
                  <div>
                    <div className="mb-2 flex justify-between text-xs text-slate-500"><span>进度</span><span>{progress}%</span></div>
                    <Progress value={progress} />
                  </div>
                  <span className="text-sm text-slate-400">{project.tasks?.length || 0} 项任务</span>
                  <ChevronDown className={`text-slate-500 transition ${expandedProject === project.id ? 'rotate-180' : ''}`} size={18} />
                </button>
                {expandedProject === project.id && (
                  <div className="grid gap-2 border-t border-white/10 bg-[#0c0f16] p-4 md:grid-cols-2 xl:grid-cols-3">
                    {project.tasks?.length ? project.tasks.map((t) => (
                      <div key={t.id} className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
                        <p className="text-sm font-medium text-slate-300">{t.title}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <StatusPill status={t.status} />
                          {t.owner_name ? <span className="text-xs text-slate-500">{t.owner_name}</span> : <span className="text-xs text-slate-600">未认领</span>}
                        </div>
                      </div>
                    )) : <p className="text-sm text-slate-500">等待任务发布</p>}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
