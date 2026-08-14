import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { get, post, put, del } from '../../lib/api';
import { useStore } from '../../store';
import { useSocket } from '../../hooks/useSocket';
import { TaskCard } from '../../components/ui/TaskCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { AlertTriangle, ArrowLeft, BookOpen, Boxes, CalendarDays, Copy, KeyRound, Loader2, RefreshCw } from 'lucide-react';

const MODULES = [
  { key: 'product', name: '产品', detail: '需求、功能、体验、交互、技术实现相关模块' },
  { key: 'operations', name: '运营', detail: '增长、活动、用户、社群、渠道推进相关模块' },
  { key: 'content', name: '内容', detail: '文案、文章、视频、宣发、媒体素材相关模块' },
];

function normalizeModule(task) {
  const key = task.module_key || task.moduleKey;
  const name = task.module_name || task.moduleName || task.module || '';
  const text = `${name} ${task.title || ''} ${task.summary || ''}`.toLowerCase();
  if (key === 'operations' || /运营|operation|ops|增长|活动|社群|渠道|用户/.test(text)) return 'operations';
  if (key === 'content' || /内容|content|文案|文章|视频|媒体|宣发|传播/.test(text)) return 'content';
  return 'product';
}

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
  const [selectedModule, setSelectedModule] = useState(null);
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
      '项目一级模块：产品、运营、内容。',
      '你需要先围绕这三个一级模块拆项目结构。PM Board 第一屏只展示这三个模块；每个模块点进去后才展示你回传的二级任务。',
      '',
      projectAgentInstructions || project?.agent_instructions || '',
      '',
      'API 使用方式：',
      `GET ${origin}/api/agent/project 读取项目需求文档和已有任务块。`,
      `POST ${origin}/api/agent/project/tasks 回传你拆好的模块，PM Board 会把它们显示为项目模块。`,
      '请求头：Authorization: Bearer <API_KEY>',
      '一级模块只能是：产品、运营、内容。',
      '创建示例：{"tasks":[{"module":"产品","title":"任务块标题","summary":"目标","cycle":"第1周","idea":"核心想法","executionPlan":"执行方案","resourcePlan":"资源配合","subtasks":[{"title":"子任务","note":"说明"}]}],"publishNow":true}',
    ].join('\n');
  }

  function getTimeline() {
    try {
      const raw = typeof project?.timeline_json === 'string'
        ? JSON.parse(project.timeline_json || '[]')
        : project?.timeline_json || [];
      return Array.isArray(raw) ? raw.filter((item) => Array.isArray(item) && (item[0] || item[1])) : [];
    } catch {
      return [];
    }
  }

  function getModuleTasks(moduleKey) {
    return tasks.filter((task) => normalizeModule(task) === moduleKey);
  }

  function moduleProgress(moduleTasks) {
    if (!moduleTasks.length) return 0;
    const total = moduleTasks.reduce((sum, task) => sum + Number(task.progress || 0), 0);
    return Math.round(total / moduleTasks.length);
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

  const timeline = getTimeline();
  const currentModule = MODULES.find((module) => module.key === selectedModule);

  return (
    <section className="space-y-5">
      <div>
        <p className="text-sm font-medium text-violet-200">Agent 回传模块</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-normal text-white">
          {currentModule ? `${currentModule.name}模块 · 二级任务` : '项目总览 · 产品 / 运营 / 内容'}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          {currentModule
            ? '这里展示该一级模块下面的二级任务。进入任务后，子PM 再继续拆执行步骤、周计划和阶段交付。'
            : '发起项目后先形成需求说明书和 API Key。总PM把它交给自己的 Agent，Agent 回传产品、运营、内容三个一级模块下的二级任务。'}
        </p>
      </div>

      {!currentModule && isProjectPM && (
        <div className="space-y-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="rounded-md border border-emerald-400/20 bg-emerald-500/[0.06] p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-100"><KeyRound size={15} />总PM Agent 包</p>
                <p className="mt-1 text-sm text-slate-500">复制需求说明书和 API Key 给你的 Agent。请让 Agent 先围绕产品、运营、内容三个一级模块拆项目，再把二级任务回传到对应模块下。</p>
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

      {currentModule ? (
        <div className="space-y-4">
          <button
            onClick={() => setSelectedModule(null)}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/8"
          >
            <ArrowLeft size={15} /> 回到项目总览
          </button>
          {getModuleTasks(currentModule.key).length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {getModuleTasks(currentModule.key).map((task) => (
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
          ) : (
            <EmptyState
              title={`${currentModule.name}模块还没有二级任务`}
              detail="等总PM Agent 回传这个模块下的任务后，再进入具体任务继续拆执行。"
              action="回到项目总览"
              onClick={() => setSelectedModule(null)}
            />
          )}
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <div className="grid gap-4 lg:grid-cols-3">
            {MODULES.map((module) => {
              const moduleTasks = getModuleTasks(module.key);
              const progress = moduleProgress(moduleTasks);
              const claimed = moduleTasks.filter((task) => task.owner_id).length;
              return (
                <button
                  key={module.key}
                  onClick={() => setSelectedModule(module.key)}
                  className="min-h-72 rounded-lg border border-white/10 bg-white/[0.025] p-5 text-left transition hover:border-emerald-400/40 hover:bg-white/[0.04]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 text-xl font-semibold text-white"><Boxes size={20} className="text-emerald-300" />{module.name}</p>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{module.detail}</p>
                    </div>
                    <span className="rounded bg-white/8 px-2 py-1 text-xs text-slate-400">{moduleTasks.length}</span>
                  </div>
                  <div className="mt-8 grid grid-cols-2 gap-2">
                    <div className="rounded-md bg-[#0c0f16] p-3">
                      <p className="text-2xl font-semibold text-white">{moduleTasks.length}</p>
                      <p className="mt-1 text-xs text-slate-500">二级任务</p>
                    </div>
                    <div className="rounded-md bg-[#0c0f16] p-3">
                      <p className="text-2xl font-semibold text-white">{claimed}</p>
                      <p className="mt-1 text-xs text-slate-500">已负责人</p>
                    </div>
                  </div>
                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                      <span>模块进度</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/8">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-violet-400" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <p className="mt-5 text-sm text-emerald-200">{moduleTasks.length ? '进入查看二级任务' : '等待 Agent 回传二级任务'}</p>
                </button>
              );
            })}
          </div>

          <aside className="xl:sticky xl:top-28 xl:self-start">
            <div className="rounded-lg border border-emerald-400/20 bg-white/[0.03] p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-violet-100"><CalendarDays size={15} />项目 Timeline</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">这里固定展示项目节奏，不重复展示需求说明书。需求说明书在上方总PM Agent 包里维护。</p>
              {timeline.length ? (
                <div className="mt-5 space-y-4">
                  {timeline.map(([time, detail], index) => (
                    <div key={`${time}-${index}`} className="border-l border-emerald-400/40 pl-4">
                      <p className="text-sm font-semibold text-white">{time || `阶段 ${index + 1}`}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{detail || '待拆解阶段目标'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-500">项目设置里可以补充按周或阶段划分的时间线。</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
