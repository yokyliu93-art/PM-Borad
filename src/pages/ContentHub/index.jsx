import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { BookOpenText, CalendarDays, FilePlus2, FlaskConical, MessageSquareText, Sparkles, ThumbsUp, UserCheck, Vote } from 'lucide-react';
import { get, post, del } from '../../lib/api';
import { useStore } from '../../store';
import { Avatar } from '../../components/ui/Avatar';
import { EmptyState } from '../../components/ui/EmptyState';

const tabs = [
  { key: 'all', label: '全部', icon: Sparkles },
  { key: 'memo', label: 'Memo', icon: MessageSquareText },
  { key: 'demo', label: 'Demo', icon: FlaskConical },
  { key: 'meeting', label: '每周例会', icon: CalendarDays },
  { key: 'topic', label: '选题', icon: BookOpenText },
];

const kindLabels = {
  memo: 'Memo',
  demo: 'Demo',
  eval: 'Eval',
  meeting: '例会',
  topic: '选题',
};

export function ContentHub({ mode = 'all', initialTopicType = 'daily' }) {
  const { projectId } = useParams();
  const { currentTeamId } = useStore();
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || '');
  const [activeTab, setActiveTab] = useState(mode === 'topics' ? 'topic' : mode === 'demo' ? 'demo' : mode === 'eval' ? 'eval' : 'all');
  const [topicType, setTopicType] = useState(initialTopicType);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({ kind: mode === 'topics' ? 'topic' : mode === 'demo' ? 'demo' : mode === 'eval' ? 'eval' : 'memo', subKind: mode === 'topics' ? 'daily' : '', title: '', body: '', sourceUrl: '', timelineText: '', ownerText: '', progress: 0, meetingDocUrl: '', meetingMinutesUrl: '' });
  const [minutes, setMinutes] = useState({ title: '', meetingDocUrl: '', meetingMinutesUrl: '', transcript: '' });
  const [experienceDrafts, setExperienceDrafts] = useState({});
  const isGlobal = !projectId;
  const isTopics = mode === 'topics';
  const isDemo = mode === 'demo';
  const isEval = mode === 'eval';

  useEffect(() => {
    if (currentTeamId) loadProjects();
  }, [currentTeamId]);

  useEffect(() => {
    loadItems();
  }, [projectId, currentTeamId, mode, topicType]);

  useEffect(() => {
    setTopicType(initialTopicType);
  }, [initialTopicType]);

  useEffect(() => {
    if (!selectedProjectId && projects[0]?.id) setSelectedProjectId(projects[0].id);
  }, [projects, selectedProjectId]);

  async function loadProjects() {
    const res = await get(`/api/projects?teamId=${currentTeamId}`);
    if (res.ok) setProjects(res.data || []);
  }

  async function loadItems() {
    if (isGlobal && !currentTeamId) return;
    setLoading(true);
    const params = new URLSearchParams();
    let path = `/api/projects/${projectId}/content`;
    if (isGlobal) {
      params.set('teamId', currentTeamId);
      if (isTopics) {
        params.set('kind', 'topic');
        params.set('subKind', topicType);
      } else if (isDemo) {
        params.set('kind', 'demo');
      } else if (isEval) {
        params.set('kind', 'eval');
      }
      path = `/api/content?${params.toString()}`;
    }
    const res = await get(path);
    if (res.ok) setItems(res.data || []);
    setLoading(false);
  }

  const filteredItems = useMemo(() => (
    isGlobal ? items : activeTab === 'all' ? items : items.filter((item) => item.kind === activeTab)
  ), [items, activeTab, isGlobal]);

  const stats = useMemo(() => ({
    memos: items.length,
    demoReady: items.filter((item) => item.demo_ready).length,
    topics: items.filter((item) => item.kind === 'topic').length,
    experiences: items.reduce((sum, item) => sum + Number(item.experience_count || 0), 0),
  }), [items]);

  async function createMemo(event) {
    event.preventDefault();
    const targetProjectId = projectId || selectedProjectId;
    if (!targetProjectId) {
      toast.error('请先在 Build 里创建一个项目，用来承载这些 memo');
      return;
    }
    setCreating(true);
    const res = await post(`/api/projects/${targetProjectId}/content`, form);
    setCreating(false);
    if (res.ok) {
      toast.success('已放进内容池');
      setForm({ kind: form.kind, subKind: form.subKind || '', title: '', body: '', sourceUrl: '', timelineText: '', ownerText: '', progress: 0, meetingDocUrl: '', meetingMinutesUrl: '' });
      loadItems();
    } else {
      toast.error(res.error || '创建失败');
    }
  }

  async function importMinutes(event) {
    event.preventDefault();
    const targetProjectId = projectId || selectedProjectId;
    if (!targetProjectId) {
      toast.error('请先在 Build 里创建一个项目，用来承载例会记录');
      return;
    }
    setImporting(true);
    const res = await post(`/api/projects/${targetProjectId}/content/import-minutes`, minutes);
    setImporting(false);
    if (res.ok) {
      toast.success(`已导入例会，并生成 ${res.data?.topics?.length || 0} 条候选选题`);
      setMinutes({ title: '', meetingDocUrl: '', meetingMinutesUrl: '', transcript: '' });
      loadItems();
    } else {
      toast.error(res.error || '导入失败');
    }
  }

  async function toggleVote(item) {
    const targetProjectId = item.project_id || projectId;
    const res = item.my_vote
      ? await del(`/api/projects/${targetProjectId}/content/${item.id}/vote-demo`)
      : await post(`/api/projects/${targetProjectId}/content/${item.id}/vote-demo`, {});
    if (res.ok) {
      setItems((current) => current.map((memo) => (memo.id === item.id ? res.data : memo)));
    } else {
      toast.error(res.error || '投票失败');
    }
  }

  async function addExperience(item) {
    const content = experienceDrafts[item.id] || '';
    const targetProjectId = item.project_id || projectId;
    const res = await post(`/api/projects/${targetProjectId}/content/${item.id}/experiences`, { content });
    if (res.ok) {
      setItems((current) => current.map((memo) => (memo.id === item.id ? res.data : memo)));
      setExperienceDrafts((drafts) => ({ ...drafts, [item.id]: '' }));
      toast.success('试用体验已记录');
    } else {
      toast.error(res.error || '提交失败');
    }
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="rounded-xl border border-emerald-100 bg-white p-5 shadow-sm shadow-emerald-950/5">
          <p className="text-sm font-medium text-emerald-700">{isTopics ? '硅星人选题' : isDemo ? '硅星人 Demo 模块' : isEval ? '硅星人 Eval' : '硅星人内容池'}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">{isTopics ? '从周会进入选题推进' : isDemo ? '从 memo 到 Demo 决策' : isEval ? '测试集和评测进度' : '把零散 memo 变成可协作的板块'}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            {isTopics ? '把周会文档和周会妙记放进来，拆成日常选题和深度选题。日常选题看负责人和执行进度；深度选题按更长 timeline 协作推进。' : isDemo ? '这里都是大家扔上来的 Demo memo。试用后写体验，半数通过就进入 Demo。' : isEval ? '把测试集以飞书链接的方式放进来，记录负责人、评测进度和当前说明，部门大盘会同步显示 Eval 进度。' : 'Demo、每周例会和选题先放在这里。大家写试用体验、投 Demo 票，够半数通过后就可以进入 Demo 或沉淀成项目任务。'}
          </p>
          {isTopics ? (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800">
              <UserCheck size={15} />选题总负责人：王兆洋
            </div>
          ) : null}
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Stat label="池内 memo" value={stats.memos} />
            <Stat label="可 Demo" value={stats.demoReady} />
            <Stat label="选题" value={stats.topics} />
            <Stat label="试用体验" value={stats.experiences} />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-950"><FilePlus2 size={16} />{isTopics ? '新增一个选题' : isEval ? '新增测试集' : '扔一个 memo 进来'}</p>
          <form onSubmit={createMemo} className="mt-4 space-y-3">
            {isGlobal ? (
              <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400">
                <option value="">选择归属 Build 项目...</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            ) : null}
            {!isTopics && !isDemo && !isEval ? (
              <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400">
                <option value="memo">普通 Memo</option>
                <option value="demo">Demo 候选</option>
                <option value="eval">Eval 测试集</option>
                <option value="meeting">每周例会</option>
                <option value="topic">选题</option>
              </select>
            ) : null}
            {isTopics || form.kind === 'topic' ? (
              <select value={form.subKind || 'daily'} onChange={(event) => setForm({ ...form, subKind: event.target.value })} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400">
                <option value="daily">日常选题</option>
                <option value="deep">深度选题</option>
              </select>
            ) : null}
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={isEval ? '测试集名称' : '标题'} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            <textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder={isEval ? '测试目标、覆盖范围、评测说明或当前状态' : '内容、背景、试用发现或会议摘要'} rows={4} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            {isTopics || isEval ? (
              <div className="grid gap-2 md:grid-cols-2">
                <input value={form.ownerText} onChange={(event) => setForm({ ...form, ownerText: event.target.value })} placeholder={isEval ? '负责人，比如 评测负责人 / 待分配' : '负责人，比如 王兆洋 / 待分配'} className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
                <input type="number" min="0" max="100" value={form.progress} onChange={(event) => setForm({ ...form, progress: event.target.value })} placeholder="进度 %" className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
              </div>
            ) : null}
            <input value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} placeholder={isEval ? '测试集飞书链接' : '飞书文档或资料链接'} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            {isTopics ? (
              <div className="grid gap-2 md:grid-cols-2">
                <input value={form.meetingDocUrl} onChange={(event) => setForm({ ...form, meetingDocUrl: event.target.value })} placeholder="来源周会文档链接" className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
                <input value={form.meetingMinutesUrl} onChange={(event) => setForm({ ...form, meetingMinutesUrl: event.target.value })} placeholder="来源周会妙记链接" className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
              </div>
            ) : null}
            {(form.kind === 'topic' || isTopics) ? (
              <textarea value={form.timelineText} onChange={(event) => setForm({ ...form, timelineText: event.target.value })} placeholder="选题 timeline，比如 W1 试用，W2 采访，W3 成稿" rows={3} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            ) : null}
            <button disabled={creating} className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60">
              {creating ? '正在保存...' : isTopics ? '放进选题池' : isEval ? '加入 Eval' : '放进内容池'}
            </button>
          </form>
        </div>
      </div>

      {!isDemo && !isEval ? <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-950"><CalendarDays size={16} />{isTopics ? '周会文档 + 周会妙记' : '飞书妙记导入'}</p>
            <p className="mt-1 text-sm text-slate-500">{isTopics ? '把两个飞书链接和妙记文本放进来，系统会先沉淀周会记录，并按关键词拆出日常/深度选题候选。' : '现在先支持粘贴妙记转写。后续接飞书妙记 API 后，会自动拉例会、整理选题和 Demo 候选。'}</p>
          </div>
          <form onSubmit={importMinutes} className="grid w-full gap-2 lg:max-w-3xl lg:grid-cols-[180px_1fr_1fr_120px]">
            <input value={minutes.title} onChange={(event) => setMinutes({ ...minutes, title: event.target.value })} placeholder="例会标题" className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            <input value={minutes.meetingDocUrl} onChange={(event) => setMinutes({ ...minutes, meetingDocUrl: event.target.value })} placeholder="周会文档链接" className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            <input value={minutes.meetingMinutesUrl} onChange={(event) => setMinutes({ ...minutes, meetingMinutesUrl: event.target.value })} placeholder="周会妙记链接" className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            <button disabled={importing} className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60">
              {importing ? '导入中' : '导入'}
            </button>
            <textarea value={minutes.transcript} onChange={(event) => setMinutes({ ...minutes, transcript: event.target.value })} placeholder="粘贴妙记转写文本" rows={4} className="lg:col-span-4 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
          </form>
        </div>
      </div> : null}

      {!isGlobal ? <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${active ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              <Icon size={15} />{tab.label}
            </button>
          );
        })}
      </div> : null}

      {isTopics ? (
        <div className="flex flex-wrap gap-2">
          {[
            ['daily', '日常选题'],
            ['deep', '深度选题'],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setTopicType(key)} className={`rounded-md px-3 py-2 text-sm transition ${topicType === key ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{label}</button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-56 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      ) : filteredItems.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredItems.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">{kindLabels[item.kind] || 'Memo'}</span>
                    {item.sub_kind === 'deep' ? <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">深度选题</span> : null}
                    {item.sub_kind === 'daily' ? <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">日常选题</span> : null}
                    {item.project_name ? <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">{item.project_name}</span> : null}
                    {item.demo_ready ? <span className="rounded-md bg-slate-950 px-2 py-1 text-xs font-medium text-white">已达 Demo 条件</span> : null}
                  </div>
                  <h3 className="mt-3 text-xl font-semibold tracking-normal text-slate-950">{item.title}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.body || '还没有补充内容'}</p>
                </div>
                <Avatar member={{ name: item.created_by_name, avatar_url: item.created_by_avatar }} size="md" />
              </div>

              {item.kind === 'topic' || item.kind === 'eval' ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-500">负责人</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{item.owner_text || '待分配'}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between text-xs text-slate-500"><span>执行进度</span><span>{item.progress || 0}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${item.progress || 0}%` }} />
                    </div>
                  </div>
                </div>
              ) : null}

              {item.timeline_text ? (
                <div className="mt-4 rounded-md border border-emerald-100 bg-emerald-50/70 p-3">
                  <p className="text-xs font-semibold text-emerald-800">{item.kind === 'eval' ? 'Eval 计划' : item.sub_kind === 'deep' ? '深度选题长 timeline' : '选题执行计划'}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-emerald-900">{item.timeline_text}</p>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-3">
                {item.source_url ? (
                  <a href={item.source_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-700 hover:text-emerald-600">打开资料链接</a>
                ) : null}
                {item.meeting_doc_url ? (
                  <a href={item.meeting_doc_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-600 hover:text-slate-950">周会文档</a>
                ) : null}
                {item.meeting_minutes_url ? (
                  <a href={item.meeting_minutes_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-600 hover:text-slate-950">周会妙记</a>
                ) : null}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button onClick={() => toggleVote(item)} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${item.my_vote ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                  <Vote size={15} />投 Demo 票
                </button>
                <span className="text-sm text-slate-500">{item.vote_count}/{item.demo_threshold} 票通过</span>
                <span className="text-sm text-slate-500">{item.experience_count} 条试用体验</span>
              </div>

              <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                <div className="flex gap-2">
                  <input value={experienceDrafts[item.id] || ''} onChange={(event) => setExperienceDrafts((drafts) => ({ ...drafts, [item.id]: event.target.value }))} placeholder="写一条试用体验或建议" className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
                  <button onClick={() => addExperience(item)} className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                    <ThumbsUp size={14} />提交
                  </button>
                </div>
                {item.experiences?.slice(0, 3).map((exp) => (
                  <div key={exp.id} className="rounded-md bg-slate-50 p-3">
                    <p className="text-sm leading-6 text-slate-700">{exp.content}</p>
                    <p className="mt-1 text-xs text-slate-400">{exp.user_name}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="这里还没有内容" detail="先把 demo memo、例会文档或选题放进来，大家再一起投票和补试用体验。" />
      )}
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <p className="text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}
