import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { get, post } from '../../lib/api';
import { useStore } from '../../store';
import { Avatar } from '../../components/ui/Avatar';
import { PanelTitle } from '../../components/ui/PanelTitle';
import {
  Sparkles, Users, CalendarDays, Check, Loader2,
  FileText, Plus, Trash2, Layers, PenLine, Download, ExternalLink,
} from 'lucide-react';

const defaultPlan = `# 项目计划书

## 目标
描述项目的核心目标与愿景

## 关键指标
- 指标1
- 指标2
- 指标3

## 协作原则
PM拆解任务→成员自主认领→认领人自动成为该任务的子PM，可在任务组内调动其他成员协作。`;

export function ProjectCreate() {
  const { currentTeamId, setActiveProjectId, currentUser } = useStore();
  const [templates, setTemplates] = useState([]);
  const [allTeamMembers, setAllTeamMembers] = useState([]);
  const [form, setForm] = useState({
    name: '',
    description: '',
    duration: '4周',
    teamSize: '',
    planMarkdown: defaultPlan,
    templateId: '__ai__',
    publishNow: true,
    selectedMembers: [],
    timeline: [
      ['W1', ''],
      ['W2', ''],
      ['W3', ''],
      ['W4', ''],
    ],
  });

  const [creating, setCreating] = useState(false);
  const [feishuUrl, setFeishuUrl] = useState('');
  const [importingDoc, setImportingDoc] = useState(false);
  const [feishuHint, setFeishuHint] = useState('');
  const feishuBound = !!currentUser?.feishuBound;
  const navigate = useNavigate();

  useEffect(() => {
    if (!currentTeamId) return;
    get('/api/templates').then((r) => setTemplates(r.data || []));
    get(`/api/teams/${currentTeamId}`).then((r) => {
      if (r.ok) {
        const members = r.data.members || [];
        setAllTeamMembers(members);
        setForm((f) => ({
          ...f,
          teamSize: String(members.length),
          selectedMembers: members.map((m) => m.id),
        }));
      }
    });
  }, [currentTeamId]);

  function toggleMember(userId) {
    setForm((f) => {
      const selectedMembers = f.selectedMembers.includes(userId)
        ? f.selectedMembers.filter((id) => id !== userId)
        : [...f.selectedMembers, userId];
      return { ...f, selectedMembers, teamSize: String(selectedMembers.length) };
    });
  }

  function updateTimeline(index, field, value) {
    setForm((f) => {
      const t = [...f.timeline];
      t[index] = field === 'time' ? [value, t[index][1]] : [t[index][0], value];
      return { ...f, timeline: t };
    });
  }

  function addTimelineItem() {
    setForm((f) => ({ ...f, timeline: [...f.timeline, ['', '']] }));
  }

  function removeTimelineItem(index) {
    setForm((f) => ({ ...f, timeline: f.timeline.filter((_, i) => i !== index) }));
  }

  async function handleCreate() {
    if (!form.name.trim()) return;
    setCreating(true);

    try {
      const timelineJson = form.timeline.filter(([t]) => t.trim());

      const res = await post('/api/projects', {
        teamId: currentTeamId,
        name: form.name,
        description: form.description,
        planMarkdown: form.planMarkdown,
        timelineJson,
        memberIds: form.selectedMembers,
      });

      if (!res.ok || !res.data) {
        toast.error(res.error || '创建项目失败');
        setCreating(false);
        return;
      }

      const project = res.data;

      if (form.templateId === '__ai__') {
        const ai = await post(`/api/projects/${project.id}/tasks/ai-split`, {});
        if (!ai.ok) {
          toast.error(ai.error || 'AI 拆分失败');
          setCreating(false);
          return;
        }
        if (form.publishNow) {
          await post(`/api/projects/${project.id}/tasks/publish`);
        }
      } else if (form.templateId && form.templateId !== 'template-blank-001') {
        await post(`/api/projects/${project.id}/tasks/split`, { templateId: form.templateId });
        if (form.publishNow) {
          await post(`/api/projects/${project.id}/tasks/publish`);
        }
      }

      toast.success('项目已创建，任务池已生成');
      setActiveProjectId(project.id);
      setCreating(false);
      navigate(`/projects/${project.id}/pool`);
    } catch (err) {
      toast.error('创建项目失败，请检查后端服务是否运行');
    } finally {
      setCreating(false);
    }
  }

  async function handleImportDoc() {
    const url = feishuUrl.trim();
    if (!url || importingDoc) return;
    setImportingDoc(true);
    setFeishuHint('');
    try {
      const res = await post('/api/feishu/docs/import', { url });
      if (!res.ok) {
        setFeishuHint(res.error || '导入失败');
        // Defer so the toast commits after the hint paragraph renders
        setTimeout(() => toast.error(res.error || '导入失败'), 0);
        return;
      }
      const doc = res.data;
      if (!doc?.content || !doc.content.trim()) {
        setFeishuHint('文档内容为空，未能导入计划书');
        setTimeout(() => toast.error('文档内容为空，未能导入计划书'), 0);
        return;
      }
      setForm((f) => ({ ...f, planMarkdown: doc.content }));
      setFeishuUrl('');
      // Defer so the toast commits after the (possibly large) textarea update
      setTimeout(() => toast.success(`已导入「${doc.title}」到项目计划书`), 0);
    } catch {
      setFeishuHint('导入失败，请确认后端已启动');
      setTimeout(() => toast.error('导入失败，请确认后端已启动'), 0);
    } finally {
      setImportingDoc(false);
    }
  }

  const selectedMemberObjects = allTeamMembers.filter((m) => form.selectedMembers.includes(m.id));

  return (
    <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      {/* Left: Project Form */}
      <div className="space-y-5">
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/20">
          <div className="flex items-center gap-2 text-violet-200">
            <Sparkles size={18} />
            <span className="text-sm font-medium">Step 1 · 项目发起</span>
          </div>

          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="输入项目名称"
            className="mt-4 w-full bg-transparent text-3xl font-semibold tracking-normal text-white outline-none placeholder:text-slate-600"
          />
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="一句话描述这个项目要做什么..."
            className="mt-2 w-full max-w-2xl bg-transparent text-sm leading-6 text-slate-400 outline-none placeholder:text-slate-600"
          />

          {/* Config fields */}
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-white/10 bg-[#11141d] p-3">
              <label className="text-xs text-slate-500">运行周期</label>
              <input
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                className="mt-1 w-full bg-transparent text-sm text-slate-200 outline-none"
              />
            </div>
            <div className="rounded-md border border-white/10 bg-[#11141d] p-3">
              <label className="text-xs text-slate-500">团队规模</label>
              <input
                value={form.teamSize}
                onChange={(e) => setForm({ ...form, teamSize: e.target.value })}
                className="mt-1 w-full bg-transparent text-sm text-slate-200 outline-none"
              />
            </div>
          </div>

          {/* Split mode + publish toggle */}
          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium text-slate-300">任务拆解方式</label>
            <div className="grid gap-2 md:grid-cols-3">
              <button
                type="button"
                onClick={() => setForm({ ...form, templateId: '__ai__' })}
                className={`rounded-md border p-3 text-left transition ${
                  form.templateId === '__ai__'
                    ? 'border-violet-400/60 bg-violet-500/15'
                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-white">
                  <Sparkles size={15} className="text-violet-300" /> AI 智能拆分
                </span>
                <span className="mt-1 block text-xs text-slate-500">根据项目计划书自动拆解任务</span>
              </button>
              <button
                type="button"
                onClick={() => setForm({
                  ...form,
                  templateId: (templates.find((t) => t.id !== 'template-blank-001') || {}).id || 'template-hackathon-001',
                })}
                className={`rounded-md border p-3 text-left transition ${
                  form.templateId !== '__ai__' && form.templateId !== 'template-blank-001'
                    ? 'border-violet-400/60 bg-violet-500/15'
                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-white">
                  <Layers size={15} className="text-violet-300" /> 模板拆解
                </span>
                <span className="mt-1 block text-xs text-slate-500">从预设模板生成任务</span>
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, templateId: 'template-blank-001' })}
                className={`rounded-md border p-3 text-left transition ${
                  form.templateId === 'template-blank-001'
                    ? 'border-violet-400/60 bg-violet-500/15'
                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-white">
                  <PenLine size={15} className="text-violet-300" /> 空白模板
                </span>
                <span className="mt-1 block text-xs text-slate-500">手动创建任务</span>
              </button>
            </div>

            {form.templateId !== '__ai__' && form.templateId !== 'template-blank-001' && (
              <div className="mt-3">
                <label className="mb-2 block text-sm font-medium text-slate-300">选择模板</label>
                <select
                  value={form.templateId}
                  onChange={(e) => setForm({ ...form, templateId: e.target.value })}
                  className="w-full rounded-md border border-white/10 bg-[#0c0f16] px-3 py-2 text-sm text-slate-200 outline-none focus:border-violet-400/60"
                >
                  {templates.filter((t) => t.id !== 'template-blank-001').map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            <label className="mt-3 flex items-center gap-2 text-sm text-slate-400">
              <input
                type="checkbox"
                checked={form.publishNow}
                onChange={(e) => setForm({ ...form, publishNow: e.target.checked })}
                className="accent-violet-500"
              />
              创建后立即发布到任务池
            </label>
          </div>
        </div>

        {/* Feishu doc import */}
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <ExternalLink size={16} className="text-violet-300" />
              关联飞书文档
            </label>
            {feishuBound ? (
              <span className="text-xs text-emerald-300/80">已授权飞书</span>
            ) : (
              <button
                onClick={() => { window.location.href = '/api/auth/login'; }}
                className="text-xs text-violet-300 transition hover:underline"
              >
                去飞书授权登录 →
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            粘贴飞书文档链接，内容会导入项目计划书，随后 AI 智能拆分直接基于它拆解任务
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={feishuUrl}
              onChange={(e) => setFeishuUrl(e.target.value)}
              placeholder="https://xxx.feishu.cn/docx/xxxx"
              className="flex-1 rounded-md border border-white/10 bg-[#0c0f16] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-violet-400/60"
            />
            <button
              onClick={handleImportDoc}
              disabled={importingDoc || !feishuUrl.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-violet-500/20 px-3 py-2 text-sm font-medium text-violet-200 transition hover:bg-violet-500/30 disabled:opacity-60"
            >
              <Loader2 size={14} className={importingDoc ? 'animate-spin' : 'hidden'} />
              <Download size={14} className={importingDoc ? 'hidden' : ''} />
              导入文档
            </button>
          </div>
          {feishuHint && (
            <p className="mt-2 text-xs text-amber-300/90">{feishuHint}</p>
          )}
        </div>

        {/* Project Plan Editor */}
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
          <div className="flex items-center justify-between mb-4">
            <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <FileText size={16} className="text-violet-300" />
              项目计划书 Markdown
            </label>
          </div>
          <textarea
            value={form.planMarkdown}
            onChange={(e) => setForm({ ...form, planMarkdown: e.target.value })}
            className="h-80 w-full resize-none rounded-md border border-white/10 bg-[#0c0f16] p-4 font-mono text-sm leading-6 text-slate-300 outline-none transition focus:border-violet-400/60"
          />
        </div>

        {/* Action */}
        <button
          onClick={handleCreate}
          disabled={creating || !form.name.trim()}
          className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#0f1117] transition hover:bg-violet-100 disabled:opacity-70"
        >
          <Check size={16} className={creating ? 'hidden' : ''} />
          <Loader2 size={16} className={creating ? 'animate-spin' : 'hidden'} />
          {creating ? (form.templateId === '__ai__' ? 'AI 正在拆解任务池...' : '正在发起并拆分任务池...') : '发起项目，生成公共任务池'}
        </button>
      </div>

      {/* Right: Members + Timeline */}
      <div className="space-y-5">
        {/* Project Members — selectable */}
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <PanelTitle icon={Users} title="项目成员（点击选择）" />
          <p className="mt-1 text-xs text-slate-500">已选 {form.selectedMembers.length} / {allTeamMembers.length} 人</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {allTeamMembers.length === 0 ? (
              <p className="text-sm text-slate-500">暂无成员</p>
            ) : (
              allTeamMembers.map((member) => {
                const selected = form.selectedMembers.includes(member.id);
                return (
                  <button
                    key={member.id}
                    onClick={() => toggleMember(member.id)}
                    className={`flex items-center gap-3 rounded-md border p-3 text-left transition ${
                      selected
                        ? 'border-violet-400/60 bg-violet-500/15'
                        : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                    }`}
                  >
                    <Avatar member={{ name: member.name, color: 'from-violet-500 to-fuchsia-500' }} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium text-white truncate">{member.name}</p>
                      <p className="text-xs text-slate-500 truncate">{member.role || '成员'}</p>
                    </div>
                    <Check
                      size={16}
                      className={`ml-auto shrink-0 text-violet-300 ${selected ? '' : 'hidden'}`}
                    />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Editable Timeline */}
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <PanelTitle icon={CalendarDays} title="项目时间线" />
          <div className="mt-4 space-y-2">
            {form.timeline.map(([time, detail], i) => (
              <div key={i} className="grid grid-cols-[100px_1fr_32px] gap-2">
                <input
                  value={time}
                  onChange={(e) => updateTimeline(i, 'time', e.target.value)}
                  placeholder={`W${i + 1}`}
                  className="rounded-md border border-white/10 bg-[#0c0f16] px-2 py-1.5 text-xs text-violet-200 outline-none focus:border-violet-400/60"
                />
                <input
                  value={detail}
                  onChange={(e) => updateTimeline(i, 'detail', e.target.value)}
                  placeholder="描述这个阶段要完成什么..."
                  className="rounded-md border border-white/10 bg-[#0c0f16] px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-violet-400/60"
                />
                <button
                  onClick={() => removeTimelineItem(i)}
                  className="grid h-8 w-8 place-items-center rounded-md border border-white/10 text-slate-500 hover:bg-white/8"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addTimelineItem}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:bg-white/8"
          >
            <Plus size={13} /> 添加节点
          </button>
        </div>
      </div>
    </section>
  );
}
