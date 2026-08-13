import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { get, post, put, del, uploadFile } from '../../lib/api';
import { useStore } from '../../store';
import { Avatar } from '../../components/ui/Avatar';
import { StatusPill } from '../../components/ui/StatusPill';
import { PanelTitle } from '../../components/ui/PanelTitle';
import { InfoField } from '../../components/ui/InfoField';
import { EmptyState } from '../../components/ui/EmptyState';
import { FeedList } from '../../components/ui/FeedList';
import { Bell, ClipboardList, Link2, MessageSquarePlus, Plus, Send, Loader2, AlertTriangle, UploadCloud, X, Paperclip, PackageCheck, Trash2 } from 'lucide-react';

const TASK_STATUSES = ['待开始', '进行中'];
const SUBTASK_STATUSES = ['待开始', '进行中', '已提交', '已完成'];
const STEP_STATUSES = ['待开始', '进行中', '已完成'];
const REMINDER_OPTIONS = [
  ['none', '不提醒'],
  ['daily', '每天提醒'],
  ['workday', '工作日提醒'],
  ['weekly', '每周提醒'],
];

export function Subproject() {
  const { projectId, taskId } = useParams();
  const { currentUser } = useStore();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newSubtask, setNewSubtask] = useState({ title: '' });
  const [newUpdate, setNewUpdate] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [drafts, setDrafts] = useState({});
  const [docDrafts, setDocDrafts] = useState({});
  const [stepDrafts, setStepDrafts] = useState({});

  useEffect(() => { loadTask(); }, [taskId]);

  useEffect(() => {
    if (!task?.subtasks) return;
    const nextSteps = {};
    const nextDocs = {};
    for (const sub of task.subtasks) {
      nextSteps[sub.id] = (sub.steps || []).map((step) => ({
        id: step.id,
        title: step.title || '',
        status: step.status || '待开始',
        dueText: step.due_text || '',
        reminderFrequency: step.reminder_frequency || 'none',
        reminderEnabled: !!step.reminder_enabled,
        sortOrder: step.sort_order ?? 0,
      }));
      nextDocs[sub.id] = sub.delivery_doc_url || '';
    }
    setStepDrafts(nextSteps);
    setDocDrafts(nextDocs);
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
    await post(`/api/projects/${projectId}/tasks/${taskId}/subtasks`, { title: newSubtask.title });
    setNewSubtask({ title: '' });
    loadTask();
  }

  async function handleSubtaskStatus(subtaskId, status) {
    const subtasks = task.subtasks.map((s) => (s.id === subtaskId ? { ...s, status } : s));
    await put(`/api/projects/${projectId}/tasks/${taskId}/subtasks`, { subtasks });
    loadTask();
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
        { title: '', status: '待开始', dueText: '', reminderFrequency: 'none', reminderEnabled: false },
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

  async function handleConfirmSubtask(subtaskId) {
    const res = await post(`/api/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}/confirm`, {});
    if (res.ok) toast.success('已确认，子任务完成');
    else toast.error(res.error || '确认失败');
    loadTask();
  }

  async function handlePublishUpdate() {
    if (!newUpdate.trim()) return;
    await post(`/api/projects/${projectId}/tasks/${taskId}/updates`, { content: newUpdate });
    setNewUpdate('');
    loadTask();
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
  const canManage = task.owner_id === currentUser?.id;
  const isReviewer = task.isProjectPM;
  const isLocked = task.status === '审核中' || task.status === '已完成';

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
              <div key={step.id || index} className="grid gap-2 rounded-md border border-white/10 bg-[#11141d] p-2 md:grid-cols-[1fr_104px_112px_126px_28px] md:items-center">
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

  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <div className="rounded-lg border border-white/10 bg-[#151925] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-medium text-violet-200">Step 3 · 子项目管理</p>
              <div className="mt-2 flex items-center gap-3">
                <h2 className="text-3xl font-semibold tracking-normal text-white">{task.title}</h2>
                <StatusPill status={task.status} />
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">{task.summary}</p>
            </div>
            {owner ? <Avatar member={owner} size="xl" pm /> : null}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <InfoField label="子PM" value={owner?.name || '未认领'} />
            <InfoField label="交付方式" value="飞书文档" />
            <InfoField label="协作权限" value={canManage ? '可管理' : '仅查看'} />
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-300">任务进度</span>
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

        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <PanelTitle icon={ClipboardList} title="子任务" />
          <div className="mt-4 space-y-3">
            {(task.subtasks || []).map((sub) => {
              const assignee = sub.assignee_name ? { name: sub.assignee_name, color: 'from-slate-500 to-slate-400' } : { name: '未分配', color: 'from-slate-500 to-slate-400' };
              const editable = sub.status !== '已提交' && sub.status !== '已完成' && task.status !== '已完成';
              const panelOpen = expanded[sub.id] || sub.status === '已提交' || sub.status === '已完成';
              return (
                <div key={sub.id} className="rounded-md border border-white/10 bg-[#11141d] p-3">
                  <div className="grid gap-3 md:grid-cols-[1fr_150px_150px_auto] md:items-center">
                    <div>
                      <p className="font-medium text-white">{sub.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{sub.note || ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Avatar member={assignee} size="xs" />
                      <span className="text-sm text-slate-300">{assignee.name}</span>
                    </div>
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
            <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
              <input value={newSubtask.title} onChange={(e) => setNewSubtask({ ...newSubtask, title: e.target.value })} placeholder="新增子任务" className="rounded-md border border-white/10 bg-[#0c0f16] px-3 py-2 text-sm text-slate-200 outline-none focus:border-violet-400/60" />
              <button onClick={handleAddSubtask} className="inline-flex items-center gap-2 rounded-md bg-violet-500 px-3 py-2 text-sm font-semibold text-white"><Plus size={15} />添加</button>
            </div>
          )}
        </div>

        {/* Submission module */}
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between">
            <PanelTitle icon={PackageCheck} title="项目提交" />
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
          <PanelTitle icon={MessageSquarePlus} title="进度更新" />
          <textarea value={newUpdate} onChange={(e) => setNewUpdate(e.target.value)} placeholder="发布一条更新..." className="mt-4 h-24 w-full resize-none rounded-md border border-white/10 bg-[#0c0f16] p-3 text-sm text-slate-200 outline-none" />
          <button onClick={handlePublishUpdate} className="mt-3 inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-[#0f1117]"><Send size={15} />发布</button>
          <FeedList updates={(task.updates || []).map((u) => typeof u === 'string' ? u : `${u.user_name}: ${u.content}`)} />
        </div>
      </aside>
    </section>
  );
}
