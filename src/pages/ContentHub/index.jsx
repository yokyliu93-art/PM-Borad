import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { BookOpenText, CalendarDays, FilePlus2, FlaskConical, MessageSquareText, Sparkles, ThumbsUp, Vote } from 'lucide-react';
import { get, post, del } from '../../lib/api';
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
  meeting: '例会',
  topic: '选题',
};

export function ContentHub() {
  const { projectId } = useParams();
  const [items, setItems] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({ kind: 'memo', title: '', body: '', sourceUrl: '', timelineText: '' });
  const [minutes, setMinutes] = useState({ title: '', sourceUrl: '', transcript: '' });
  const [experienceDrafts, setExperienceDrafts] = useState({});

  useEffect(() => {
    loadItems();
  }, [projectId]);

  async function loadItems() {
    setLoading(true);
    const res = await get(`/api/projects/${projectId}/content`);
    if (res.ok) setItems(res.data || []);
    setLoading(false);
  }

  const filteredItems = useMemo(() => (
    activeTab === 'all' ? items : items.filter((item) => item.kind === activeTab)
  ), [items, activeTab]);

  const stats = useMemo(() => ({
    memos: items.length,
    demoReady: items.filter((item) => item.demo_ready).length,
    topics: items.filter((item) => item.kind === 'topic').length,
    experiences: items.reduce((sum, item) => sum + Number(item.experience_count || 0), 0),
  }), [items]);

  async function createMemo(event) {
    event.preventDefault();
    setCreating(true);
    const res = await post(`/api/projects/${projectId}/content`, form);
    setCreating(false);
    if (res.ok) {
      toast.success('已放进内容池');
      setForm({ kind: form.kind, title: '', body: '', sourceUrl: '', timelineText: '' });
      loadItems();
    } else {
      toast.error(res.error || '创建失败');
    }
  }

  async function importMinutes(event) {
    event.preventDefault();
    setImporting(true);
    const res = await post(`/api/projects/${projectId}/content/import-minutes`, minutes);
    setImporting(false);
    if (res.ok) {
      toast.success(`已导入例会，并生成 ${res.data?.topics?.length || 0} 条候选选题`);
      setMinutes({ title: '', sourceUrl: '', transcript: '' });
      loadItems();
    } else {
      toast.error(res.error || '导入失败');
    }
  }

  async function toggleVote(item) {
    const res = item.my_vote
      ? await del(`/api/projects/${projectId}/content/${item.id}/vote-demo`)
      : await post(`/api/projects/${projectId}/content/${item.id}/vote-demo`, {});
    if (res.ok) {
      setItems((current) => current.map((memo) => (memo.id === item.id ? res.data : memo)));
    } else {
      toast.error(res.error || '投票失败');
    }
  }

  async function addExperience(item) {
    const content = experienceDrafts[item.id] || '';
    const res = await post(`/api/projects/${projectId}/content/${item.id}/experiences`, { content });
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
          <p className="text-sm font-medium text-emerald-700">硅星人内容池</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">把零散 memo 变成可协作的板块</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Demo、每周例会和选题先放在这里。大家写试用体验、投 Demo 票，够半数通过后就可以进入 Demo 或沉淀成项目任务。
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Stat label="池内 memo" value={stats.memos} />
            <Stat label="可 Demo" value={stats.demoReady} />
            <Stat label="选题" value={stats.topics} />
            <Stat label="试用体验" value={stats.experiences} />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-950"><FilePlus2 size={16} />扔一个 memo 进来</p>
          <form onSubmit={createMemo} className="mt-4 space-y-3">
            <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400">
              <option value="memo">普通 Memo</option>
              <option value="demo">Demo 候选</option>
              <option value="meeting">每周例会</option>
              <option value="topic">选题</option>
            </select>
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="标题" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            <textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="内容、背景、试用发现或会议摘要" rows={4} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            <input value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} placeholder="飞书文档或资料链接" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            {form.kind === 'topic' ? (
              <textarea value={form.timelineText} onChange={(event) => setForm({ ...form, timelineText: event.target.value })} placeholder="选题 timeline，比如 W1 试用，W2 采访，W3 成稿" rows={3} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            ) : null}
            <button disabled={creating} className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60">
              {creating ? '正在保存...' : '放进内容池'}
            </button>
          </form>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-950"><CalendarDays size={16} />飞书妙记导入</p>
            <p className="mt-1 text-sm text-slate-500">现在先支持粘贴妙记转写。后续接飞书妙记 API 后，会自动拉例会、整理选题和 Demo 候选。</p>
          </div>
          <form onSubmit={importMinutes} className="grid w-full gap-2 lg:max-w-3xl lg:grid-cols-[180px_1fr_120px]">
            <input value={minutes.title} onChange={(event) => setMinutes({ ...minutes, title: event.target.value })} placeholder="例会标题" className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            <input value={minutes.sourceUrl} onChange={(event) => setMinutes({ ...minutes, sourceUrl: event.target.value })} placeholder="妙记或飞书文档链接" className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            <button disabled={importing} className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60">
              {importing ? '导入中' : '导入'}
            </button>
            <textarea value={minutes.transcript} onChange={(event) => setMinutes({ ...minutes, transcript: event.target.value })} placeholder="粘贴妙记转写文本" rows={4} className="lg:col-span-3 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
          </form>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${active ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              <Icon size={15} />{tab.label}
            </button>
          );
        })}
      </div>

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
                    {item.demo_ready ? <span className="rounded-md bg-slate-950 px-2 py-1 text-xs font-medium text-white">已达 Demo 条件</span> : null}
                  </div>
                  <h3 className="mt-3 text-xl font-semibold tracking-normal text-slate-950">{item.title}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.body || '还没有补充内容'}</p>
                </div>
                <Avatar member={{ name: item.created_by_name, avatar_url: item.created_by_avatar }} size="md" />
              </div>

              {item.timeline_text ? (
                <div className="mt-4 rounded-md border border-emerald-100 bg-emerald-50/70 p-3">
                  <p className="text-xs font-semibold text-emerald-800">选题 timeline</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-emerald-900">{item.timeline_text}</p>
                </div>
              ) : null}

              {item.source_url ? (
                <a href={item.source_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-600">打开资料链接</a>
              ) : null}

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
