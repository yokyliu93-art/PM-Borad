import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { get, del } from '../../lib/api';
import { useStore } from '../../store';
import { Plus, ArrowRight, Loader2, AlertTriangle, Trash2, Pencil, Inbox, UserCheck, ShieldCheck, Users } from 'lucide-react';
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

  function goMine(e, project) {
    e.stopPropagation();
    setActiveProjectId(project.id);
    navigate(`/projects/${project.id}/mine`);
  }

  function goPool(e, project) {
    e.stopPropagation();
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

  if (loading) return <div className="grid place-items-center h-64"><Loader2 className="animate-spin text-slate-500" size={32} /></div>;

  if (error) return (
    <div className="grid place-items-center h-64">
      <div className="text-center">
        <AlertTriangle size={32} className="mx-auto text-amber-400" />
        <p className="mt-3 text-slate-500">{error}</p>
        <button onClick={loadProjects} className="mt-4 rounded-md bg-emerald-600 px-3 py-2 text-sm text-white">重试</button>
      </div>
    </div>
  );

  const totals = projects.reduce((acc, project) => ({
    claimable: acc.claimable + (project.claimable_count || 0),
    mine: acc.mine + (project.my_task_count || 0),
    reviews: acc.reviews + (project.pending_review_count || 0),
    activePeople: acc.activePeople + (project.active_people_count || 0),
  }), { claimable: 0, mine: 0, reviews: 0, activePeople: 0 });

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700">团队项目大厅</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">所有项目都在这里</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">所有项目对团队成员可见。总PM先把项目交给自己的 Agent 拆解；Agent 回传模块后，成员再进入具体模块负责推进。</p>
        </div>
        <button
          onClick={() => navigate('/projects/create')}
          className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          <Plus size={16} /> 发起新项目
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-emerald-700"><Inbox size={16} /><span className="text-sm">待负责人模块</span></div>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{totals.claimable}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-emerald-700"><UserCheck size={16} /><span className="text-sm">我负责推进</span></div>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{totals.mine}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-amber-700"><ShieldCheck size={16} /><span className="text-sm">待确认交付</span></div>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{totals.reviews}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-slate-500"><Users size={16} /><span className="text-sm">已参与成员</span></div>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{totals.activePeople}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-200 pt-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-2xl font-semibold text-slate-950">所有项目</h3>
          <p className="mt-1 text-sm text-slate-500">先选项目；如果 Agent 已回传模块，就进入模块继续推进。</p>
        </div>
        <span className="text-sm text-slate-500">共 {projects.length} 个项目</span>
      </div>

      {projects.length === 0 ? (
        <div className="grid min-h-60 place-items-center rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">还没有项目</h3>
            <p className="mt-2 text-sm text-slate-500">点击"发起新项目"，写入计划书后交给总PM Agent 拆解</p>
            <button
              onClick={() => navigate('/projects/create')}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              <Plus size={16} /> 发起第一个项目
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {projects.map((p) => {
            const progress = p.progress ?? 0;
            const statusLabel = p.status === 'draft' ? '草稿' : p.status === 'active' ? '进行中' : p.status === 'completed' ? '已完成' : p.status;
            const statusStyle = p.status === 'active' ? 'bg-emerald-500/15 text-emerald-700' :
                               p.status === 'completed' ? 'bg-blue-500/15 text-blue-700' :
                               'bg-slate-500/15 text-slate-500';
            const isPM = p.pm_user_id === currentUser?.id;

            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => enterProject(p)}
                onKeyDown={(e) => { if (e.key === 'Enter') enterProject(p); }}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white p-5 text-left transition hover:border-emerald-400/40"
              >
                <div className="grid gap-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-2xl font-semibold text-slate-950">{p.name}</h3>
                      <span className={`rounded px-2 py-0.5 text-xs ${statusStyle}`}>{statusLabel}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{p.description || '这个项目还没有描述，进入后可以复制 Agent 包或查看回传模块。'}</p>
                    <p className="mt-3 text-xs text-slate-500">总 PM: {p.pm_name} · {p.active_people_count || 0} 人已参与推进</p>
                  </div>

                  <div>
                    <div className="mb-2 flex justify-between text-xs text-slate-500">
                      <span>项目推进</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                      <div className="rounded-md bg-slate-50 px-2 py-2">
                        <p className="text-base font-semibold text-slate-950">{p.task_count || 0}</p>
                        <p className="text-[11px] text-slate-500">任务</p>
                      </div>
                      <div className="rounded-md bg-emerald-500/10 px-2 py-2">
                        <p className="text-base font-semibold text-emerald-700">{p.claimable_count || 0}</p>
                        <p className="text-[11px] text-slate-500">可认领</p>
                      </div>
                      <div className="rounded-md bg-emerald-600/10 px-2 py-2">
                        <p className="text-base font-semibold text-emerald-700">{p.my_task_count || 0}</p>
                        <p className="text-[11px] text-slate-500">我的</p>
                      </div>
                      <div className="rounded-md bg-amber-500/10 px-2 py-2">
                        <p className="text-base font-semibold text-amber-700">{p.pending_review_count || 0}</p>
                        <p className="text-[11px] text-slate-500">待确认</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {isPM && (
                      <>
                        <button
                          onClick={(e) => editProject(e, p)}
                          title="编辑项目"
                          aria-label="编辑项目"
                          className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-500 transition hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-700"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={(e) => deleteProject(e, p)}
                          title="删除项目"
                          aria-label="删除项目"
                          className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-500 transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                    {p.my_task_count > 0 ? (
                      <button
                        onClick={(e) => goMine(e, p)}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-emerald-50"
                      >
                        我的执行台 <ArrowRight size={15} />
                      </button>
                    ) : null}
                    <button
                      onClick={(e) => goPool(e, p)}
                      className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      查看回传模块 <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
