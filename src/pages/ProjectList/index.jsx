import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { get, del } from '../../lib/api';
import { useStore } from '../../store';
import { Plus, ArrowRight, Loader2, AlertTriangle, Trash2, Pencil } from 'lucide-react';
import { Progress } from '../../components/ui/Progress';

export function ProjectList() {
  const { currentTeamId, setActiveProjectId, currentUser } = useStore();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!currentTeamId) return;
    loadProjects();
  }, [currentTeamId]);

  async function loadProjects() {
    setLoading(true);
    setError(null);
    try {
      const res = await get(`/api/projects?teamId=${currentTeamId}`);
      setProjects(res.data || []);
    } catch {
      setError('无法连接服务器，请确认后端已启动');
    }
    setLoading(false);
  }

  function enterProject(project) {
    setActiveProjectId(project.id);
    navigate(`/projects/${project.id}/pool`);
  }

  async function deleteProject(e, project) {
    e.stopPropagation();
    if (!window.confirm(`确定删除项目「${project.name}」吗？该项目下的任务、子任务和附件都会被删除，且无法恢复。`)) return;
    const res = await del(`/api/projects/${project.id}`);
    if (res.ok) {
      toast.success('项目已删除');
      loadProjects();
    } else {
      toast.error(res.error || '删除失败');
    }
  }

  function editProject(e, project) {
    e.stopPropagation();
    setActiveProjectId(project.id);
    navigate(`/projects/${project.id}/edit`);
  }

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
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-normal text-white">项目列表</h2>
          <p className="mt-2 text-sm text-slate-400">选择一个项目进入协作</p>
        </div>
        <button
          onClick={() => navigate('/projects/create')}
          className="inline-flex items-center gap-2 rounded-md bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400"
        >
          <Plus size={16} /> 发起新项目
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="grid min-h-60 place-items-center rounded-lg border border-dashed border-white/15 bg-white/[0.025] p-8 text-center">
          <div>
            <h3 className="text-lg font-semibold text-white">还没有项目</h3>
            <p className="mt-2 text-sm text-slate-500">点击"发起新项目"，用模板快速拆解任务池</p>
            <button
              onClick={() => navigate('/projects/create')}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400"
            >
              <Plus size={16} /> 发起第一个项目
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const progress = p.progress ?? 0;
            const statusLabel = p.status === 'draft' ? '草稿' : p.status === 'active' ? '进行中' : p.status === 'completed' ? '已完成' : p.status;
            const statusStyle = p.status === 'active' ? 'bg-emerald-500/15 text-emerald-200' :
                               p.status === 'completed' ? 'bg-blue-500/15 text-blue-200' :
                               'bg-slate-500/15 text-slate-300';
            const isPM = p.pm_user_id === currentUser?.id;

            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => enterProject(p)}
                onKeyDown={(e) => { if (e.key === 'Enter') enterProject(p); }}
                className="cursor-pointer rounded-lg border border-white/10 bg-[#151925] p-5 text-left transition hover:border-violet-400/40"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-white truncate">{p.name}</h3>
                    <p className="mt-1 text-sm text-slate-400 line-clamp-2">{p.description || '无描述'}</p>
                  </div>
                  <div className="ml-2 flex shrink-0 items-center gap-2">
                    {isPM && (
                      <>
                        <button
                          onClick={(e) => editProject(e, p)}
                          title="编辑项目"
                          aria-label="编辑项目"
                          className="grid h-7 w-7 place-items-center rounded-md border border-white/10 text-slate-500 transition hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-200"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={(e) => deleteProject(e, p)}
                          title="删除项目"
                          aria-label="删除项目"
                          className="grid h-7 w-7 place-items-center rounded-md border border-white/10 text-slate-500 transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                    <ArrowRight size={18} className="text-slate-500" />
                  </div>
                </div>

                {p.plan_markdown && (
                  <div className="mt-3">
                    <div className="mb-2 flex justify-between text-xs text-slate-500">
                      <span>进度</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-slate-500">PM: {p.pm_name}</span>
                  <span className={`rounded px-2 py-0.5 ${statusStyle}`}>{statusLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
