import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { get, post, put, del } from '../../lib/api';
import { useStore } from '../../store';
import { useSocket } from '../../hooks/useSocket';
import { TaskCard } from '../../components/ui/TaskCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Avatar } from '../../components/ui/Avatar';
import { AlertTriangle, ArrowLeft, BookOpen, Boxes, CalendarDays, Copy, KeyRound, Loader2, Plus, RefreshCw, Trash2, UserPlus } from 'lucide-react';

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
  const [selectedTimelineIndex, setSelectedTimelineIndex] = useState(null);
  const [editingModuleKey, setEditingModuleKey] = useState('');
  const [newTaskDrafts, setNewTaskDrafts] = useState({});
  const navigate = useNavigate();

  useSocket(projectId);

  useEffect(() => {
    if (!projectId) return;
    loadTasks();
  }, [projectId, tasksVersion]);

  useEffect(() => {
    if (!projectId) return;
    loadProject();
  }, [projectId, currentUser?.id]);

  async function loadProject() {
    const r = await get(`/api/projects/${projectId}`);
      if (r.ok) {
        setProject(r.data);
        setProjectAgentInstructions(r.data?.agent_instructions || '');
        setIsProjectPM(r.data?.pm_user_id === currentUser?.id);
      }
  }

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

  async function handleAssignTask(taskId, ownerId) {
    if (!ownerId) return;
    try {
      const res = await put(`/api/projects/${projectId}/tasks/${taskId}/owner`, { ownerId });
      if (res.ok) {
        toast.success('二级任务已指派');
        loadTasks();
      } else {
        toast.error(res.error || '指派失败');
      }
    } catch {
      toast.error('指派失败，请确认后端已启动');
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

  async function handleCreateModuleTask(module) {
    const draft = newTaskDrafts[module.key] || {};
    const title = String(draft.title || '').trim();
    if (!title) {
      toast.error('请先填写二级任务标题');
      return;
    }
    const res = await post(`/api/projects/${projectId}/tasks`, {
      title,
      summary: draft.summary || '',
      cycle: draft.cycle || '',
      moduleKey: module.key,
      moduleName: module.name,
      publishNow: true,
    });
    if (res.ok) {
      toast.success('二级任务已新增');
      setNewTaskDrafts((drafts) => ({ ...drafts, [module.key]: { title: '', summary: '', cycle: '' } }));
      setEditingModuleKey('');
      loadTasks();
      loadProject();
    } else {
      toast.error(res.error || '新增失败');
    }
  }

  function updateNewTaskDraft(moduleKey, patch) {
    setNewTaskDrafts((drafts) => ({
      ...drafts,
      [moduleKey]: { ...(drafts[moduleKey] || {}), ...patch },
    }));
  }

  async function handleClaimModule(module) {
    const res = await post(`/api/projects/${projectId}/modules/${encodeURIComponent(module.key)}/claim`, {});
    if (res.ok) {
      toast.success(`已认领「${module.name}」`);
      setProject(res.data);
    } else {
      toast.error(res.error || '认领失败');
    }
  }

  async function handleAssignModule(module, ownerId) {
    if (!ownerId) return;
    const res = await put(`/api/projects/${projectId}/modules/${encodeURIComponent(module.key)}/owner`, { ownerId });
    if (res.ok) {
      toast.success(`已指派「${module.name}」`);
      setProject(res.data);
    } else {
      toast.error(res.error || '指派失败');
    }
  }

  async function handleDeleteModule(module) {
    const moduleTasks = getModuleTasks(module.key);
    const detail = moduleTasks.length ? `\n这个一级菜单下面的 ${moduleTasks.length} 个二级任务、子任务和进度也会一起删除。` : '';
    if (!window.confirm(`确定删除一级菜单「${module.name}」？${detail}\n删除后不可恢复。`)) return;
    const res = await del(`/api/projects/${projectId}/modules/${encodeURIComponent(module.key)}`);
    if (res.ok) {
      toast.success('一级菜单已删除');
      setProject(res.data);
      setSelectedModule(null);
      loadTasks();
    } else {
      toast.error(res.error || '删除失败');
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
      '项目一级菜单由你根据项目说明书自行设计，不是固定模板。',
      '你复制到 Agent 后，请让 Agent 先读完整项目计划书，并先产出项目 Timeline。',
      'Timeline 是必填项：必须按周写清每周目标、关键动作、负责人/配合方和交付物，并回传到 PM Board。',
      '然后再写入一级菜单；PM Board 第一屏展示你写入的一级菜单；每个菜单点进去后才展示你回传的二级任务。',
      '',
      projectAgentInstructions || project?.agent_instructions || '',
      '',
      'API 使用方式：',
      `GET ${origin}/api/agent/project 读取项目需求文档和已有任务块。`,
      `POST ${origin}/api/agent/project/timeline 回传按周拆好的项目 Timeline。`,
      `POST ${origin}/api/agent/project/modules 回传项目一级菜单。`,
      `POST ${origin}/api/agent/project/tasks 回传你拆好的模块，PM Board 会把它们显示为项目模块。`,
      `POST ${origin}/api/agent/project/assignments 认领/指派一级模块和二级任务负责人。`,
      `POST ${origin}/api/agent/project/progress 开始项目、更新项目整体进度、批量更新任务块状态和进度。`,
      '请求头：Authorization: Bearer <API_KEY>',
      '推荐顺序：先回传 Timeline，再回传一级菜单，再回传二级任务；执行过程中持续用 progress 接口同步状态。',
      '一级菜单示例：{"modules":[{"name":"技术地基","detail":"域名、HTTPS、OAuth、基础前端能力"},{"name":"增长启动","detail":"冷启动、拉新、传播动作"}]}',
      'Timeline 示例：{"timeline":[{"week":"W1","detail":"本周目标：...；关键动作：...；负责人/配合方：...；交付物：..."},{"week":"W2","detail":"本周目标：...；关键动作：...；负责人/配合方：...；交付物：..."}]}',
      '二级任务示例：{"tasks":[{"module":"技术地基","title":"任务块标题","summary":"目标","cycle":"第1周","idea":"核心想法","executionPlan":"执行方案","resourcePlan":"资源配合","subtasks":[{"title":"子任务","note":"说明"}]}],"publishNow":true}',
      '负责人示例：{"moduleUpdates":[{"module":"技术地基","ownerName":"张三"}],"taskUpdates":[{"title":"任务块标题","ownerName":"李四","status":"进行中"}]}',
      '项目开始示例：{"status":"active","progressNote":"项目已启动，开始按 W1 推进"}',
      '项目进度示例：{"progress":65,"progressNote":"核心流程已完成，等待内容素材补齐"}',
      '任务完成示例：{"taskUpdates":[{"title":"技术地基","status":"已完成","progress":100,"progressNote":"域名、HTTPS 和 OAuth 已完成"}]}',
    ].join('\n');
  }

  function weekAgentGuide(week, index) {
    const [label, detail] = week || [];
    const sections = getWeekPlanSections(detail);
    return [
      'PM Board 周计划 Agent 包',
      `项目：${project?.name || ''}`,
      `周期：${label || `W${index + 1}`}`,
      '',
      '你是这个项目本周推进 Agent。请基于下面的周计划，帮负责人拆成可执行动作，并在执行过程中持续和负责人确认进度。',
      '',
      '本周计划：',
      detail || '暂无详细计划',
      '',
      sections.length ? '结构化拆解：' : '',
      ...sections.map((section) => `- ${section.label}：${section.value}`),
      '',
      '你需要输出：',
      '1. 本周目标是否清楚，如不清楚先追问。',
      '2. 每天/每阶段要推进的动作。',
      '3. 需要哪些人、材料、权限、预算、文档配合。',
      '4. 风险点和卡点预警。',
      '5. 最终交付物，以及交付到哪个飞书文档。',
      '',
      '回传 PM Board 时，请让负责人或总 PM 根据实际任务块使用对应 Agent API 更新进度和交付文档。',
      `PM Board 项目页：${window.location.origin}/projects/${projectId}/pool`,
    ].filter(Boolean).join('\n');
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

  function getTaskModuleKey(task) {
    return task.module_key || task.moduleKey || makeModuleKey(task.module_name || task.moduleName || task.module || '主模块');
  }

  function getModules() {
    const byKey = new Map();
    const projectModules = Array.isArray(project?.modules) ? project.modules : [];

    projectModules.forEach((module, index) => {
      const name = module.module_name || module.moduleName || module.name || `一级菜单 ${index + 1}`;
      const key = module.module_key || module.moduleKey || module.key || makeModuleKey(name);
      byKey.set(key, {
        key,
        name,
        detail: module.detail || module.description || module.summary || '',
        ownerId: module.owner_id || module.ownerId || '',
        ownerName: module.owner_name || module.ownerName || '',
        ownerAvatar: module.owner_avatar || module.ownerAvatar || '',
        assignedByName: module.owner_assigned_by_name || module.ownerAssignedByName || '',
        sortOrder: module.sort_order ?? module.sortOrder ?? index,
      });
    });

    tasks.forEach((task) => {
      const key = getTaskModuleKey(task);
      if (byKey.has(key)) return;
      byKey.set(key, {
        key,
        name: task.module_name || task.moduleName || task.module || '主模块',
        detail: '',
        ownerId: '',
        ownerName: '',
        ownerAvatar: '',
        assignedByName: '',
        sortOrder: byKey.size,
      });
    });

    return [...byKey.values()].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  function getModuleTasks(moduleKey) {
    return tasks.filter((task) => getTaskModuleKey(task) === moduleKey);
  }

  function moduleProgress(moduleTasks) {
    if (!moduleTasks.length) return 0;
    const total = moduleTasks.reduce((sum, task) => sum + Number(task.progress || 0), 0);
    return Math.round(total / moduleTasks.length);
  }

  function getWeekPlanLines(detail = '') {
    return String(detail || '')
      .split(/\n|；|;/)
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);
  }

  function getWeekPlanSections(detail = '') {
    const lines = getWeekPlanLines(detail);
    const labels = ['本周目标', '关键动作', '负责人/配合方', '交付物', '风险', '资源'];
    const sections = [];
    for (const label of labels) {
      const found = lines.find((line) => line.startsWith(`${label}：`) || line.startsWith(`${label}:`));
      if (found) sections.push({ label, value: found.replace(new RegExp(`^${label}[：:]\\s*`), '') });
    }
    const used = new Set(sections.map((section) => `${section.label}：${section.value}`));
    const rest = lines.filter((line) => !labels.some((label) => line.startsWith(`${label}：`) || line.startsWith(`${label}:`)));
    return sections.length ? [...sections, ...rest.map((line, index) => ({ label: `补充 ${index + 1}`, value: line }))] : lines.map((line, index) => ({ label: `计划 ${index + 1}`, value: line })).filter((section) => !used.has(section.value));
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
  const modules = getModules();
  const currentModule = modules.find((module) => module.key === selectedModule);
  const currentTimeline = Number.isInteger(selectedTimelineIndex) ? timeline[selectedTimelineIndex] : null;

  return (
    <section className="space-y-5">
      <div>
        <p className="text-sm font-medium text-violet-200">Agent 回传模块</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-normal text-white">
          {currentTimeline
            ? `${currentTimeline[0] || `阶段 ${selectedTimelineIndex + 1}`} · 周计划`
            : currentModule ? `${currentModule.name} · 二级任务` : '项目总览 · 一级菜单'}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          {currentTimeline
            ? '这里展开这一周的具体计划。后续可以由总PM Agent 回传更详细的目标、动作、负责人和交付物。'
            : currentModule
            ? '这里展示该一级模块下面的二级任务。进入任务后，子PM 再继续拆执行步骤、周计划和阶段交付。'
            : '发起项目后先形成需求说明书和 API Key。总PM把它交给自己的 Agent，Agent 先回传一级菜单，再回传每个一级菜单下的二级任务。'}
        </p>
      </div>

      {!currentTimeline && !currentModule && isProjectPM && (
        <div className="space-y-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="rounded-md border border-emerald-400/20 bg-emerald-500/[0.06] p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-100"><KeyRound size={15} />总PM Agent 包</p>
                <p className="mt-1 text-sm text-slate-500">复制需求说明书和 API Key 给你的 Agent。请让 Agent 先根据需求文档回传项目 Timeline，再写入一级菜单和二级任务。</p>
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

      {currentTimeline ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedTimelineIndex(null)}
                className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/8"
              >
                <ArrowLeft size={15} /> 回到项目总览
              </button>
              <button
                onClick={() => copyText(weekAgentGuide(currentTimeline, selectedTimelineIndex), '本周 Agent 计划已复制')}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-400 px-3 py-2 text-sm font-semibold text-[#08110f] transition hover:bg-emerald-300"
              >
                <Copy size={15} /> 复制本周 Agent 计划
              </button>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#151925] p-5">
              <p className="flex items-center gap-2 text-sm font-medium text-violet-100"><CalendarDays size={15} />{currentTimeline[0] || `阶段 ${selectedTimelineIndex + 1}`}</p>
              <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-2xl font-semibold text-white">本周计划二级页</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">这里是这一周的完整工作包，可以直接复制给负责人的 Agent 继续拆执行动作。</p>
                </div>
              </div>
              <div className="mt-5 rounded-md border border-emerald-400/20 bg-emerald-500/[0.06] p-4">
                <p className="text-xs font-medium text-emerald-200">周计划全文</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-200">{currentTimeline[1] || '暂无详细计划'}</p>
              </div>
              {getWeekPlanSections(currentTimeline[1]).length ? (
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {getWeekPlanSections(currentTimeline[1]).map((section, index) => (
                    <div key={`${section.label}-${index}`} className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-xs text-emerald-200">{section.label}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-200">{section.value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-md border border-dashed border-white/10 bg-[#0c0f16] p-5">
                  <p className="text-sm font-medium text-white">这一周还没有详细计划</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">让总PM Agent 拆 Timeline 时，把这一周的目标、关键动作、需要配合的人和交付物回传到这里。</p>
                </div>
              )}
            </div>
          </div>

          <aside className="xl:sticky xl:top-28 xl:self-start">
            <TimelinePanel
              timeline={timeline}
              selectedTimelineIndex={selectedTimelineIndex}
              onSelect={setSelectedTimelineIndex}
            />
          </aside>
        </div>
      ) : currentModule ? (
        <div className="space-y-4">
          <button
            onClick={() => setSelectedModule(null)}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/8"
          >
            <ArrowLeft size={15} /> 回到项目总览
          </button>
          {getModuleTasks(currentModule.key).length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {isProjectPM ? (
                <ModuleTaskComposer
                  module={currentModule}
                  draft={newTaskDrafts[currentModule.key] || {}}
                  onChange={(patch) => updateNewTaskDraft(currentModule.key, patch)}
                  onSubmit={() => handleCreateModuleTask(currentModule)}
                />
              ) : null}
              {getModuleTasks(currentModule.key).map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  currentUserId={currentUser?.id}
                  onClaim={handleClaim}
                  onUnclaim={currentUser && task.owner_id === currentUser.id ? () => handleUnclaim(task.id) : undefined}
                  onOpen={(id) => navigate(`/projects/${projectId}/tasks/${id}`)}
                  onDelete={isProjectPM ? () => handleDeleteTask(task) : undefined}
                  onAssign={isProjectPM ? (ownerId) => handleAssignTask(task.id, ownerId) : undefined}
                  memberOptions={project?.teamMembers || []}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {isProjectPM ? (
                <ModuleTaskComposer
                  module={currentModule}
                  draft={newTaskDrafts[currentModule.key] || {}}
                  onChange={(patch) => updateNewTaskDraft(currentModule.key, patch)}
                  onSubmit={() => handleCreateModuleTask(currentModule)}
                />
              ) : null}
              <EmptyState
                title={`${currentModule.name}模块还没有二级任务`}
                detail="总PM可以先手动新增二级任务；也可以等 Agent 回传这个模块下的任务。"
                action="回到项目总览"
                onClick={() => setSelectedModule(null)}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <div className="grid gap-4 lg:grid-cols-3">
            {modules.length ? modules.map((module) => {
              const moduleTasks = getModuleTasks(module.key);
              const progress = moduleProgress(moduleTasks);
              const claimed = moduleTasks.filter((task) => task.owner_id).length;
              return (
                <div
                  key={module.key}
                  className="min-h-72 rounded-lg border border-white/10 bg-white/[0.025] p-5 text-left transition hover:border-emerald-400/40 hover:bg-white/[0.04]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 text-xl font-semibold text-white"><Boxes size={20} className="text-emerald-300" />{module.name}</p>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{module.detail}</p>
                    </div>
                    <span className="rounded bg-white/8 px-2 py-1 text-xs text-slate-400">{moduleTasks.length}</span>
                  </div>
                  <div className="mt-5 rounded-md border border-white/10 bg-[#0c0f16] p-3">
                    {module.ownerId ? (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar member={{ name: module.ownerName, avatar_url: module.ownerAvatar }} size="xs" pm />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-white">{module.ownerName || '已分配 PM'}</p>
                            <p className="text-xs text-slate-500">一级菜单 PM{module.assignedByName ? ` · ${module.assignedByName} 指派` : ''}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-white">待认领 / 待指派</p>
                          <p className="mt-1 text-xs text-slate-500">认领后会推送到你的飞书私聊</p>
                        </div>
                        <button
                          onClick={() => handleClaimModule(module)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-400 px-2.5 py-1.5 text-xs font-semibold text-[#08110f] hover:bg-emerald-300"
                        >
                          <UserPlus size={12} /> 认领
                        </button>
                      </div>
                    )}
                    {isProjectPM ? (
                      <select
                        value={module.ownerId || ''}
                        onChange={(event) => handleAssignModule(module, event.target.value)}
                        className="mt-3 w-full rounded-md border border-white/10 bg-[#11141d] px-2 py-2 text-xs text-slate-200 outline-none"
                      >
                        <option value="">指派给成员...</option>
                        {(project?.teamMembers || []).map((member) => (
                          <option key={member.id} value={member.id}>{member.name}</option>
                        ))}
                      </select>
                    ) : null}
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
                  <button
                    onClick={() => setSelectedModule(module.key)}
                    className="mt-5 rounded-md border border-emerald-400/30 px-3 py-2 text-sm text-emerald-200 transition hover:bg-emerald-400/10"
                  >
                    {moduleTasks.length ? '进入查看二级任务' : '查看一级菜单'}
                  </button>
                  {isProjectPM ? (
                    <>
                      <button
                        onClick={() => setEditingModuleKey(editingModuleKey === module.key ? '' : module.key)}
                        className="ml-2 mt-5 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        <Plus size={14} /> 新增二级任务
                      </button>
                      <button
                        onClick={() => handleDeleteModule(module)}
                        className="ml-2 mt-5 inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                      >
                        <Trash2 size={14} /> 删除
                      </button>
                      {editingModuleKey === module.key ? (
                        <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
                          <ModuleTaskComposer
                            module={module}
                            draft={newTaskDrafts[module.key] || {}}
                            compact
                            onChange={(patch) => updateNewTaskDraft(module.key, patch)}
                            onSubmit={() => handleCreateModuleTask(module)}
                          />
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            }) : (
              <div className="grid min-h-72 place-items-center rounded-lg border border-dashed border-white/15 bg-white/[0.025] p-6 text-center lg:col-span-3">
                <div>
                  <Boxes className="mx-auto text-slate-500" size={28} />
                  <p className="mt-3 text-lg font-semibold text-white">等待 Agent 写入一级菜单</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">新项目不会预设产品、运营、内容。请把总PM Agent 包发给你的 Agent，让它先调用 modules 接口写入适合这个项目的一级菜单。</p>
                </div>
              </div>
            )}
          </div>

          <aside className="xl:sticky xl:top-28 xl:self-start">
            <TimelinePanel
              timeline={timeline}
              selectedTimelineIndex={selectedTimelineIndex}
              onSelect={setSelectedTimelineIndex}
            />
          </aside>
        </div>
      )}
    </section>
  );
}

function makeModuleKey(name = '') {
  const source = String(name || '').trim();
  const ascii = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (ascii) return ascii.slice(0, 48);
  let hash = 0;
  for (const ch of source || '主模块') hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return `module-${Math.abs(hash).toString(36)}`;
}

function ModuleTaskComposer({ module, draft, onChange, onSubmit, compact = false }) {
  return (
    <div className={compact ? 'space-y-2' : 'rounded-lg border border-white/10 bg-white/[0.03] p-4'}>
      {!compact ? (
        <div className="mb-3">
          <p className="text-sm font-semibold text-white">给「{module.name}」新增二级任务</p>
          <p className="mt-1 text-xs text-slate-500">总 PM 可以直接补任务，也可以之后继续让 Agent 回传更新。</p>
        </div>
      ) : null}
      <div className="grid gap-2">
        <input
          value={draft.title || ''}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="二级任务标题"
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-400"
        />
        <textarea
          value={draft.summary || ''}
          onChange={(event) => onChange({ summary: event.target.value })}
          placeholder="任务说明、目标或交付物"
          rows={compact ? 2 : 3}
          className="resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-400"
        />
        <div className="flex gap-2">
          <input
            value={draft.cycle || ''}
            onChange={(event) => onChange({ cycle: event.target.value })}
            placeholder="周期，比如 W1 / 本周"
            className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-400"
          />
          <button
            onClick={onSubmit}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
          >
            <Plus size={14} /> 添加
          </button>
        </div>
      </div>
    </div>
  );
}

function TimelinePanel({ timeline, selectedTimelineIndex, onSelect }) {
  return (
    <div className="rounded-lg border border-emerald-400/20 bg-white/[0.03] p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-violet-100"><CalendarDays size={15} />项目 Timeline</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">按周拆项目节奏。点开某一周进入周计划二级页，并复制给 Agent。</p>
      {timeline.length ? (
        <div className="mt-5 space-y-2">
          {timeline.map(([time, detail], index) => {
            const selected = selectedTimelineIndex === index;
            return (
              <button
                key={`${time}-${index}`}
                onClick={() => onSelect(index)}
                className={`w-full rounded-md border p-3 text-left transition ${
                  selected
                    ? 'border-emerald-400/50 bg-emerald-500/10'
                    : 'border-white/10 bg-[#0c0f16] hover:border-emerald-400/30 hover:bg-white/[0.04]'
                }`}
              >
                <p className="text-sm font-semibold text-white">{time || `阶段 ${index + 1}`}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{detail || '待拆解阶段目标'}</p>
                <p className="mt-2 text-xs text-emerald-200">进入周计划</p>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-sm leading-6 text-slate-500">项目设置里可以补充按周或阶段划分的时间线。</p>
      )}
    </div>
  );
}
