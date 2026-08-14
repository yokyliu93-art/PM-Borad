import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, BarChart3, Boxes, ChevronDown, ExternalLink, FlaskConical, Loader2, Microscope, Newspaper } from 'lucide-react';
import { get } from '../../lib/api';
import { Progress } from '../../components/ui/Progress';

const blocks = [
  { key: 'eval', title: 'Eval', subtitle: '评测、测评与 benchmark', icon: Microscope, tone: 'violet' },
  { key: 'build', title: 'Build', subtitle: '正在 build 的复杂项目', icon: Boxes, tone: 'amber' },
  { key: 'topics', title: '选题', subtitle: '日常选题 / 深度选题', icon: Newspaper, tone: 'emerald' },
  { key: 'demo', title: 'Demo', subtitle: 'memo 试用、投票与可 demo 项', icon: FlaskConical, tone: 'cyan' },
];

const toneClass = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
};

export function BossBoard() {
  const navigate = useNavigate();
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openCard, setOpenCard] = useState('');

  async function loadBoard() {
    setLoading(true);
    setError(null);
    try {
      const res = await get('/api/dashboard/department');
      if (res.ok) setBoard(res.data);
      else setError(res.error || '大盘加载失败');
    } catch {
      setError('无法连接服务器，请确认后端已启动');
    }
    setLoading(false);
  }

  useEffect(() => {
    loadBoard();
  }, []);

  if (loading) {
    return <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-slate-500" size={32} /></div>;
  }

  if (error) {
    return (
      <div className="grid h-64 place-items-center">
        <div className="text-center">
          <AlertTriangle size={32} className="mx-auto text-amber-400" />
          <p className="mt-3 text-slate-500">{error}</p>
          <button onClick={loadBoard} className="mt-4 rounded-md bg-emerald-600 px-3 py-2 text-sm text-white">重试</button>
        </div>
      </div>
    );
  }

  const sections = board?.sections || {};
  const teams = board?.teams || [];

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><BarChart3 size={16} />统帅视角</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">部门执行总览</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              这里按业务板块看所有正在推进的事情。每张卡片都直接展示负责人、进度、当前阶段和来源链接，点开可以继续看细节。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-3 text-center">
            <Metric label="团队" value={teams.length} />
            <Metric label="事项" value={(sections.eval?.total || 0) + (sections.build?.total || 0) + (sections.topics?.total || 0) + (sections.demo?.total || 0)} />
            <Metric label="任务" value={sections.build?.tasks || 0} />
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {blocks.map((block) => (
          <BoardBlock
            key={block.key}
            block={block}
            data={sections[block.key] || {}}
            openCard={openCard}
            setOpenCard={setOpenCard}
            navigate={navigate}
          />
        ))}
      </div>
    </section>
  );
}

function BoardBlock({ block, data, openCard, setOpenCard, navigate }) {
  const Icon = block.icon;
  const items = block.key === 'topics'
    ? [
        ...(data.dailyItems || []).map((item) => ({ ...item, topicType: '日常选题' })),
        ...(data.deepItems || []).map((item) => ({ ...item, topicType: '深度选题' })),
      ]
    : data.items || [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <span className={`rounded-lg p-2 ring-1 ${toneClass[block.tone]}`}><Icon size={17} /></span>
            {block.title}
          </p>
          <p className="mt-2 text-sm text-slate-500">{block.subtitle}</p>
        </div>
        <BlockStats type={block.key} data={data} />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span>整体进度</span>
          <span>{data.progress || 0}%</span>
        </div>
        <Progress value={data.progress || 0} />
      </div>

      {block.key === 'topics' ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <TopicLane
            title="日常选题"
            items={data.dailyItems || []}
            openCard={openCard}
            setOpenCard={setOpenCard}
          />
          <TopicLane
            title="深度选题"
            items={data.deepItems || []}
            openCard={openCard}
            setOpenCard={setOpenCard}
          />
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {items.length ? items.map((item) => (
            <WorkCard
              key={`${block.key}-${item.id}`}
              type={block.key}
              item={item}
              open={openCard === `${block.key}-${item.id}`}
              onToggle={() => setOpenCard(openCard === `${block.key}-${item.id}` ? '' : `${block.key}-${item.id}`)}
              navigate={navigate}
            />
          )) : <EmptyCards />}
        </div>
      )}
    </section>
  );
}

function TopicLane({ title, items, openCard, setOpenCard }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-950">{title}</p>
        <span className="rounded-md bg-white px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200">{items.length}</span>
      </div>
      <div className="mt-3 space-y-3">
        {items.length ? items.map((item) => (
          <TopicCard
            key={item.id}
            item={item}
            label={title}
            open={openCard === `topic-${item.id}`}
            onToggle={() => setOpenCard(openCard === `topic-${item.id}` ? '' : `topic-${item.id}`)}
          />
        )) : (
          <p className="rounded-md bg-white px-3 py-3 text-sm text-slate-400 ring-1 ring-slate-200">暂无{title}</p>
        )}
      </div>
    </div>
  );
}

function TopicCard({ item, label, open, onToggle }) {
  const progress = Number(item.progress || 0);
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm shadow-slate-950/5">
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">{item.title}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{item.team_name || item.project_name || '部门选题'} · {label}</p>
          </div>
          <ChevronDown size={15} className={`mt-0.5 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <TinyMetric label="负责人" value={item.owner_text || '待分配'} />
          <TinyMetric label="进度" value={`${progress}%`} />
        </div>
        <div className="mt-3">
          <Progress value={progress} />
        </div>
      </button>
      {open ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-500">当前进展</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.body || '暂无进展说明'}</p>
          {item.timeline_text ? (
            <>
              <p className="mt-3 text-xs font-semibold text-slate-500">{label === '深度选题' ? '长 Timeline' : '执行计划'}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-emerald-800">{item.timeline_text}</p>
            </>
          ) : null}
          <LinkRow item={item} />
        </div>
      ) : null}
    </article>
  );
}

function WorkCard({ type, item, open, onToggle, navigate }) {
  const isBuild = type === 'build';
  const progress = isBuild ? Number(item.progress || 0) : Number(item.progress || (item.status === '已完成' ? 100 : 0));
  const owner = isBuild ? item.pm_name : item.owner_text || item.owner_name || item.created_by_name;
  const status = isBuild ? statusLabel(item.status) : item.status || (item.demo_ready ? '已达 Demo 条件' : '推进中');

  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">{item.title || item.name}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{item.team_name || item.project_name || '部门事项'} · {status}</p>
          </div>
          <ChevronDown size={15} className={`mt-0.5 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <TinyMetric label={isBuild ? '总 PM' : '负责人'} value={owner || '待分配'} />
          <TinyMetric label="进度" value={`${progress}%`} />
        </div>
        <div className="mt-3">
          <Progress value={progress} />
        </div>
      </button>
      {open ? (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="text-xs font-semibold text-slate-500">执行状态</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {item.agent_progress_note || item.body || item.description || item.summary || '暂无详细说明'}
          </p>
          {isBuild ? (
            <button onClick={() => navigate(`/projects/${item.id}/pool`)} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-600">
              进入 Build <ExternalLink size={13} />
            </button>
          ) : (
            <LinkRow item={item} />
          )}
        </div>
      ) : null}
    </article>
  );
}

function LinkRow({ item }) {
  const links = [
    [item.source_url, '资料链接'],
    [item.meeting_doc_url, '周会文档'],
    [item.meeting_minutes_url, '周会速记文档'],
  ].filter(([url]) => url);
  if (!links.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {links.map(([url, label]) => (
        <a key={`${label}-${url}`} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-600">
          {label}<ExternalLink size={13} />
        </a>
      ))}
    </div>
  );
}

function BlockStats({ type, data }) {
  if (type === 'topics') {
    return (
      <div className="grid grid-cols-2 gap-2 text-center">
        <TinyMetric label="日常" value={data.dailyTotal || 0} />
        <TinyMetric label="深度" value={data.deepTotal || 0} />
      </div>
    );
  }
  if (type === 'demo') {
    return <TinyMetric label="可 Demo" value={`${data.ready || 0}/${data.total || 0}`} />;
  }
  if (type === 'eval') {
    return <TinyMetric label="完成" value={`${data.done || 0}/${data.total || 0}`} />;
  }
  return <TinyMetric label="Build" value={data.total || 0} />;
}

function statusLabel(status = '') {
  const map = { draft: '筹备中', active: '进行中', completed: '已完成' };
  return map[status] || status || '筹备中';
}

function EmptyCards() {
  return (
    <div className="col-span-full rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
      暂无事项
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="min-w-20">
      <p className="text-2xl font-semibold text-slate-950">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function TinyMetric({ label, value }) {
  return (
    <div className="min-w-0 rounded-md bg-white px-2 py-2 ring-1 ring-slate-200">
      <p className="truncate text-sm font-semibold text-slate-950">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{label}</p>
    </div>
  );
}
