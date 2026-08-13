import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { get, post, del } from '../../lib/api';
import { useStore } from '../../store';
import { useSocket } from '../../hooks/useSocket';
import { TaskCard } from '../../components/ui/TaskCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Loader2, AlertTriangle, Plus, X, Sparkles } from 'lucide-react';

export function TaskPool() {
  const { projectId } = useParams();
  const { currentUser, tasksVersion } = useStore();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isProjectPM, setIsProjectPM] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [resplitting, setResplitting] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', summary: '', cycle: '' });
  const navigate = useNavigate();

  useSocket(projectId);

  useEffect(() => {
    if (!projectId) return;
    loadTasks();
  }, [projectId, tasksVersion]);

  useEffect(() => {
    if (!projectId) return;
    get(`/api/projects/${projectId}`).then((r) => {
      setIsProjectPM(r.ok && r.data?.pm_user_id === currentUser?.id);
    });
  }, [projectId, currentUser?.id]);

  async function loadTasks() {
    setLoading(true);
    setError(null);
    try {
      const res = await get(`/api/projects/${projectId}/tasks?published=1`);
      if (res.ok) {
        setTasks(res.data || []);
      } else {
        setError(res.error || '加载失败');
      }
    } catch (err) {
      setError('无法连接服务器，请确认后端已启动');
    }
    setLoading(false);
  }

  async function handleClaim(taskId) {
    try {
      const res = await post(`/api/projects/${projectId}/tasks/${taskId}/claim`);
      if (res.ok) {
        toast.success('认领成功！你已成为该任务的子PM');
        loadTasks();
      } else {
        toast.error(res.error || '认领失败');
      }
    } catch {
      toast.error('认领请求失败');
    }
  }

  async function handleUnclaim(taskId) {
    if (!window.confirm('确定取消认领该任务？任务将回到待认领状态，子任务与已上传内容会保留。')) return;
    try {
      const res = await post(`/api/projects/${projectId}/tasks/${taskId}/unclaim`);
      if (res.ok) {
        toast.success('已取消认领，任务回到任务池');
        loadTasks();
      } else {
        toast.error(res.error || '取消认领失败');
      }
    } catch {
      toast.error('取消认领失败，请确认后端已启动');
    }
  }

  async function handleAddTask(e) {
    e.preventDefault();
    if (!newTask.title.trim()) {
      toast.error('任务标题不能为空');
      return;
    }
    setAdding(true);
    try {
      const res = await post(`/api/projects/${projectId}/tasks`, {
        ...newTask,
        docUrl: '',
        publishNow: true,
      });
      if (res.ok) {
        toast.success('任务已发布到任务池');
        setNewTask({ title: '', summary: '', cycle: '' });
        setShowAddForm(false);
        loadTasks();
      } else {
        toast.error(res.error || '添加任务失败');
      }
    } catch {
      toast.error('添加任务失败，请确认后端已启动');
    }
    setAdding(false);
  }

  async function handleReSplit() {
    if (!window.confirm('将删除当前所有任务，并按项目计划书重新用 AI 拆分。已认领的任务、子任务和进度都会丢失，确定继续吗？')) return;
    setResplitting(true);
    try {
      const existingRes = await get(`/api/projects/${projectId}/tasks`);
      const existingIds = (existingRes.data || []).map((t) => t.id);
      const ai = await post(`/api/projects/${projectId}/tasks/ai-split`, {});
      if (!ai.ok) {
        toast.error(ai.error || 'AI 拆分失败，现有任务保持不变');
        return;
      }
      for (const id of existingIds) {
        await del(`/api/projects/${projectId}/tasks/${id}`);
      }
      await post(`/api/projects/${projectId}/tasks/publish`);
      toast.success('已按项目计划书重新拆分并发布');
      loadTasks();
    } catch {
      toast.error('重新拆分失败，请确认后端已启动');
    } finally {
      setResplitting(false);
    }
  }

  async function handleDeleteTask(task) {
    const ownerText = task.owner_id ? `（已被 ${task.owner_name || '成员'} 认领）` : '';
    if (!window.confirm(`确定删除任务「${task.title}」？${ownerText}\n删除后其子任务与进度将一并移除，不可恢复。`)) return;
    try {
      const res = await del(`/api/projects/${projectId}/tasks/${task.id}`);
      if (res.ok) {
        toast.success('任务已删除');
        loadTasks();
      } else {
        toast.error(res.error || '删除失败');
      }
    } catch {
      toast.error('删除失败，请确认后端已启动');
    }
  }

  if (loading) return <div className="grid place-items-center h-64"><Loader2 className="animate-spin text-slate-400" size={32} /></div>;

  if (error) return (
    <div className="grid place-items-center h-64">
      <div className="text-center">
        <AlertTriangle size={32} className="mx-auto text-amber-400" />
        <p className="mt-3 text-slate-300">{error}</p>
        <button onClick={loadTasks} className="mt-4 rounded-md bg-violet-500 px-3 py-2 text-sm text-white">重试</button>
      </div>
    </div>
  );

  return (
    <section className="space-y-5">
      <div>
        <p className="text-sm font-medium text-violet-200">公共任务池</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-normal text-white">成员自主认领，角色动态切换</h2>
      </div>

      {isProjectPM && (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          {!showAddForm ? (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-2 rounded-md bg-violet-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-400"
              >
                <Plus size={16} /> 添加任务
              </button>
              <button
                onClick={handleReSplit}
                disabled={resplitting}
                className="inline-flex items-center gap-2 rounded-md border border-violet-400/40 bg-violet-500/10 px-3 py-2 text-sm font-semibold text-violet-200 transition hover:bg-violet-500/20 disabled:opacity-60"
              >
                <Sparkles size={16} />
                {resplitting ? 'AI 拆分中...' : '重新 AI 拆分'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleAddTask} className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">发布新任务到任务池</label>
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setNewTask({ title: '', summary: '', cycle: '' }); }}
                  className="grid h-7 w-7 place-items-center rounded-md border border-white/10 text-slate-500 hover:bg-white/8"
                >
                  <X size={14} />
                </button>
              </div>
              <input
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                placeholder="任务标题（必填）"
                className="w-full rounded-md border border-white/10 bg-[#0c0f16] px-3 py-2 text-sm text-slate-200 outline-none focus:border-violet-400/60"
              />
              <input
                value={newTask.summary}
                onChange={(e) => setNewTask({ ...newTask, summary: e.target.value })}
                placeholder="一句话说明任务目标"
                className="w-full rounded-md border border-white/10 bg-[#0c0f16] px-3 py-2 text-sm text-slate-200 outline-none focus:border-violet-400/60"
              />
              <input
                value={newTask.cycle}
                onChange={(e) => setNewTask({ ...newTask, cycle: e.target.value })}
                placeholder="周期，如 第1周"
                className="w-full rounded-md border border-white/10 bg-[#0c0f16] px-3 py-2 text-sm text-slate-200 outline-none focus:border-violet-400/60"
              />
              <button
                type="submit"
                disabled={adding}
                className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-[#0f1117] transition hover:bg-violet-100 disabled:opacity-70"
              >
                {adding ? '发布中...' : '发布到任务池'}
              </button>
            </form>
          )}
        </div>
      )}

      {tasks.length === 0 ? (
        <EmptyState
          title="任务池还没有任务"
          detail="等待项目PM创建并发布任务。如果是空白模板创建的项目，需要在项目内手动添加任务。"
          action="返回项目列表"
          onClick={() => navigate('/projects')}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              currentUserId={currentUser?.id}
              onClaim={handleClaim}
              onUnclaim={currentUser && task.owner_id === currentUser.id ? () => handleUnclaim(task.id) : undefined}
              onOpen={(id) => navigate(`/projects/${projectId}/tasks/${id}`)}
              onDelete={isProjectPM ? () => handleDeleteTask(task) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}
