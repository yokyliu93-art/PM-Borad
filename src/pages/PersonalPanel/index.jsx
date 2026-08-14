import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { get, post } from '../../lib/api';
import { useStore } from '../../store';
import { Avatar } from '../../components/ui/Avatar';
import { PanelTitle } from '../../components/ui/PanelTitle';
import { StatusPill } from '../../components/ui/StatusPill';
import { EmptyState } from '../../components/ui/EmptyState';
import { Briefcase, ClipboardList, Sparkles, Loader2, AlertTriangle, CheckCircle2, Clock3, Link2, ShieldCheck } from 'lucide-react';

export function PersonalPanel() {
  const { projectId } = useParams();
  const { currentUser } = useStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const r = await get(`/api/dashboard/personal?projectId=${projectId}`);
      setData(r.data);
    } catch {
      setError('无法连接服务器，请确认后端已启动');
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!projectId) return;
    loadData();
  }, [projectId]);

  async function handleClaim(taskId) {
    await post(`/api/projects/${projectId}/tasks/${taskId}/claim`);
    loadData();
  }

  if (loading) return <div className="grid place-items-center h-64"><Loader2 className="animate-spin text-slate-400" size={32} /></div>;
  if (error) return (
    <div className="grid place-items-center h-64">
      <div className="text-center">
        <AlertTriangle size={32} className="mx-auto text-amber-400" />
        <p className="mt-3 text-slate-300">{error}</p>
        <button onClick={loadData} className="mt-4 rounded-md bg-violet-500 px-3 py-2 text-sm text-white">重试</button>
      </div>
    </div>
  );
  if (!data) return <EmptyState title="暂无数据" />;
  if (!currentUser) return <EmptyState title="请先登录" />;

  const {
    myTasks = [],
    mySubtasks = [],
    myStages = [],
    claimable = [],
    isProjectPM,
    pendingTaskReviews = [],
    pendingSubtaskReviews = [],
  } = data;
  const activeStages = myStages.filter((stage) => stage.status !== '已完成');
  const deliveredStages = myStages.filter((stage) => stage.delivery_doc_url);
  const reviewCount = pendingTaskReviews.length + pendingSubtaskReviews.length;

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-white/10 bg-[#151925] p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Avatar member={currentUser} size="xl" pm={myTasks.length > 0} />
            <div>
              <p className="text-sm font-medium text-violet-200">个人执行台</p>
              <h2 className="mt-1 text-3xl font-semibold tracking-normal text-white">{currentUser.name} 今天要推进什么</h2>
              <p className="mt-2 text-sm text-slate-400">等总PM Agent 回传模块后，认领自己负责的模块；认领后拆细执行步骤，按阶段交付飞书文档。</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center md:grid-cols-4">
            <div className="rounded-md border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-2xl font-semibold text-white">{myTasks.length}</p>
              <p className="text-xs text-slate-500">我认领的任务</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-2xl font-semibold text-white">{mySubtasks.length}</p>
              <p className="text-xs text-slate-500">我配合的子任务</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-2xl font-semibold text-white">{activeStages.length}</p>
              <p className="text-xs text-slate-500">待推进步骤</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-2xl font-semibold text-white">{reviewCount}</p>
              <p className="text-xs text-slate-500">待我确认</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <PanelTitle icon={Briefcase} title="我认领后负责推进的任务" />
          {myTasks.length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {myTasks.map((task) => (
                <button key={task.id} onClick={() => navigate(`/projects/${projectId}/tasks/${task.id}`)} className="rounded-lg border border-white/10 bg-[#151925] p-4 text-left transition hover:border-violet-400/40">
                  <div className="mb-2 flex items-center gap-2"><StatusPill status={task.status} />{task.cycle ? <span className="rounded bg-white/8 px-2 py-1 text-xs text-slate-400">{task.cycle}</span> : null}</div>
                  <h3 className="text-lg font-semibold text-white">{task.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-400">{task.summary || '进入后拆执行步骤和阶段交付'}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <span className="rounded-md bg-white/[0.04] px-2 py-2 text-xs text-slate-400">{(task.subtasks || []).length} 子任务</span>
                    <span className="rounded-md bg-white/[0.04] px-2 py-2 text-xs text-slate-400">{(task.subtasks || []).flatMap((s) => s.steps || []).length} 步骤</span>
                    <span className="rounded-md bg-white/[0.04] px-2 py-2 text-xs text-slate-400">{(task.subtasks || []).filter((s) => s.delivery_doc_url).length} 交付</span>
                  </div>
                  <div className="mt-3"><div className="h-2 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400 transition-all" style={{ width: `${task.progress}%` }} /></div></div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="你还没有PM任务" detail="等 Agent 回传模块后，再认领自己负责的部分" />
          )}

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <PanelTitle icon={Clock3} title="我的阶段执行清单" />
            <div className="mt-4 space-y-3">
              {myStages.length ? myStages.slice(0, 12).map((stage) => (
                <button key={stage.id} onClick={() => navigate(`/projects/${projectId}/tasks/${stage.task_id}`)} className="w-full rounded-md border border-white/10 bg-[#11141d] p-3 text-left transition hover:bg-white/8">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-white">{stage.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{stage.task_title} · {stage.subtask_title}</p>
                    </div>
                    <StatusPill status={stage.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {stage.due_text ? <span>{stage.due_text}</span> : null}
                    {stage.reminder_enabled ? <span>飞书{stage.reminder_frequency === 'daily' ? '每天' : stage.reminder_frequency === 'weekly' ? '每周' : '工作日'}提醒</span> : <span>未设置提醒</span>}
                    {stage.delivery_doc_url ? <span className="text-emerald-300">已有阶段交付</span> : null}
                  </div>
                </button>
              )) : <p className="text-sm text-slate-500">认领任务或被分配子任务后，这里会出现你的执行步骤。</p>}
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          {isProjectPM && reviewCount > 0 ? (
            <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-5">
              <PanelTitle icon={ShieldCheck} title="待我确认" />
              <div className="mt-4 space-y-3">
                {pendingSubtaskReviews.map((sub) => (
                  <button key={sub.id} onClick={() => navigate(`/projects/${projectId}/tasks/${sub.task_id}`)} className="w-full rounded-md border border-amber-400/20 bg-[#11141d] p-3 text-left transition hover:bg-white/8">
                    <p className="font-medium text-white">{sub.title}</p>
                    <p className="mt-1 text-xs text-amber-100/70">{sub.task_title} · 子任务待确认</p>
                  </button>
                ))}
                {pendingTaskReviews.map((task) => (
                  <button key={task.id} onClick={() => navigate(`/projects/${projectId}/tasks/${task.id}`)} className="w-full rounded-md border border-amber-400/20 bg-[#11141d] p-3 text-left transition hover:bg-white/8">
                    <p className="font-medium text-white">{task.title}</p>
                    <p className="mt-1 text-xs text-amber-100/70">{task.owner_name || '子PM'} 提交了最终审核</p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <PanelTitle icon={ClipboardList} title="我配合执行的子任务" />
            <div className="mt-4 space-y-3">
              {mySubtasks.length ? mySubtasks.map((sub) => (
                <button key={sub.id} onClick={() => navigate(`/projects/${projectId}/tasks/${sub.task_id}`)} className="w-full rounded-md border border-white/10 bg-[#11141d] p-3 text-left transition hover:bg-white/8">
                  <p className="font-medium text-white">{sub.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{sub.task_title}</p>
                  <div className="mt-2"><StatusPill status={sub.status} /></div>
                </button>
              )) : <p className="text-sm text-slate-500">暂时没有别人分配给你的子任务。</p>}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <PanelTitle icon={CheckCircle2} title="阶段性交付" />
            <div className="mt-4 space-y-3">
              {deliveredStages.length ? deliveredStages.slice(0, 6).map((stage) => (
                <a key={stage.id} href={stage.delivery_doc_url} target="_blank" rel="noreferrer" className="flex items-start gap-2 rounded-md border border-white/10 bg-[#11141d] p-3 text-sm text-emerald-100 transition hover:bg-white/8">
                  <Link2 size={15} className="mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate">{stage.title}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{stage.task_title}</span>
                  </span>
                </a>
              )) : <p className="text-sm text-slate-500">阶段文档填写后，会沉淀在这里。</p>}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <PanelTitle icon={Sparkles} title="Agent 回传的待认领模块" />
            <div className="mt-4 space-y-3">
              {claimable.length ? claimable.slice(0, 4).map((task) => (
                <div key={task.id} className="rounded-md border border-white/10 bg-[#11141d] p-3">
                  <p className="font-medium text-white">{task.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{task.cycle || ''}</p>
                  <button onClick={() => handleClaim(task.id)} className="mt-3 rounded-md bg-violet-500 px-3 py-2 text-sm font-semibold text-white">认领成为PM</button>
                </div>
              )) : <p className="text-sm text-slate-500">还没有待认领模块，或模块都已经有人负责了。</p>}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
