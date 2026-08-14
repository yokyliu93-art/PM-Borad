import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { get, post, put, del } from '../../lib/api';
import { useStore } from '../../store';
import { useSocket } from '../../hooks/useSocket';
import { TaskCard } from '../../components/ui/TaskCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { AlertTriangle, BookOpen, Copy, KeyRound, Loader2, RefreshCw } from 'lucide-react';

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
        toast.success('已取消认领，模块回到待负责人状态');
        loadTasks();
      } else {
        toast.error(res.error || '取消认领失败');
      }
    } catch {
      toast.error('取消认领失败，请确认后端已启动');
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
      `POST ${origin}/api/agent/project/tasks 回传你拆好的模块，PM Board 会把它们显示为项目模块。`,
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
        <p className="text-sm font-medium text-violet-200">Agent 回传模块</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-normal text-white">先把项目交给总PM Agent 拆</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">PM Board 不在这里手动拆任务。总PM复制 Agent 包，在自己的 Agent 里完成拆解；当 Agent 说“传到 PM Board”后，回传模块会出现在这里。</p>
      </div>

      {isProjectPM && (
        <div className="space-y-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="rounded-md border border-emerald-400/20 bg-emerald-500/[0.06] p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-100"><KeyRound size={15} />总PM Agent 包</p>
                <p className="mt-1 text-sm text-slate-500">复制需求文档和 API Key 给你的 Agent。拆解、讨论和确认都在 Agent 里完成，PM Board 只接收它回传的模块。</p>
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
        </div>
      )}

      {tasks.length === 0 ? (
        <EmptyState
          title={isProjectPM ? '等待总PM Agent 回传模块' : '模块还没有回传'}
          detail={isProjectPM ? '复制上面的 Agent 包，在你的 Agent 里拆解并确认模块；确认后让 Agent 传到 PM Board。' : '总PM会先和 Agent 拆解项目，等模块回传后你再进入具体模块。'}
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
