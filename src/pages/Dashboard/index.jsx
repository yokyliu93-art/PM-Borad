import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { get } from '../../lib/api';
import { useStore } from '../../store';
import { Avatar } from '../../components/ui/Avatar';
import { StatusPill } from '../../components/ui/StatusPill';
import { Progress } from '../../components/ui/Progress';
import { PanelTitle } from '../../components/ui/PanelTitle';
import { Activity, AlertTriangle, Filter, Gauge, Loader2 } from 'lucide-react';

export function Dashboard() {
  const { projectId } = useParams();
  const { filterPerson, filterMode, setFilterPerson, setFilterMode } = useStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const r = await get(`/api/dashboard/commander?projectId=${projectId}`);
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
  if (!data) return <div className="text-slate-400">暂无数据</div>;

  const { project, tasks, teamMembers, workloads } = data;
  const overallProgress = tasks.length ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length) : 0;

  const filteredTasks = tasks.filter((task) => {
    if (filterPerson === 'all') return true;
    if (filterMode === 'pm') return task.owner_id === filterPerson;
    return task.owner_id && task.owner_id !== filterPerson && task.subtasks?.some((s) => s.assignee_id === filterPerson);
  });

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-white/10 bg-[#151925] p-5">
        <p className="text-sm font-medium text-violet-200">项目总面板</p>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-normal text-white">所有子PM、进度、阻塞和更新一屏总控</h2>
            <p className="mt-2 text-sm text-slate-400">项目总面板不替每个人干活，只看哪里需要推进、调人和补资源。</p>
          </div>
          <div className="min-w-56">
            <div className="mb-2 flex justify-between text-sm"><span className="text-slate-400">整体进度</span><span className="text-white">{overallProgress}%</span></div>
            <Progress value={overallProgress} />
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Filter size={16} className="text-slate-500" />
            <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)} className="rounded-md border border-white/10 bg-[#151925] px-3 py-2 text-sm text-slate-200">
              <option value="all">全部成员</option>
              {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button onClick={() => setFilterMode('pm')} className={`rounded-md px-3 py-2 text-sm ${filterMode === 'pm' ? 'bg-white text-[#0f1117]' : 'border border-white/10 text-slate-300'}`}>作为PM</button>
            <button onClick={() => setFilterMode('helper')} className={`rounded-md px-3 py-2 text-sm ${filterMode === 'helper' ? 'bg-white text-[#0f1117]' : 'border border-white/10 text-slate-300'}`}>作为配合者</button>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredTasks.map((task) => (
              <button key={task.id} onClick={() => navigate(`/projects/${projectId}/tasks/${task.id}`)} className="rounded-lg border border-white/10 bg-[#151925] p-4 text-left transition hover:border-violet-400/40">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="mb-2 flex items-center gap-2"><StatusPill status={task.status} />{task.cycle ? <span className="rounded bg-white/8 px-2 py-1 text-xs text-slate-400">{task.cycle}</span> : null}</div>
                    <h3 className="text-lg font-semibold text-white">{task.title}</h3>
                    <p className="mt-1 text-sm text-slate-400">{task.summary}</p>
                  </div>
                  {task.owner_name && (
                    <div className="shrink-0 text-center">
                      <Avatar member={{ name: task.owner_name, color: 'from-violet-500 to-fuchsia-500' }} size="lg" pm />
                      <p className="mt-1 text-xs text-violet-200">{task.owner_name}</p>
                    </div>
                  )}
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-slate-500"><span>进度</span><span>{task.progress}%</span></div>
                  <Progress value={task.progress} />
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-5">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <PanelTitle icon={Gauge} title="人员负载" />
            <div className="mt-4 space-y-3">
              {workloads.map((w) => (
                <div key={w.user.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-white/10 bg-[#11141d] p-3">
                  <div className="flex items-center gap-2">
                    <Avatar member={w.user} size="xs" />
                    <span className="text-sm text-white">{w.user.name}</span>
                  </div>
                  <span className="text-xs text-slate-400">{w.pmCount} PM任务 · {w.helperCount} 配合</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <PanelTitle icon={Activity} title="更新Feed" />
            <div className="mt-4 space-y-3">
              {tasks.flatMap((t) => (t.updates || []).map((u, i) => ({ ...u, task: t.title }))).slice(0, 20).map((event, i) => (
                <div key={`${event.id || i}`} className="rounded-md border border-white/10 bg-[#11141d] p-3">
                  <p className="text-sm text-white">{event.content}</p>
                  <p className="mt-1 text-xs text-slate-500">{event.user_name} · {event.task}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
