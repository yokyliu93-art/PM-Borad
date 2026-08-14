import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { get, post, put, del, uploadFile } from '../../lib/api';
import { useStore } from '../../store';
import { Avatar } from '../../components/ui/Avatar';
import { StatusPill } from '../../components/ui/StatusPill';
import { PanelTitle } from '../../components/ui/PanelTitle';
import { InfoField } from '../../components/ui/InfoField';
import { EmptyState } from '../../components/ui/EmptyState';
import { Bell, BookOpen, CalendarDays, ClipboardList, Copy, KeyRound, Link2, MessageSquarePlus, Plus, RefreshCw, Send, Loader2, AlertTriangle, UploadCloud, X, Paperclip, PackageCheck, Trash2 } from 'lucide-react';

const TASK_STATUSES = ['待开始', '进行中'];
const SUBTASK_STATUSES = ['待开始', '进行中', '已提交', '已完成'];
const STEP_STATUSES = ['待开始', '进行中', '已完成'];
const REMINDER_OPTIONS = [
  ['none', '不提醒'],
  ['daily', '每天提醒'],
  ['workday', '工作日提醒'],
  ['weekly', '每周提醒'],
];
const WEEK_DAYS = [
  [1, '周一'],
  [2, '周二'],
  [3, '周三'],
  [4, '周四'],
  [5, '周五'],
  [6, '周六'],
  [7, '周日'],
];
const SCHEDULE_STATUSES = ['未开始', '进行中', '已交付', '已完成'];

export function Subproject() {
  const { projectId, taskId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useStore();
  const [task, setTask] = useState(null);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newSubtask, setNewSubtask] = useState({ title: '' });
  const [newTaskComment, setNewTaskComment] = useState('');
  const [commentDrafts, setCommentDrafts] = useState({});
  const [reviewComment, setReviewComment] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [drafts, setDrafts] = useState({});
  const [docDrafts, setDocDrafts] = useState({});
  const [stepDrafts, setStepDrafts] = useState({});
  const [agentDrafts, setAgentDrafts] = useState({});
  const [agentKeys, setAgentKeys] = useState({});
  const [taskAgentKey, setTaskAgentKey] = useState('');
  const [taskAgentInstructions, setTaskAgentInstructions] = useState('');

  useEffect(() => { loadTask(); }, [taskId]);

  useEffect(() => {
    if (!task) return;
    setTaskAgentInstructions(task.agent_instructions || '');
    const nextSteps = {};
    const nextDocs = {};
    const nextAgents = {};
    for (const sub of task.subtasks || []) {
      nextSteps[sub.id] = (sub.steps || []).map((step) => ({
        id: step.id,
        title: step.title || '',
        status: step.status || '待开始',
        dueText: step.due_text || '',
        deliveryDocUrl: step.delivery_doc_url || '',
        reminderFrequency: step.reminder_frequency || 'none',
        reminderEnabled: !!step.reminder_enabled,
        sortOrder: step.sort_order ?? 0,
      }));
      nextDocs[sub.id] = sub.delivery_doc_url || '';
      nextAgents[sub.id] = {
        agentInstructions: sub.agent_instructions || '',
        feishuPushEnabled: !!sub.feishu_push_enabled,
        feishuChatId: sub.feishu_chat_id || '',
        schedule: (sub.schedule || []).map((item, index) => ({
          id: item.id,
          weekIndex: item.week_index ?? index + 1,
          goal: item.goal || '',
          reminderDay: item.reminder_day || 1,
          reminderTime: item.reminder_time || '10:00',
          deliveryDocUrl: item.delivery_doc_url || '',
          status: item.status || '未开始',
          reminderEnabled: !!item.reminder_enabled,
          sortOrder: item.sort_order ?? index,
        })),
      };
    }
    setStepDrafts(nextSteps);
    setDocDrafts(nextDocs);
    setAgentDrafts(nextAgents);
  }, [task]);

  async function loadTask() {
    setLoading(true);
    setError(null);
    try {
      const res = await get(`/api/projects/${projectId}/tasks/${taskId}`);
      setTask(res.data);
    } catch {
      setError('无法连接服务器，请确认后端已启动');
    }
    setLoading(false);
  }

  async function loadProject() {
    try {
      const res = await get(`/api/projects/${projectId}`);
      if (res.ok) setProject(res.data);
    } catch {
      // The task page can still render; member assignment will stay limited.
    }
  }

  useEffect(() => {
    if (!projectId) return;
    loadProject();
  }, [projectId]);

  async function handleProgress(pct) {
    const val = Number(pct);
    await put(`/api/projects/${projectId}/tasks/${taskId}`, { progress: val });
    setTask((t) => ({ ...t, progress: val }));
  }

  async function handleStatus(status) {
    await put(`/api/projects/${projectId}/tasks/${taskId}`, { status });
    loadTask();
  }

  async function handleAddSubtask() {
    if (!newSubtask.title.trim()) return;
    await post(`/api/projects/${projectId}/tasks/${taskId}/subtasks`, newSubtask);
    setNewSubtask({ title: '', assigneeId: '', note: '' });
    loadTask();
  }

  async function updateSubtask(subtaskId, patch) {
    const subtasks = task.subtasks.map((s) => {
      const next = s.id === subtaskId ? { ...s, ...patch } : s;
      return {
        id: next.id,
        title: next.title,
        assigneeId: next.assigneeId ?? next.assignee_id ?? null,
        status: next.status,
        note: next.note || '',
        sortOrder: next.sortOrder ?? next.sort_order ?? 0,
      };
    });
    await put(`/api/projects/${projectId}/tasks/${taskId}/subtasks`, { subtasks });
    loadTask();
  }

  async function handleSubtaskStatus(subtaskId, status) {
    await updateSubtask(subtaskId, { status });
  }

  async function handleAssignSubtask(subtaskId, assigneeId) {
    await updateSubtask(subtaskId, { assigneeId: assigneeId || null });
    toast.success(assigneeId ? '子任务已分配' : '已取消分配');
  }

  function toggleExpanded(subId) {
    setExpanded((e) => ({ ...e, [subId]: !e[subId] }));
  }

  async function handleRemoveSubAttachment(subId, att) {
    const res = await del(`/api/projects/${projectId}/tasks/${taskId}/subtasks/${subId}/attachments/${att.id}`);
    if (res.ok) loadTask();
    else toast.error(res.error || '删除失败');
  }

  async function handleSubmitSubtask(subtaskId) {
    const res = await post(`/api/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}/submit`, {
      description: drafts[subtaskId] || '',
      docUrl: docDrafts[subtaskId] || '',
    });
    if (res.ok) toast.success('已提交，等待项目PM确认');
    else toast.error(res.error || '提交失败');
    loadTask();
  }

  function updateStepDraft(subtaskId, index, patch) {
    setStepDrafts((all) => ({
      ...all,
      [subtaskId]: (all[subtaskId] || []).map((step, i) => (i === index ? { ...step, ...patch } : step)),
    }));
  }

  function addStepDraft(subtaskId) {
    setStepDrafts((all) => ({
      ...all,
      [subtaskId]: [
        ...(all[subtaskId] || []),
        { title: '', status: '待开始', dueText: '', deliveryDocUrl: '', reminderFrequency: 'none', reminderEnabled: false },
      ],
    }));
  }

  function removeStepDraft(subtaskId, index) {
    setStepDrafts((all) => ({
      ...all,
      [subtaskId]: (all[subtaskId] || []).filter((_, i) => i !== index),
    }));
  }

  async function saveSteps(subtaskId) {
    const steps = (stepDrafts[subtaskId] || []).filter((step) => step.title.trim());
    const res = await put(`/api/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}/steps`, { steps });
    if (res.ok) {
      toast.success('执行步骤已保存');
      loadTask();
    } else {
      toast.error(res.error || '保存步骤失败');
    }
  }

  function updateAgentDraft(subtaskId, patch) {
    setAgentDrafts((all) => ({
      ...all,
      [subtaskId]: { ...(all[subtaskId] || {}), ...patch },
    }));
  }

  function updateScheduleDraft(subtaskId, index, patch) {
    setAgentDrafts((all) => {
      const current = all[subtaskId] || { schedule: [] };
      return {
        ...all,
        [subtaskId]: {
          ...current,
          schedule: (current.schedule || []).map((item, i) => (i === index ? { ...item, ...patch } : item)),
        },
      };
    });
  }

  function addScheduleDraft(subtaskId) {
    setAgentDrafts((all) => {
      const current = all[subtaskId] || { schedule: [] };
      const nextWeek = (current.schedule || []).length + 1;
      return {
        ...all,
        [subtaskId]: {
          ...current,
          schedule: [
            ...(current.schedule || []),
            { weekIndex: nextWeek, goal: '', reminderDay: 1, reminderTime: '10:00', deliveryDocUrl: '', status: '未开始', reminderEnabled: true },
          ],
        },
      };
    });
  }

  function removeScheduleDraft(subtaskId, index) {
    setAgentDrafts((all) => {
      const current = all[subtaskId] || { schedule: [] };
      return {
        ...all,
        [subtaskId]: { ...current, schedule: (current.schedule || []).filter((_, i) => i !== index) },
      };
    });
  }

  async function saveAgentConfig(subtaskId) {
    const draft = agentDrafts[subtaskId] || {};
    const res = await put(`/api/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}/agent-config`, {
      ...draft,
      schedule: (draft.schedule || []).filter((item) => String(item.goal || '').trim()),
    });
    if (res.ok) {
      toast.success('Agent 配置已保存');
      loadTask();
    } else {
      toast.error(res.error || '保存 Agent 配置失败');
    }
  }

  async function regenerateAgentKey(subtaskId) {
    const res = await post(`/api/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}/agent-key`, {});
    if (res.ok) {
      setAgentKeys((keys) => ({ ...keys, [subtaskId]: res.data.apiKey }));
      toast.success('API Key 已生成，只显示这一次');
      loadTask();
    } else {
      toast.error(res.error || '生成 API Key 失败');
    }
  }

  async function testFeishuReminder(subtaskId) {
    const res = await post(`/api/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}/agent-reminder/test`, {});
    if (res.ok) toast.success('测试提醒已发送');
    else toast.error(res.error || '发送测试提醒失败');
  }

  async function copyText(text, message = '已复制') {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success(message);
  }

  async function regenerateTaskAgentKey() {
    const res = await post(`/api/projects/${projectId}/tasks/${taskId}/agent-key`, {});
    if (res.ok) {
      setTaskAgentKey(res.data.apiKey);
      setTask((t) => ({ ...t, agent_api_key_prefix: res.data.task.agent_api_key_prefix }));
      toast.success('子PM API Key 已生成，只显示这一次');
    } else {
      toast.error(res.error || '生成 API Key 失败');
    }
  }

  async function saveTaskAgentDoc() {
    const res = await put(`/api/projects/${projectId}/tasks/${taskId}/agent-config`, { agentInstructions: taskAgentInstructions });
    if (res.ok) toast.success('子PM需求文档已保存');
    else toast.error(res.error || '保存需求文档失败');
  }

  function taskAgentGuide() {
    const origin = window.location.origin;
    return [
      '子PM Agent 包',
      `任务块：${task?.title || ''}`,
      '',
      taskAgentInstructions || task?.agent_instructions || '',
      '',
      `想法：${task?.idea_text || '待 Agent 回传'}`,
      `执行方案：${task?.execution_plan || '待 Agent 回传'}`,
      `资源配合：${task?.resource_plan || '待 Agent 回传'}`,
      '日更规则：硅星人的工作进度必须以天为单位沉淀到 PM Board。每天工作结束后，请主动整理今天完成了什么、遇到什么阻塞、明天推进什么，并调用进度接口回写；不要等到周会才更新。',
      '',
      'API 使用方式：',
      `GET ${origin}/api/agent/task 读取这块任务的需求文档、子任务和成员执行状态。`,
      `POST ${origin}/api/agent/task/subtasks 创建子任务、执行步骤和周计划。`,
      `POST ${origin}/api/agent/task/progress 回写这块任务的整体进度。`,
      '回写计划时请带上 idea / executionPlan / resourcePlan 三个字段。',
      '请求头：Authorization: Bearer <API_KEY>',
      '创建子任务示例：{"subtasks":[{"title":"子任务标题","note":"给执行人的说明","steps":[{"title":"第一步"}],"schedule":[{"weekIndex":1,"goal":"本周目标","reminderDay":1,"reminderTime":"10:00"}]}]}',
    ].join('\n');
  }

  async function handleConfirmSubtask(subtaskId) {
    const res = await post(`/api/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}/confirm`, {});
    if (res.ok) toast.success('已确认，子任务完成');
    else toast.error(res.error || '确认失败');
    loadTask();
  }

  async function handlePostComment({ targetType = 'task', targetId = taskId } = {}) {
    const isTask = targetType === 'task';
    const content = isTask ? newTaskComment.trim() : String(commentDrafts[targetId] || '').trim();
    if (!content) return;
    const res = await post(`/api/projects/${projectId}/tasks/${taskId}/comments`, { content, targetType, targetId });
    if (res.ok) {
      if (isTask) setNewTaskComment('');
      else setCommentDrafts((drafts) => ({ ...drafts, [targetId]: '' }));
      loadTask();
    } else {
      toast.error(res.error || '发送失败');
    }
  }

  async function handleDeleteComment(comment) {
    const res = await del(`/api/projects/${projectId}/tasks/${taskId}/comments/${comment.id}`);
    if (!res.ok) toast.error(res.error || '删除失败');
    loadTask();
  }

  async function handleDeleteCurrentTask() {
    if (!task) return;
    const ownerText = task.owner_id ? `（已被 ${task.owner_name || '成员'} 认领）` : '';
    if (!window.confirm(`确定删除任务「${task.title}」？${ownerText}\n删除后其子任务、评论、进度和附件都会一并移除，不可恢复。`)) return;
    try {
      const res = await del(`/api/projects/${projectId}/tasks/${task.id}`);
      if (res.ok) {
        toast.success('任务已删除');
        navigate(`/projects/${projectId}/pool`);
      } else {
        toast.error(res.error || '删除失败');
      }
    } catch {
      toast.error('删除失败，请确认后端已启动');
    }
  }

  async function handleAdoptComment(comment) {
    const res = await post(`/api/projects/${projectId}/tasks/${taskId}/comments/${comment.id}/adopt`, {});
    if (res.ok) {
      toast.success('已采纳到左侧任务说明');
      loadTask();
    } else {
      toast.error(res.error || '采纳失败');
    }
  }

  async function handleUploadFile(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const res = await uploadFile(`/api/projects/${projectId}/tasks/${taskId}/attachments`, file);
        if (!res.ok) toast.error(res.error || '上传失败');
      }
      toast.success('上传成功');
      loadTask();
    } catch {
      toast.error('上传失败，请确认后端已启动');
    }
    setUploading(false);
    e.target.value = '';
  }

  async function handleRemoveAttachment(att) {
    const res = await del(`/api/projects/${projectId}/tasks/${taskId}/attachments/${att.id}`);
    if (res.ok) loadTask();
    else toast.error(res.error || '删除失败');
  }

  async function handleSubmitTask() {
    setSubmitting(true);
    try {
      const res = await post(`/api/projects/${projectId}/tasks/${taskId}/submit`, {});
      if (res.ok) {
        toast.success('已提交，等待项目PM审核');
        loadTask();
      } else {
        toast.error(res.error || '提交失败');
      }
    } catch {
      toast.error('提交失败，请确认后端已启动');
    }
    setSubmitting(false);
  }

  async function handleReview(approved) {
    try {
      const res = await post(`/api/projects/${projectId}/tasks/${taskId}/review`, {
        approved,
        comment: reviewComment.trim(),
      });
      if (res.ok) {
        toast.success(approved ? '已通过，任务标记为已完成' : '已驳回，任务回到进行中');
        setReviewComment('');
        loadTask();
      } else {
        toast.error(res.error || '审核失败');
      }
    } catch {
      toast.error('审核失败，请确认后端已启动');
    }
  }

  if (loading) return <div className="grid place-items-center h-64"><Loader2 className="animate-spin text-slate-400" size={32} /></div>;
  if (error) return (
    <div className="grid place-items-center h-64">
      <div className="text-center">
        <AlertTriangle size={32} className="mx-auto text-amber-400" />
        <p className="mt-3 text-slate-300">{error}</p>
        <button onClick={loadTask} className="mt-4 rounded-md bg-violet-500 px-3 py-2 text-sm text-white">重试</button>
      </div>
    </div>
  );
  if (!task) return <EmptyState title="任务不存在" />;

  const owner = task.owner_name ? { name: task.owner_name, avatar_url: task.owner_avatar, id: task.owner_id, color: 'from-violet-500 to-fuchsia-500' } : null;
  const isReviewer = task.isProjectPM;
  const canManage = task.owner_id === currentUser?.id || isReviewer;
  const isLocked = task.status === '审核中' || task.status === '已完成';
  const assignmentMembers = project?.teamMembers || project?.members || [];

  function formatCommentTime(value) {
    if (!value) return '';
    const date = new Date(`${String(value).replace(' ', 'T')}Z`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  function canDeleteComment(comment) {
    return comment.user_id === currentUser?.id || canManage || isReviewer;
  }

  function renderCommentList(comments = [], { adoptable = false } = {}) {
    if (!comments.length) {
      return <p className="rounded-md border border-dashed border-white/10 bg-[#0c0f16] px-3 py-4 text-sm text-slate-500">还没有讨论，发第一条。</p>;
    }
    return (
      <div className="space-y-3">
        {comments.map((comment) => (
          <div key={comment.id} className="group flex items-start gap-3">
            <Avatar member={{ name: comment.user_name, avatar_url: comment.user_avatar }} size="xs" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-medium text-white">{comment.user_name}</span>
                <span className="text-[11px] text-slate-600">{formatCommentTime(comment.created_at)}</span>
                {comment.adopted_at ? (
                  <span className="rounded bg-emerald-400/10 px-1.5 py-0.5 text-[11px] text-emerald-200">已采纳</span>
                ) : null}
                {adoptable && canManage && !comment.adopted_at ? (
                  <button onClick={() => handleAdoptComment(comment)} className="opacity-0 text-[11px] text-emerald-300 transition hover:text-emerald-100 group-hover:opacity-100">采纳</button>
                ) : null}
                {canDeleteComment(comment) ? (
                  <button onClick={() => handleDeleteComment(comment)} className="opacity-0 text-[11px] text-slate-500 transition hover:text-red-300 group-hover:opacity-100">删除</button>
                ) : null}
              </div>
              <p className="mt-1 whitespace-pre-wrap rounded-md bg-white/[0.04] px-3 py-2 text-sm leading-6 text-slate-300">{comment.content}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderCommentComposer({ targetType = 'task', targetId = taskId, compact = false } = {}) {
    const isTask = targetType === 'task';
    const value = isTask ? newTaskComment : commentDrafts[targetId] || '';
    const setValue = (next) => {
      if (isTask) setNewTaskComment(next);
      else setCommentDrafts((drafts) => ({ ...drafts, [targetId]: next }));
    };
    return (
      <div className={`flex items-start gap-2 ${compact ? '' : 'mt-4'}`}>
        <Avatar member={currentUser} size="xs" />
        <div className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#0c0f16] focus-within:border-violet-400/60">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handlePostComment({ targetType, targetId });
            }}
            placeholder={compact ? '回复这个子任务...' : '发一条讨论，按 Cmd/Ctrl + Enter 发送'}
            className="h-20 w-full resize-none bg-transparent px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600"
          />
          <div className="flex items-center justify-between border-t border-white/10 px-2 py-2">
            <span className="text-[11px] text-slate-600">Slack 式讨论，之后可接飞书群同步</span>
            <button onClick={() => handlePostComment({ targetType, targetId })} disabled={!value.trim()} className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0f1117] disabled:opacity-50">
              <Send size={12} />发送
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderPlanBlock(title, value, fallback) {
    return (
      <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
        <p className="text-xs font-medium text-slate-500">{title}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{value || fallback}</p>
      </div>
    );
  }

  // Deliverable file list — visible to everyone; delete only for owner when not locked.
  function renderFiles() {
    const files = task.attachments || [];
    if (files.length === 0) return null;
    const canDelete = canManage && !isLocked;
    return (
      <div>
        <p className="mb-2 text-xs text-slate-500">交付文件（{files.length}）</p>
        <ul className="space-y-2">
          {files.map((a) => (
            <li key={a.id} className="rounded-md border border-white/10 bg-[#11141d] p-2">
              <div className="flex items-center gap-2">
                {a.mime && a.mime.startsWith('image/') ? (
                  <a href={a.file_path} target="_blank" rel="noreferrer" className="block shrink-0">
                    <img src={a.file_path} alt={a.file_name} className="h-16 w-16 rounded border border-white/10 object-cover" />
                  </a>
                ) : (
                  <Paperclip size={14} className="shrink-0 text-slate-500" />
                )}
                <a href={a.file_path} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm text-violet-200 hover:underline">{a.file_name}</a>
                {canDelete && (
                  <button onClick={() => handleRemoveAttachment(a)} aria-label="删除附件" className="grid h-6 w-6 shrink-0 place-items-center rounded text-slate-500 transition hover:bg-red-500/10 hover:text-red-300"><X size={13} /></button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Subtask deliverable list — read-only once submitted/completed.
  function renderSubFiles(sub, canEdit) {
    const files = sub.attachments || [];
    if (files.length === 0) return null;
    return (
      <ul className="space-y-2">
        {files.map((a) => (
          <li key={a.id} className="rounded-md border border-white/10 bg-[#0c0f16] p-2">
            <div className="flex items-center gap-2">
              {a.mime && a.mime.startsWith('image/') ? (
                <a href={a.file_path} target="_blank" rel="noreferrer" className="block shrink-0">
                  <img src={a.file_path} alt={a.file_name} className="h-16 w-16 rounded border border-white/10 object-cover" />
                </a>
              ) : (
                <Paperclip size={14} className="shrink-0 text-slate-500" />
              )}
              <a href={a.file_path} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm text-violet-200 hover:underline">{a.file_name}</a>
              {canEdit ? (
                <button onClick={() => handleRemoveSubAttachment(sub.id, a)} aria-label="删除附件" className="grid h-6 w-6 shrink-0 place-items-center rounded text-slate-500 transition hover:bg-red-500/10 hover:text-red-300"><X size={13} /></button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  function renderSteps(sub, editable) {
    const steps = stepDrafts[sub.id] || [];
    return (
      <div className="space-y-2 rounded-md border border-white/10 bg-[#0c0f16] p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-slate-400">详细执行步骤</p>
          {editable ? (
            <button onClick={() => addStepDraft(sub.id)} className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/8">
              <Plus size={12} /> 添加步骤
            </button>
          ) : null}
        </div>
        {steps.length === 0 ? (
          <p className="text-sm text-slate-500">还没有执行步骤</p>
        ) : (
          <div className="space-y-2">
            {steps.map((step, index) => (
              <div key={step.id || index} className="grid gap-2 rounded-md border border-white/10 bg-[#11141d] p-2 md:grid-cols-[1fr_104px_112px_1fr_126px_28px] md:items-center">
                <input
                  value={step.title}
                  onChange={(e) => updateStepDraft(sub.id, index, { title: e.target.value })}
                  disabled={!editable}
                  placeholder={`步骤 ${index + 1}`}
                  className="min-w-0 rounded-md border border-white/10 bg-[#0c0f16] px-2 py-1.5 text-sm text-slate-200 outline-none disabled:border-transparent disabled:bg-transparent"
                />
                <select
                  value={step.status}
                  onChange={(e) => updateStepDraft(sub.id, index, { status: e.target.value })}
                  disabled={!editable}
                  className="rounded-md border border-white/10 bg-[#0c0f16] px-2 py-1.5 text-xs text-slate-200 outline-none disabled:border-transparent disabled:bg-transparent"
                >
                  {STEP_STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
                <input
                  value={step.dueText}
                  onChange={(e) => updateStepDraft(sub.id, index, { dueText: e.target.value })}
                  disabled={!editable}
                  placeholder="如 周五前"
                  className="rounded-md border border-white/10 bg-[#0c0f16] px-2 py-1.5 text-xs text-slate-200 outline-none disabled:border-transparent disabled:bg-transparent"
                />
                <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-white/10 bg-[#0c0f16] px-2 py-1.5 focus-within:border-violet-400/60">
                  <Link2 size={12} className="shrink-0 text-slate-500" />
                  <input
                    value={step.deliveryDocUrl}
                    onChange={(e) => updateStepDraft(sub.id, index, { deliveryDocUrl: e.target.value })}
                    disabled={!editable}
                    placeholder="阶段飞书文档"
                    className="min-w-0 flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600 disabled:bg-transparent"
                  />
                </div>
                <select
                  value={step.reminderFrequency}
                  onChange={(e) => updateStepDraft(sub.id, index, {
                    reminderFrequency: e.target.value,
                    reminderEnabled: e.target.value !== 'none',
                  })}
                  disabled={!editable}
                  className="rounded-md border border-white/10 bg-[#0c0f16] px-2 py-1.5 text-xs text-slate-200 outline-none disabled:border-transparent disabled:bg-transparent"
                >
                  {REMINDER_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                {editable ? (
                  <button onClick={() => removeStepDraft(sub.id, index)} aria-label="删除步骤" className="grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-red-500/10 hover:text-red-300">
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
        {editable ? (
          <button onClick={() => saveSteps(sub.id)} className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-[#0f1117] hover:bg-emerald-50">
            保存执行步骤
          </button>
        ) : null}
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Bell size={12} /> 飞书提醒会按这里的频率配置，待飞书消息权限开通后自动发送
        </p>
      </div>
    );
  }

  function renderAgentConfig(sub, editable) {
    const draft = agentDrafts[sub.id] || { schedule: [] };
    const apiKey = agentKeys[sub.id];
    const origin = window.location.origin;
    const guide = [
      'Agent 使用说明',
      `1. GET ${origin}/api/agent/subtask 读取任务包。`,
      `2. POST ${origin}/api/agent/subtask/progress 回写进度。`,
      '3. 日更规则：每天工作结束后，以天为单位回写今天完成了什么、遇到什么阻塞、明天推进什么；不要等到周会才更新。',
      '4. 请求头：Authorization: Bearer <API_KEY>。',
      '5. 回写示例：{"status":"进行中","weekIndex":1,"progressNote":"今天完成...；阻塞...；明天...","deliveryDocUrl":"https://xxx.feishu.cn/docx/..."}。',
    ].join('\n');

    return (
      <div className="space-y-3 rounded-md border border-emerald-400/20 bg-emerald-500/[0.06] p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-100"><KeyRound size={13} />Agent 工作包</p>
            <p className="mt-1 text-xs text-slate-500">给外部 Agent 自动读取任务、更新进度、提交飞书文档用。</p>
          </div>
          {editable ? (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => copyText(guide, 'Agent 说明书已复制')} className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1.5 text-xs text-slate-300 hover:bg-white/8">
                <BookOpen size={12} />复制说明书
              </button>
              <button onClick={() => regenerateAgentKey(sub.id)} className="inline-flex items-center gap-1 rounded-md bg-emerald-400 px-2 py-1.5 text-xs font-semibold text-[#08110f] hover:bg-emerald-300">
                <RefreshCw size={12} />生成/重置 Key
              </button>
            </div>
          ) : null}
        </div>

        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <div className="min-w-0 rounded-md border border-white/10 bg-[#0c0f16] px-3 py-2">
            <p className="text-[11px] text-slate-500">API Key</p>
            <p className="mt-1 truncate text-sm text-slate-300">{apiKey || sub.agent_api_key_prefix || '还没有生成'}</p>
          </div>
          {apiKey ? (
            <button onClick={() => copyText(apiKey, 'API Key 已复制')} className="inline-flex items-center justify-center gap-1 rounded-md border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/8">
              <Copy size={13} />复制 Key
            </button>
          ) : null}
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-slate-500">Agent 说明书</label>
          <textarea
            value={draft.agentInstructions || ''}
            onChange={(e) => updateAgentDraft(sub.id, { agentInstructions: e.target.value })}
            disabled={!editable}
            className="h-32 w-full resize-none rounded-md border border-white/10 bg-[#0c0f16] p-3 text-sm leading-6 text-slate-200 outline-none focus:border-emerald-300/60 disabled:border-transparent disabled:bg-[#0c0f16]/60"
          />
        </div>

        <div className="grid gap-2 md:grid-cols-[auto_1fr_auto] md:items-center">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={!!draft.feishuPushEnabled}
              onChange={(e) => updateAgentDraft(sub.id, { feishuPushEnabled: e.target.checked })}
              disabled={!editable}
              className="accent-emerald-400"
            />
            飞书 Push
          </label>
          <input
            value={draft.feishuChatId || ''}
            onChange={(e) => updateAgentDraft(sub.id, { feishuChatId: e.target.value })}
            disabled={!editable}
            placeholder="飞书群 chat_id"
            className="rounded-md border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-300/60 disabled:opacity-60"
          />
          {editable ? (
            <button onClick={() => testFeishuReminder(sub.id)} className="inline-flex items-center justify-center gap-1 rounded-md border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/8">
              <Bell size={13} />测试提醒
            </button>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400"><CalendarDays size={13} />周时间表</p>
            {editable ? (
              <button onClick={() => addScheduleDraft(sub.id)} className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/8">
                <Plus size={12} />加一周
              </button>
            ) : null}
          </div>
          {(draft.schedule || []).length === 0 ? (
            <p className="text-sm text-slate-500">还没有周计划</p>
          ) : (
            <div className="space-y-2">
              {(draft.schedule || []).map((item, index) => (
                <div key={item.id || index} className="grid gap-2 rounded-md border border-white/10 bg-[#0c0f16] p-2 md:grid-cols-[74px_1fr_88px_92px_100px_1fr_28px] md:items-center">
                  <input type="number" min="1" value={item.weekIndex} onChange={(e) => updateScheduleDraft(sub.id, index, { weekIndex: e.target.value })} disabled={!editable} className="rounded-md border border-white/10 bg-[#11141d] px-2 py-1.5 text-xs text-slate-200 outline-none disabled:border-transparent disabled:bg-transparent" />
                  <input value={item.goal} onChange={(e) => updateScheduleDraft(sub.id, index, { goal: e.target.value })} disabled={!editable} placeholder="这一周要完成什么" className="min-w-0 rounded-md border border-white/10 bg-[#11141d] px-2 py-1.5 text-xs text-slate-200 outline-none disabled:border-transparent disabled:bg-transparent" />
                  <select value={item.reminderDay} onChange={(e) => updateScheduleDraft(sub.id, index, { reminderDay: e.target.value })} disabled={!editable} className="rounded-md border border-white/10 bg-[#11141d] px-2 py-1.5 text-xs text-slate-200 outline-none disabled:border-transparent disabled:bg-transparent">
                    {WEEK_DAYS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <input type="time" value={item.reminderTime} onChange={(e) => updateScheduleDraft(sub.id, index, { reminderTime: e.target.value })} disabled={!editable} className="rounded-md border border-white/10 bg-[#11141d] px-2 py-1.5 text-xs text-slate-200 outline-none disabled:border-transparent disabled:bg-transparent" />
                  <select value={item.status} onChange={(e) => updateScheduleDraft(sub.id, index, { status: e.target.value })} disabled={!editable} className="rounded-md border border-white/10 bg-[#11141d] px-2 py-1.5 text-xs text-slate-200 outline-none disabled:border-transparent disabled:bg-transparent">
                    {SCHEDULE_STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                  <input value={item.deliveryDocUrl} onChange={(e) => updateScheduleDraft(sub.id, index, { deliveryDocUrl: e.target.value })} disabled={!editable} placeholder="阶段交付飞书文档" className="min-w-0 rounded-md border border-white/10 bg-[#11141d] px-2 py-1.5 text-xs text-slate-200 outline-none disabled:border-transparent disabled:bg-transparent" />
                  {editable ? (
                    <button onClick={() => removeScheduleDraft(sub.id, index)} aria-label="删除周计划" className="grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-red-500/10 hover:text-red-300">
                      <Trash2 size={13} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {editable ? (
          <button onClick={() => saveAgentConfig(sub.id)} className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-[#0f1117] hover:bg-emerald-50">
            保存 Agent 配置
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <div className="rounded-lg border border-white/10 bg-[#151925] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-medium text-violet-200">子PM工作台</p>
              <div className="mt-2 flex items-center gap-3">
                <h2 className="text-3xl font-semibold tracking-normal text-white">{task.title}</h2>
                <StatusPill status={task.status} />
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-400">{task.summary}</p>
            </div>
            <div className="flex shrink-0 items-start gap-3">
              {isReviewer ? (
                <button
                  onClick={handleDeleteCurrentTask}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200 transition hover:bg-red-500/20"
                >
                  <Trash2 size={15} /> 删除任务
                </button>
              ) : null}
              {owner ? <Avatar member={owner} size="xl" pm /> : null}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <InfoField label="子PM" value={owner?.name || '未认领'} />
            <InfoField label="交付方式" value="飞书文档" />
            <InfoField label="协作权限" value={canManage ? '管理自己这一块' : '查看进展'} />
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {renderPlanBlock('想法 Idea', task.idea_text, 'Agent 回传后，这里会沉淀核心想法。')}
            {renderPlanBlock('执行方案', task.execution_plan, '这里会沉淀阶段动作、验收标准和风险。')}
            {renderPlanBlock('资源配合', task.resource_plan, '这里会沉淀需要谁配合、需要什么资源和权限。')}
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-300">这块任务进度</span>
              <span className="text-sm text-white">{task.progress}%</span>
            </div>
            <input aria-label="任务进度" type="range" min="0" max="100" value={task.progress} onChange={(e) => handleProgress(e.target.value)} className="w-full accent-violet-500" disabled={!canManage || isLocked} />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {TASK_STATUSES.map((status) => (
              <button key={status} onClick={() => handleStatus(status)} disabled={!canManage || isLocked} className={`rounded-md px-3 py-2 text-sm transition ${task.status === status ? 'bg-white text-[#0f1117]' : 'border border-white/10 text-slate-300 hover:bg-white/8'} disabled:opacity-50`}>
                {status}
              </button>
            ))}
          </div>
        </div>

        {canManage && !isLocked ? (
          <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/[0.06] p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-100"><KeyRound size={15} />子PM Agent 包</p>
                <p className="mt-1 text-sm text-slate-500">把这块任务的 API Key 和需求文档发给你的 Agent。它只能拆解和更新你认领的这一块。</p>
                <p className="mt-2 text-xs text-slate-500">当前 Key：{taskAgentKey || task.agent_api_key_prefix || '还没有生成'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => copyText(taskAgentGuide(), '子PM Agent 说明书已复制')} className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1.5 text-xs text-slate-300 hover:bg-white/8">
                  <BookOpen size={12} />复制说明书
                </button>
                {taskAgentKey ? (
                  <button onClick={() => copyText(taskAgentKey, 'API Key 已复制')} className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1.5 text-xs text-slate-300 hover:bg-white/8">
                    <Copy size={12} />复制 Key
                  </button>
                ) : null}
                <button onClick={regenerateTaskAgentKey} className="inline-flex items-center gap-1 rounded-md bg-emerald-400 px-2 py-1.5 text-xs font-semibold text-[#08110f] hover:bg-emerald-300">
                  <RefreshCw size={12} />生成/重置 Key
                </button>
              </div>
            </div>
            <textarea
              value={taskAgentInstructions}
              onChange={(e) => setTaskAgentInstructions(e.target.value)}
              className="mt-3 h-28 w-full resize-none rounded-md border border-white/10 bg-[#0c0f16] p-3 text-sm leading-6 text-slate-200 outline-none focus:border-emerald-300/60"
            />
            <button onClick={saveTaskAgentDoc} className="mt-2 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-[#0f1117]">
              保存需求文档
            </button>
          </div>
        ) : null}

        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <PanelTitle icon={ClipboardList} title="子PM分配的子任务" />
          <p className="mt-2 text-sm text-slate-500">子PM只负责自己认领的这一块，可以把下面的执行子任务分配给项目组成员。</p>
          <div className="mt-4 space-y-3">
            {(task.subtasks || []).map((sub) => {
              const assignee = sub.assignee_name ? { name: sub.assignee_name, color: 'from-slate-500 to-slate-400' } : { name: '未分配', color: 'from-slate-500 to-slate-400' };
              const editable = sub.status !== '已提交' && sub.status !== '已完成' && task.status !== '已完成';
              const panelOpen = expanded[sub.id] || sub.status === '已提交' || sub.status === '已完成';
              return (
                <div key={sub.id} className="rounded-md border border-white/10 bg-[#11141d] p-3">
                  <div className="grid gap-3 md:grid-cols-[1fr_190px_150px_auto] md:items-center">
                    <div>
                      <p className="font-medium text-white">{sub.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{sub.note || ''}</p>
                    </div>
                    {canManage && !isLocked ? (
                      <select
                        value={sub.assignee_id || ''}
                        onChange={(e) => handleAssignSubtask(sub.id, e.target.value)}
                        className="rounded-md border border-white/10 bg-[#0c0f16] px-3 py-2 text-sm text-slate-200 outline-none"
                      >
                        <option value="">未分配</option>
                        {assignmentMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                      </select>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Avatar member={assignee} size="xs" />
                        <span className="text-sm text-slate-300">{assignee.name}</span>
                      </div>
                    )}
                    <select disabled={!canManage || isLocked} value={sub.status} onChange={(e) => handleSubtaskStatus(sub.id, e.target.value)} className="rounded-md border border-white/10 bg-[#0c0f16] px-3 py-2 text-sm text-slate-200 outline-none disabled:opacity-50">
                      {SUBTASK_STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <div className="flex items-center justify-end gap-2">
                      {editable ? (
                        <button onClick={() => toggleExpanded(sub.id)} className="rounded-md border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/20">提交</button>
                      ) : null}
                      {sub.status === '已提交' && isReviewer ? (
                        <button onClick={() => handleConfirmSubtask(sub.id)} className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-400">确认</button>
                      ) : null}
                    </div>
                  </div>

	                  {panelOpen ? (
	                    <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
                          {renderSteps(sub, canManage && editable)}
                          {renderAgentConfig(sub, canManage && editable)}
                          <div className="rounded-md border border-white/10 bg-[#0c0f16] p-3">
                            <div className="mb-3 flex items-center justify-between">
                              <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400"><MessageSquarePlus size={13} />子任务讨论</p>
                              <span className="text-[11px] text-slate-600">{(sub.comments || []).length} 条</span>
                            </div>
                            {renderCommentList(sub.comments || [])}
                            <div className="mt-3">{renderCommentComposer({ targetType: 'subtask', targetId: sub.id, compact: true })}</div>
                          </div>
	                      {sub.status === '已提交' || sub.status === '已完成' ? (
	                        <div className="space-y-2">
	                          {sub.submission_description ? (
	                            <p className="text-sm text-slate-300"><span className="text-slate-500">完成说明：</span>{sub.submission_description}</p>
	                          ) : null}
                            {sub.delivery_doc_url ? (
                              <a href={sub.delivery_doc_url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-500/15">
                                <Link2 size={15} />
                                <span className="truncate">打开飞书交付文档</span>
                              </a>
                            ) : null}
                            {renderSubFiles(sub, false)}
	                          {sub.status === '已提交' ? (
	                            <p className="text-xs text-amber-200">已提交{sub.submitted_by_name ? `（${sub.submitted_by_name}）` : ''}，等待项目PM确认</p>
	                          ) : null}
	                        </div>
	                      ) : (
	                        <div className="space-y-3">
                            <div>
                              <label className="mb-1.5 block text-xs text-slate-500">飞书交付文档</label>
                              <div className="flex items-center gap-2 rounded-md border border-white/10 bg-[#0c0f16] px-3 py-2 focus-within:border-violet-400/60">
                                <Link2 size={15} className="shrink-0 text-slate-500" />
                                <input
                                  value={docDrafts[sub.id] || ''}
                                  onChange={(e) => setDocDrafts((d) => ({ ...d, [sub.id]: e.target.value }))}
                                  placeholder="https://xxx.feishu.cn/docx/xxxx"
                                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
                                />
                              </div>
                            </div>
	                          <textarea
	                            value={drafts[sub.id] || ''}
	                            onChange={(e) => setDrafts((d) => ({ ...d, [sub.id]: e.target.value }))}
	                            placeholder="填写任务完成描述（可选）..."
	                            className="h-20 w-full resize-none rounded-md border border-white/10 bg-[#0c0f16] p-3 text-sm text-slate-200 outline-none focus:border-violet-400/60"
	                          />
	                          <button onClick={() => handleSubmitSubtask(sub.id)} disabled={!docDrafts[sub.id]?.trim()} className="inline-flex items-center gap-2 rounded-md bg-violet-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50">
	                            <Send size={15} />确认提交
	                          </button>
	                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {(!task.subtasks || task.subtasks.length === 0) && <p className="text-sm text-slate-500">暂无子任务</p>}
          </div>

          {canManage && !isLocked && (
            <div className="mt-4 grid gap-2 md:grid-cols-[1fr_180px_1fr_auto]">
              <input value={newSubtask.title} onChange={(e) => setNewSubtask({ ...newSubtask, title: e.target.value })} placeholder="新增子任务" className="rounded-md border border-white/10 bg-[#0c0f16] px-3 py-2 text-sm text-slate-200 outline-none focus:border-violet-400/60" />
              <select value={newSubtask.assigneeId || ''} onChange={(e) => setNewSubtask({ ...newSubtask, assigneeId: e.target.value })} className="rounded-md border border-white/10 bg-[#0c0f16] px-3 py-2 text-sm text-slate-200 outline-none focus:border-violet-400/60">
                <option value="">先不分配</option>
                {assignmentMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
              <input value={newSubtask.note || ''} onChange={(e) => setNewSubtask({ ...newSubtask, note: e.target.value })} placeholder="给执行人的备注" className="rounded-md border border-white/10 bg-[#0c0f16] px-3 py-2 text-sm text-slate-200 outline-none focus:border-violet-400/60" />
              <button onClick={handleAddSubtask} className="inline-flex items-center gap-2 rounded-md bg-violet-500 px-3 py-2 text-sm font-semibold text-white"><Plus size={15} />添加</button>
            </div>
          )}
        </div>

        {/* Submission module */}
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between">
            <PanelTitle icon={PackageCheck} title="这块任务提交" />
            <StatusPill status={task.status} />
          </div>

          <div className="mt-4 space-y-4">
            {task.status === '已完成' ? (
              <div className="rounded-md border border-emerald-400/30 bg-emerald-500/10 p-4">
                <p className="text-sm text-emerald-200">该任务已完成，交付物已通过项目PM审核。</p>
                {renderFiles()}
              </div>
            ) : null}

            {isReviewer && task.status === '审核中' ? (
              <div className="rounded-md border border-amber-400/30 bg-amber-500/10 p-4">
                <p className="mb-3 text-sm text-amber-200">任务已提交，等待你审核：</p>
                {renderFiles()}
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="填写审核意见（可选），如驳回原因..."
                  className="mt-3 h-20 w-full resize-none rounded-md border border-white/10 bg-[#0c0f16] p-3 text-sm text-slate-200 outline-none focus:border-violet-400/60"
                />
                <div className="mt-2 flex gap-2">
                  <button onClick={() => handleReview(true)} className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400">通过</button>
                  <button onClick={() => handleReview(false)} className="rounded-md border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/20">驳回</button>
                </div>
              </div>
            ) : null}

            {canManage && task.status === '审核中' && !isReviewer ? (
              <div className="rounded-md border border-white/10 bg-[#11141d] p-4">
                <p className="text-sm text-amber-200">已提交，等待项目PM审核（审核期间不可修改）。</p>
                {renderFiles()}
              </div>
            ) : null}

            {canManage && !isLocked ? (
              <div className="space-y-4">
                {renderFiles()}
                <div>
                  <label className="mb-1 block text-xs text-slate-500">上传交付文件（图片、文档等，单个不超过20MB）</label>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/8">
                    <UploadCloud size={15} />
                    {uploading ? '上传中...' : '选择文件'}
                    <input type="file" multiple className="hidden" onChange={handleUploadFile} disabled={uploading} />
                  </label>
                  {uploading && <Loader2 size={16} className="ml-2 inline animate-spin text-slate-400" />}
                </div>
                <button
                  onClick={handleSubmitTask}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />}
                  提交审核
                </button>
              </div>
            ) : null}

            {!canManage && !isReviewer && task.status !== '已完成' ? (
              <p className="text-sm text-slate-500">任务负责人提交交付物后，将由项目PM审核。</p>
            ) : null}
          </div>
        </div>
      </div>

      <aside className="space-y-5">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between">
            <PanelTitle icon={MessageSquarePlus} title="讨论" />
            <span className="rounded-md bg-white/[0.04] px-2 py-1 text-xs text-slate-500">{(task.comments || []).length} 条</span>
          </div>
          <div className="mt-4">
            {renderCommentList(task.comments || [], { adoptable: true })}
            {renderCommentComposer()}
          </div>
        </div>
      </aside>
    </section>
  );
}
