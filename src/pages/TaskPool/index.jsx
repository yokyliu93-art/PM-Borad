import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { get, post, put, del } from '../../lib/api';
import { useStore } from '../../store';
import { useSocket } from '../../hooks/useSocket';
import { TaskCard } from '../../components/ui/TaskCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { AlertTriangle, BookOpen, Copy, KeyRound, Loader2, Plus, RefreshCw, X, Sparkles } from 'lucide-react';

export function TaskPool() {
  const { projectId } = useParams();
  const { currentUser, tasksVersion } = useStore();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [project, setProject] = useState(null);
  const [projectAgentKey, setProjectAgentKey] = useState('');
  const [projectAgentInstructions, setProjectAgentInstructions] = useState('');
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
      if (r.ok) {
        setProject(r.data);
        setProjectAgentInstructions(r.data?.agent_instructions || '');
        setIsProjectPM(r.data?.pm_user_id === currentUser?.id);
      }
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
        toast.success('已取消认领，任务块回到大厅');
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
        toast.success('任务块已发布');
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

  async function regenerateProjectAgentKey() {
    const res = await post(`/api/projects/${projectId}/agent-key`, {});
    if (res.ok) {
      setProjectAgentKey(res.data.apiKey);
      setProject((p) => ({ ...p, agent_api_key_prefix: res.data.project.agent_api_key_prefix }));
      toast.success('总PM API Key 已生成，只显示这一次');
    } else {
      toast.error(res.error || '生成失败');
    }
  }

  async function saveProjectAgentDoc() {
    const res = await put(`/api/projects/${projectId}/agent-config`, { agentInstructions: projectAgentInstructions });
    if (res.ok) toast.success('总PM需求文档已保存');
    else toast.error(res.error || '保存失败');
  }

  async function copyText(text, message = '已复制') {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success(message);
  }

  function projectAgentGuide() {
    const origin = window.location.origin;
    return [
      '总PM Agent 包',
      `项目：${project?.name || ''}`,
      '',
      projectAgentInstructions || project?.agent_instructions || '',
      '',
      'API 使用方式：',
      `GET ${origin}/api/agent/project 读取项目需求文档和已有任务块。`,
      `POST ${origin}/api/agent/project/tasks 创建任务块并发布到任务大厅。`,
      '请求头：Authorization: Bearer <API_KEY>',
      '创建示例：{"tasks":[{"title":"任务块标题","summary":"目标","cycle":"第1周","idea":"核心想法","executionPlan":"执行方案","resourcePlan":"资源配合","subtasks":[{"title":"子任务","note":"说明"}]}],"publishNow":true}',
    ].join('\n');
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
        <p className="text-sm font-medium text-violet-200">任务大厅</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-normal text-white">项目PM拆出任务块，成员认领成为子PM</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">每个任务块只归一个子PM负责。进入后，子PM可以继续拆子任务并分配给组内成员执行。</p>
      </div>

      {isProjectPM && (
        <div className="space-y-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="rounded-md border border-emerald-400/20 bg-emerald-500/[0.06] p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-100"><KeyRound size={15} />总PM Agent 包</p>
                <p className="mt-1 text-sm text-slate-500">复制需求文档和 API Key 给你的 Agent，它可以把项目计划拆成任务块并传回 PM Board。</p>
                <p className="mt-2 text-xs text-slate-500">当前 Key：{projectAgentKey || project?.agent_api_key_prefix || '还没有生成'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => copyText(projectAgentGuide(), '总PM Agent 说明书已复制')} className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1.5 text-xs text-slate-300 hover:bg-white/8"><BookOpen size={12} />复制说明书</button>
                {projectAgentKey ? <button onClick={() => copyText(projectAgentKey, 'API Key 已复制')} className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1.5 text-xs text-slate-300 hover:bg-white/8"><Copy size={12} />复制 Key</button> : null}
                <button onClick={regenerateProjectAgentKey} className="inline-flex items-center gap-1 rounded-md bg-emerald-400 px-2 py-1.5 text-xs font-semibold text-[#08110f] hover:bg-emerald-300"><RefreshCw size={12} />生成/重置 Key</button>
              </div>
            </div>
            <textarea value={projectAgentInstructions} onChange={(e) => setProjectAgentInstructions(e.target.value)} className="mt-3 h-28 w-full resize-none rounded-md border border-white/10 bg-[#0c0f16] p-3 text-sm leading-6 text-slate-200 outline-none focus:border-emerald-300/60" />
            <button onClick={saveProjectAgentDoc} className="mt-2 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-[#0f1117]">保存需求文档</button>
          </div>
          {!showAddForm ? (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-2 rounded-md bg-violet-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-400"
              >
                <Plus size={16} /> 添加任务块
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
                <label className="text-sm font-medium text-slate-300">发布新的任务块</label>
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
                placeholder="任务块标题（必填）"
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
                {adding ? '发布中...' : '发布任务块'}
              </button>
            </form>
          )}
        </div>
      )}

      {tasks.length === 0 ? (
        <EmptyState
          title="任务大厅还没有任务块"
          detail="等待项目PM创建并发布任务块。如果是空白模板创建的项目，需要在项目内手动添加。"
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
