import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { get, post } from '../../lib/api';
import { useStore } from '../../store';
import { Avatar } from '../../components/ui/Avatar';
import { PanelTitle } from '../../components/ui/PanelTitle';
import { StatusPill } from '../../components/ui/StatusPill';
import { EmptyState } from '../../components/ui/EmptyState';
import { Briefcase, ClipboardList, Sparkles, Loader2, AlertTriangle } from 'lucide-react';

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

  const { myTasks, mySubtasks, claimable } = data;

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-white/10 bg-[#151925] p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Avatar member={currentUser} size="xl" pm={myTasks.length > 0} />
            <div>
              <p className="text-sm font-medium text-violet-200">个人工作台</p>
              <h2 className="mt-1 text-3xl font-semibold tracking-normal text-white">{currentUser.name} 的 PM 面板</h2>
              <p className="mt-2 text-sm text-slate-400">你认领的任务里，你就是 PM；别人认领的任务里，你是可被调动的协作者。</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-md border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-2xl font-semibold text-white">{myTasks.length}</p>
              <p className="text-xs text-slate-500">PM任务</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-2xl font-semibold text-white">{mySubtasks.length}</p>
              <p className="text-xs text-slate-500">协作子任务</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <PanelTitle icon={Briefcase} title="我作为PM认领的任务" />
          {myTasks.length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {myTasks.map((task) => (
                <button key={task.id} onClick={() => navigate(`/projects/${projectId}/tasks/${task.id}`)} className="rounded-lg border border-white/10 bg-[#151925] p-4 text-left transition hover:border-violet-400/40">
                  <div className="flex items-center gap-2 mb-2"><StatusPill status={task.status} /></div>
                  <h3 className="text-lg font-semibold text-white">{task.title}</h3>
                  <div className="mt-3"><div className="h-2 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400 transition-all" style={{ width: `${task.progress}%` }} /></div></div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="你还没有PM任务" detail="去公共任务池认领一个任务" />
          )}
        </div>

        <aside className="space-y-5">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <PanelTitle icon={ClipboardList} title="我配合的子任务" />
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
            <PanelTitle icon={Sparkles} title="可认领任务" />
            <div className="mt-4 space-y-3">
              {claimable.length ? claimable.slice(0, 4).map((task) => (
                <div key={task.id} className="rounded-md border border-white/10 bg-[#11141d] p-3">
                  <p className="font-medium text-white">{task.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{task.cycle || ''}</p>
                  <button onClick={() => handleClaim(task.id)} className="mt-3 rounded-md bg-violet-500 px-3 py-2 text-sm font-semibold text-white">认领成为PM</button>
                </div>
              )) : <p className="text-sm text-slate-500">公共池里的任务都已经有人负责了。</p>}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
