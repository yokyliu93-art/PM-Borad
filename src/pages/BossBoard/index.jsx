import { useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, Boxes, FlaskConical, Loader2, Microscope, Newspaper } from 'lucide-react';
import { get } from '../../lib/api';
import { Progress } from '../../components/ui/Progress';

const sectionMeta = {
  topics: {
    title: '选题',
    subtitle: '日常选题 / 深度选题',
    icon: Newspaper,
    tone: 'emerald',
  },
  demo: {
    title: 'Demo',
    subtitle: 'memo 试用、投票与可 demo 项',
    icon: FlaskConical,
    tone: 'cyan',
  },
  eval: {
    title: 'Eval',
    subtitle: '评测、测评与 benchmark',
    icon: Microscope,
    tone: 'violet',
  },
  build: {
    title: 'Build',
    subtitle: '正在 build 的复杂项目',
    icon: Boxes,
    tone: 'amber',
  },
};

const toneClass = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
};

export function BossBoard() {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  const teams = board?.teams || [];
  const sections = board?.sections || {};

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><BarChart3 size={16} />部门大盘</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">所有团队的协作进度</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              这里不是单项目列表，而是把硅星人、Evolve 等团队放在同一张部门看板里，按选题、Demo、Eval、Build 四条线看进展。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-3 text-center">
            <Metric label="团队" value={teams.length} />
            <Metric label="Build" value={sections.build?.total || 0} />
            <Metric label="任务" value={sections.build?.tasks || 0} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <OverviewCard type="topics" data={sections.topics} />
        <OverviewCard type="demo" data={sections.demo} />
        <OverviewCard type="eval" data={sections.eval} />
        <OverviewCard type="build" data={sections.build} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-950/5">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-sm font-semibold text-slate-950">团队进度明细</p>
          <p className="mt-1 text-sm text-slate-500">每个团队横向看四个栏目，Evolve 和已有项目都会出现在这里。</p>
        </div>
        {teams.length ? (
          <div className="divide-y divide-slate-200">
            {teams.map((team) => <TeamRow key={team.id} team={team} />)}
          </div>
        ) : (
          <p className="p-5 text-sm text-slate-500">还没有团队或项目数据。</p>
        )}
      </div>
    </section>
  );
}

function OverviewCard({ type, data = {} }) {
  const meta = sectionMeta[type];
  const Icon = meta.icon;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">{meta.title}</p>
          <p className="mt-1 text-xs text-slate-500">{meta.subtitle}</p>
        </div>
        <span className={`rounded-lg p-2 ring-1 ${toneClass[meta.tone]}`}><Icon size={17} /></span>
      </div>
      <div className="mt-5 flex items-end justify-between">
        <span className="text-4xl font-semibold tracking-normal text-slate-950">{data.progress || 0}%</span>
        <SectionCount type={type} data={data} />
      </div>
      <div className="mt-4">
        <Progress value={data.progress || 0} />
      </div>
    </div>
  );
}

function SectionCount({ type, data }) {
  if (type === 'topics') {
    return <span className="text-right text-xs leading-5 text-slate-500">日常 {data.dailyTotal || 0}<br />深度 {data.deepTotal || 0}</span>;
  }
  if (type === 'demo') {
    return <span className="text-right text-xs leading-5 text-slate-500">可 Demo {data.ready || 0}<br />总计 {data.total || 0}</span>;
  }
  if (type === 'eval') {
    return <span className="text-right text-xs leading-5 text-slate-500">完成 {data.done || 0}<br />总计 {data.total || 0}</span>;
  }
  return <span className="text-right text-xs leading-5 text-slate-500">进行中 {data.active || 0}<br />总计 {data.total || 0}</span>;
}

function TeamRow({ team }) {
  return (
    <div className="grid gap-4 p-5 xl:grid-cols-[220px_repeat(4,minmax(0,1fr))]">
      <div>
        <p className="text-lg font-semibold text-slate-950">{team.name}</p>
        <p className="mt-1 text-sm text-slate-500">{team.members_count || 0} 人 · {team.projects_count || 0} 个 Build</p>
        {team.my_role ? <span className="mt-3 inline-flex rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">我在这个团队</span> : null}
      </div>
      <SectionCell type="topics" section={team.sections.topics} />
      <SectionCell type="demo" section={team.sections.demo} />
      <SectionCell type="eval" section={team.sections.eval} />
      <SectionCell type="build" section={team.sections.build} />
    </div>
  );
}

function SectionCell({ type, section }) {
  const meta = sectionMeta[type];
  const Icon = meta.icon;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-950"><Icon size={15} />{meta.title}</p>
        <span className="text-sm font-semibold text-slate-700">{section.progress || 0}%</span>
      </div>
      <div className="mt-3">
        <Progress value={section.progress || 0} />
      </div>
      <div className="mt-3">
        <CellNumbers type={type} section={section} />
      </div>
      <div className="mt-3 space-y-2">
        {(section.recent || []).length ? section.recent.map((item) => (
          <div key={`${type}-${item.id}`} className="rounded-md bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
            <p className="truncate font-medium text-slate-800">{item.title || item.name}</p>
            <p className="mt-1 truncate text-slate-400">{item.project_name || item.pm_name || item.status || '暂无说明'}</p>
          </div>
        )) : (
          <p className="rounded-md bg-white px-3 py-2 text-xs text-slate-400 ring-1 ring-slate-200">暂无数据</p>
        )}
      </div>
    </div>
  );
}

function CellNumbers({ type, section }) {
  if (type === 'topics') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <TinyMetric label="日常" value={`${section.daily?.planned || 0}/${section.daily?.total || 0}`} />
        <TinyMetric label="深度" value={`${section.deep?.planned || 0}/${section.deep?.total || 0}`} />
      </div>
    );
  }
  if (type === 'demo') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <TinyMetric label="可 Demo" value={section.ready || 0} />
        <TinyMetric label="候选" value={section.total || 0} />
      </div>
    );
  }
  if (type === 'eval') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <TinyMetric label="完成" value={section.done || 0} />
        <TinyMetric label="总数" value={section.total || 0} />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <TinyMetric label="项目" value={section.total || 0} />
      <TinyMetric label="任务" value={section.tasks || 0} />
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
    <div className="rounded-md bg-white px-2 py-2 ring-1 ring-slate-200">
      <p className="text-sm font-semibold text-slate-950">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{label}</p>
    </div>
  );
}
