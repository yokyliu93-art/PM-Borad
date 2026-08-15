import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Archive, BookOpenText, CalendarDays, Copy, ExternalLink, FilePlus2, FlaskConical, LogIn, MessageSquareText, Sparkles, ThumbsUp, UserCheck, Vote } from 'lucide-react';
import { get, post, put, del } from '../../lib/api';
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

const topicTypeLabels = {
  daily: '日常选题',
  business: '商务选题',
  deep: '深度选题',
  weekly_recommendation: '本周项目推荐',
  frontier: 'Frontier',
  prompt: 'Prompt PR',
};

export function ContentHub({ mode = 'all', initialTopicType = 'daily' }) {
  const { projectId } = useParams();
  const { currentTeamId, currentUser } = useStore();
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || '');
  const isInitialTopicLike = ['topics', 'frontier', 'prompt'].includes(mode);
  const [activeTab, setActiveTab] = useState(isInitialTopicLike ? 'topic' : mode === 'demo' ? 'demo' : mode === 'eval' ? 'eval' : 'all');
  const [topicType, setTopicType] = useState(initialTopicType);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importingEval, setImportingEval] = useState(false);
  const [parsingTopics, setParsingTopics] = useState(false);
  const [topicParseError, setTopicParseError] = useState('');
  const [topicDraftLinks, setTopicDraftLinks] = useState({});
  const [topicDraftDates, setTopicDraftDates] = useState({});
  const [topicPublishDates, setTopicPublishDates] = useState({});
  const [topicEditorNotes, setTopicEditorNotes] = useState({});
  const [topicDocLinkDrafts, setTopicDocLinkDrafts] = useState({});
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [topicOverview, setTopicOverview] = useState(null);
  const [form, setForm] = useState({ kind: isInitialTopicLike ? 'topic' : mode === 'demo' ? 'demo' : mode === 'eval' ? 'eval' : 'memo', subKind: isInitialTopicLike ? initialTopicType : '', title: '', body: '', sourceUrl: '', timelineText: '', ownerText: '', progress: 0, meetingDocUrl: '', meetingMinutesUrl: '' });
  const [minutes, setMinutes] = useState({ title: '', meetingDocUrl: '', meetingMinutesUrl: '', transcript: '' });
  const [experienceDrafts, setExperienceDrafts] = useState({});
  const isGlobal = !projectId;
  const isTopics = mode === 'topics';
  const isFrontier = mode === 'frontier';
  const isPrompt = mode === 'prompt';
  const isTopicLike = isTopics || isFrontier || isPrompt;
  const isDemo = mode === 'demo';
  const isEval = mode === 'eval';
  const canEditTopics = ['王兆洋'].some((name) => {
    const currentName = currentUser?.name || '';
    if (!currentName) return false;
    return currentName === name || currentName.includes(name) || name.includes(currentName);
  });

  useEffect(() => {
    if (currentTeamId) loadProjects();
  }, [currentTeamId]);

  useEffect(() => {
    loadItems();
  }, [projectId, currentTeamId, mode, topicType]);

  useEffect(() => {
    if (isTopics) loadTopicOverview();
  }, [projectId, currentTeamId, mode]);

  useEffect(() => {
    setTopicType(initialTopicType);
  }, [initialTopicType]);

  useEffect(() => {
    setSelectedTopicId('');
  }, [mode, topicType]);

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
      if (isTopicLike) {
        params.set('kind', 'topic');
        params.set('subKind', topicType);
      } else if (isDemo) {
        params.set('kind', 'demo');
      } else if (isEval) {
        params.set('kind', 'eval');
      }
      path = `/api/content?${params.toString()}`;
    }
    if (isGlobal && isTopics && topicType === 'daily') {
      const dailyParams = new URLSearchParams({ teamId: currentTeamId, kind: 'topic', subKind: 'daily' });
      const weeklyParams = new URLSearchParams({ teamId: currentTeamId, kind: 'topic', subKind: 'weekly_recommendation' });
      const [dailyRes, weeklyRes] = await Promise.all([
        get(`/api/content?${dailyParams.toString()}`),
        get(`/api/content?${weeklyParams.toString()}`),
      ]);
      setItems([...(dailyRes.ok ? dailyRes.data || [] : []), ...(weeklyRes.ok ? weeklyRes.data || [] : [])]);
      setLoading(false);
      return;
    }
    const res = await get(path);
    if (res.ok) setItems(res.data || []);
    setLoading(false);
  }

  async function loadTopicOverview() {
    if (isGlobal && !currentTeamId) return;
    const fetchList = async (query) => {
      const path = isGlobal
        ? `/api/content?${new URLSearchParams({ teamId: currentTeamId, ...query }).toString()}`
        : `/api/projects/${projectId}/content${query.kind ? `?kind=${query.kind}` : ''}`;
      const res = await get(path);
      const list = res.ok ? res.data || [] : [];
      return query.subKind ? list.filter((item) => item.sub_kind === query.subKind) : list;
    };
    const [daily, business, deep, weekly, memo, demo] = await Promise.all([
      fetchList({ kind: 'topic', subKind: 'daily' }),
      fetchList({ kind: 'topic', subKind: 'business' }),
      fetchList({ kind: 'topic', subKind: 'deep' }),
      fetchList({ kind: 'topic', subKind: 'weekly_recommendation' }),
      fetchList({ kind: 'memo' }),
      fetchList({ kind: 'demo' }),
    ]);
    const allTopics = [...daily, ...business, ...deep, ...weekly];
    setTopicOverview({
      daily: daily.length + weekly.length,
      dailyPure: daily.length,
      weekly: weekly.length,
      business: business.length,
      deep: deep.length,
      withMemo: allTopics.filter((item) => hasTopicMemo(item)).length,
      demoReady: demo.filter((item) => item.demo_ready).length,
      memo: memo.length,
      experiences: [...memo, ...demo].reduce((sum, item) => sum + Number(item.experience_count || 0), 0),
    });
  }

  const filteredItems = useMemo(() => (
    isGlobal ? items : activeTab === 'all' ? items : items.filter((item) => item.kind === activeTab)
  ), [items, activeTab, isGlobal]);

  const selectedTopic = useMemo(() => (
    filteredItems.find((item) => item.id === selectedTopicId && item.kind === 'topic' && item.sub_kind === 'deep') || null
  ), [filteredItems, selectedTopicId]);

  const stats = useMemo(() => ({
    memos: items.length,
    demoReady: items.filter((item) => item.demo_ready).length,
    topics: items.filter((item) => item.kind === 'topic').length,
    experiences: items.reduce((sum, item) => sum + Number(item.experience_count || 0), 0),
  }), [items]);

  const displayStats = isTopics ? {
    daily: topicOverview?.daily || 0,
    business: topicOverview?.business || 0,
    deep: topicOverview?.deep || 0,
    withMemo: topicOverview?.withMemo || 0,
    demoReady: topicOverview?.demoReady || 0,
    memo: topicOverview?.memo || 0,
    experiences: topicOverview?.experiences || 0,
  } : stats;

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
    const endpoint = isTopics ? 'parse-weekly-topics' : 'import-minutes';
    if (isTopics && !minutes.meetingDocUrl) {
      toast.error('请填写周会文档链接');
      return;
    }
    setTopicParseError('');
    if (isTopics) setParsingTopics(true);
    else setImporting(true);
    let res;
    try {
      res = await post(`/api/projects/${targetProjectId}/content/${endpoint}`, minutes);
    } catch (err) {
      res = { ok: false, error: err.message || '请求失败，请重试' };
    } finally {
      if (isTopics) setParsingTopics(false);
      else setImporting(false);
    }
    if (res.ok) {
      if (isTopics) {
        const daily = res.data?.dailyTopics?.length || 0;
        const business = res.data?.businessTopics?.length || 0;
        const deep = res.data?.deepTopics?.length || 0;
        const weekly = res.data?.weeklyRecommendations?.length || 0;
        const frontier = res.data?.frontierTopics?.length || 0;
        const prompt = res.data?.promptTopics?.length || 0;
        const pushed = (res.data?.notifications || []).filter((item) => item.pushed).length;
        toast.success(res.data?.fallback
          ? `DeepSeek 解析失败，但已先回传飞书内容，生成 ${daily} 个待整理选题`
          : `已解析 ${daily} 个日常、${business} 个商务、${deep} 个深度、${weekly} 个本周项目推荐、${frontier} 个 Frontier、${prompt} 个 Prompt PR，已推送 ${pushed} 位负责人`);
      } else {
        toast.success(`已导入例会，并生成 ${res.data?.topics?.length || 0} 条候选选题`);
      }
      setMinutes({ title: '', meetingDocUrl: '', meetingMinutesUrl: '', transcript: '' });
      loadItems();
    } else {
      if (isTopics) setTopicParseError(res.error || '解析失败');
      toast.error(res.error || '导入失败');
    }
  }

  async function importEvalDoc(event) {
    event.preventDefault();
    const targetProjectId = projectId || selectedProjectId;
    if (!targetProjectId) {
      toast.error('请先在 Build 里创建一个项目，用来承载这个测试集');
      return;
    }
    if (!form.sourceUrl) {
      toast.error('请填写测试集飞书文档链接');
      return;
    }
    setImportingEval(true);
    let res;
    try {
      res = await post(`/api/projects/${targetProjectId}/content/import-eval-doc`, {
        sourceUrl: form.sourceUrl,
        ownerText: form.ownerText,
      });
    } catch (err) {
      res = { ok: false, error: err.message || '请求失败，请重试' };
    } finally {
      setImportingEval(false);
    }
    if (res.ok) {
      toast.success('已解析并加入 Eval');
      setForm({ kind: 'eval', subKind: '', title: '', body: '', sourceUrl: '', timelineText: '', ownerText: '', progress: 0, meetingDocUrl: '', meetingMinutesUrl: '' });
      loadItems();
    } else {
      toast.error(res.error || '解析失败');
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

  async function saveTopicPublishDate(item) {
    const targetProjectId = item.project_id || projectId;
    const publishDate = topicPublishDates[item.id] ?? item.publish_date ?? '';
    const res = await put(`/api/projects/${targetProjectId}/content/${item.id}/topic-publish-date`, { publishDate });
    if (res.ok) {
      setItems((current) => current.map((memo) => (memo.id === item.id ? res.data : memo)));
      toast.success('发布日期已保存');
    } else {
      toast.error(res.error || '保存失败');
    }
  }

  async function saveTopicDraftDate(item) {
    const targetProjectId = item.project_id || projectId;
    const draftDate = topicDraftDates[item.id] ?? topicDraftDateText(item) ?? '';
    const res = await put(`/api/projects/${targetProjectId}/content/${item.id}/topic-draft-date`, { draftDate });
    if (res.ok) {
      setItems((current) => current.map((memo) => (memo.id === item.id ? res.data : memo)));
      toast.success('交稿日期已保存');
    } else {
      toast.error(res.error || '保存失败');
    }
  }

  async function saveTopicDocLinks(item) {
    const targetProjectId = item.project_id || projectId;
    const docLinks = topicDocLinkDrafts[item.id] || topicDocLinks(item);
    const res = await put(`/api/projects/${targetProjectId}/content/${item.id}/topic-doc-links`, { docLinks });
    if (res.ok) {
      setItems((current) => current.map((memo) => (memo.id === item.id ? res.data : memo)));
      setTopicDocLinkDrafts((drafts) => {
        const next = { ...drafts };
        delete next[item.id];
        return next;
      });
      toast.success('文档入口已保存');
    } else {
      toast.error(res.error || '保存失败');
    }
  }

  async function submitTopicDraft(item) {
    const targetProjectId = item.project_id || projectId;
    const draftDocUrl = topicDraftLinks[item.id] ?? item.draft_doc_url ?? '';
    const res = await post(`/api/projects/${targetProjectId}/content/${item.id}/submit-topic-draft`, { draftDocUrl });
    if (res.ok) {
      setItems((current) => current.map((memo) => (memo.id === item.id ? res.data.topic : memo)));
      toast.success(res.data.pushed ? '初稿已提交，并已推送王兆洋' : `初稿已提交，飞书推送失败：${res.data.pushError || '未知原因'}`);
    } else {
      toast.error(res.error || '提交失败');
    }
  }

  async function saveTopicEditorNotes(item) {
    const targetProjectId = item.project_id || projectId;
    const editorNotes = topicEditorNotes[item.id] ?? item.editor_notes ?? '';
    const res = await put(`/api/projects/${targetProjectId}/content/${item.id}/topic-editor-notes`, { editorNotes });
    if (res.ok) {
      setItems((current) => current.map((memo) => (memo.id === item.id ? res.data.topic : memo)));
      toast.success(res.data.pushed ? '编辑建议已保存，并已推送作者' : `编辑建议已保存，飞书推送失败：${res.data.pushError || '未知原因'}`);
    } else {
      toast.error(res.error || '保存失败');
    }
  }

  async function copyText(text, message = '已复制') {
    try {
      await navigator.clipboard.writeText(text || '');
      toast.success(message);
    } catch {
      toast.error('复制失败，请手动选择文本复制');
    }
  }

  function evalQuestionCopy(question) {
    return [
      `# ${question.title || '测试题'}`,
      question.prompt_text ? `## Prompt\n${question.prompt_text}` : '',
      question.input_text ? `## 输入 / 素材\n${question.input_text}` : '',
      question.expected_output ? `## 期望输出\n${question.expected_output}` : '',
      question.evaluation_criteria ? `## 评测标准\n${question.evaluation_criteria}` : '',
      question.reference_answer ? `## 参考答案\n${question.reference_answer}` : '',
    ].filter(Boolean).join('\n\n');
  }

  function topicDetailSections(item) {
    const sections = {
      intro: '',
      weeklyPlan: '',
      phaseProgress: '',
      interviewRaw: '',
      outline: '',
    };
    const body = String(item.body || '');
    const sectionPattern = /##\s*(技术介绍|周计划|阶段性进度|采访原文|稿件框架)\s*\n([\s\S]*?)(?=\n##\s*(?:技术介绍|周计划|阶段性进度|采访原文|稿件框架)\s*\n|$)/g;
    const keyMap = {
      技术介绍: 'intro',
      周计划: 'weeklyPlan',
      阶段性进度: 'phaseProgress',
      采访原文: 'interviewRaw',
      稿件框架: 'outline',
    };
    let match;
    while ((match = sectionPattern.exec(body))) {
      sections[keyMap[match[1]]] = String(match[2] || '').trim();
    }
    return sections;
  }

  function topicCardBody(item) {
    const sections = topicDetailSections(item);
    if (sections.intro) return sections.intro;
    return item.body || '还没有补充内容';
  }

  function topicProgressText(item) {
    if (item.draft_doc_url) return item.editor_notes ? '编辑建议已返回' : '已提交初稿';
    if (Number(item.progress || 0) > 0) return '等待提交初稿';
    return '等待提交初稿';
  }

  function topicDocLinks(item) {
    if (item.doc_links && typeof item.doc_links === 'object') return item.doc_links;
    try {
      return item.doc_links_json ? JSON.parse(item.doc_links_json) : {};
    } catch {
      return {};
    }
  }

  function hasTopicMemo(item) {
    const links = topicDocLinks(item);
    return Boolean(
      item.source_url ||
      item.meeting_doc_url ||
      item.meeting_minutes_url ||
      item.draft_doc_url ||
      Object.values(links).some((value) => String(value || '').trim())
    );
  }

  function topicOwnerText(item) {
    const owner = String(item.owner_text || '').trim();
    if (owner && owner !== '待定' && owner !== '待分配') return owner;
    return item.created_by_name || currentUser?.name || '我';
  }

  function currentUserMatchesOwner(item) {
    const owner = String(item.owner_text || '').trim();
    const name = String(currentUser?.name || '').trim();
    if (!owner || !name || owner === '待定' || owner === '待分配') return false;
    return owner === name || owner.includes(name) || name.includes(owner);
  }

  function canArchiveTopic(item) {
    const currentName = currentUser?.name || '';
    const jobTitle = currentUser?.job_title || currentUser?.jobTitle || '';
    const namedEditor = currentName && ['王兆洋'].some((name) => currentName === name || currentName.includes(name) || name.includes(currentName));
    return item.created_by === currentUser?.id || currentUserMatchesOwner(item) || namedEditor || String(jobTitle).includes('编辑');
  }

  function isTopicAuthor(item) {
    return item.created_by === currentUser?.id || currentUserMatchesOwner(item);
  }

  function canEditTopicMeta() {
    const jobTitle = currentUser?.job_title || currentUser?.jobTitle || '';
    return canEditTopics || String(jobTitle).includes('编辑');
  }

  function canEditTopicDraftDate(item) {
    return isTopicAuthor(item) || canEditTopicMeta();
  }

  function canEditTopicDocLinks(item) {
    return isTopicAuthor(item) || canEditTopicMeta();
  }

  function topicDraftDateText(item) {
    const text = String(item.timeline_text || '').trim();
    const match = text.match(/交稿日期[：:]\s*([^\n]+)/);
    if (!match) return '';
    const value = match[1].trim();
    if (!value || /待定|暂无|没有|无/.test(value)) return '';
    return value;
  }

  function docLinkValue(item, key) {
    return topicDocLinkDrafts[item.id]?.[key] ?? topicDocLinks(item)[key] ?? '';
  }

  function setTopicDocLink(item, key, value) {
    setTopicDocLinkDrafts((drafts) => ({
      ...drafts,
      [item.id]: {
        ...topicDocLinks(item),
        ...(drafts[item.id] || {}),
        [key]: value,
      },
    }));
  }

  async function archiveTopic(item) {
    const targetProjectId = item.project_id || projectId;
    const res = await post(`/api/projects/${targetProjectId}/content/${item.id}/archive-topic`, {});
    if (res.ok) {
      setItems((current) => current.filter((memo) => memo.id !== item.id));
      toast.success('已归档');
    } else {
      toast.error(res.error || '归档失败');
    }
  }

  const topicParserPanel = isTopics ? (
    <div className="rounded-xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
      <div className="grid gap-5 xl:grid-cols-[minmax(420px,0.9fr)_1.1fr] xl:items-start">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <CalendarDays size={16} />周会选题解析台
          </p>
          <h2 className="mt-2 max-w-2xl text-2xl font-semibold leading-tight tracking-normal text-slate-950">
            连接周会文档和速记文档，自动生成选题板块
          </h2>
          <p className="mt-3 max-w-md text-sm leading-7 text-slate-600">
            系统会读取飞书周会文档和速记文档，再调用 DeepSeek 解析日常选题、商务选题、深度选题和本周项目推荐；Frontier 与 Prompt PR 会自动分流到左侧对应栏目。
          </p>
        </div>
        <div className="space-y-3">
          <form onSubmit={importMinutes} className="grid w-full gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px]">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">周会文档链接</span>
              <input value={minutes.meetingDocUrl} onChange={(event) => setMinutes({ ...minutes, meetingDocUrl: event.target.value })} placeholder="https://xxx.feishu.cn/docx/..." className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">周会速记文档链接（可选）</span>
              <input value={minutes.meetingMinutesUrl} onChange={(event) => setMinutes({ ...minutes, meetingMinutesUrl: event.target.value })} placeholder="https://xxx.feishu.cn/wiki/... 或 /docx/..." className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400" />
            </label>
            <button disabled={parsingTopics} className="mt-5 rounded-md bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60">
              {parsingTopics ? '解析中' : '解析'}
            </button>
          </form>
          {topicParseError ? (
            <div className="flex flex-col gap-3 rounded-md border border-red-100 bg-red-50 px-3 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
              <span>{topicParseError}</span>
              {/飞书|授权|token|refresh/i.test(topicParseError) ? (
                <button type="button" onClick={() => { window.location.href = '/api/auth/login'; }} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm ring-1 ring-red-100 hover:bg-red-50">
                  <LogIn size={13} />重新飞书授权
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <section className="space-y-6">
      {topicParserPanel}

      <div className={`grid gap-4 ${isTopicLike ? 'xl:grid-cols-1' : 'xl:grid-cols-[1fr_380px]'}`}>
        <div className="rounded-xl border border-emerald-100 bg-white p-5 shadow-sm shadow-emerald-950/5">
          <p className="text-sm font-medium text-emerald-700">{isTopics ? '硅星人选题' : isFrontier ? '硅星人 Frontier' : isPrompt ? '硅星人 Prompt PR' : isDemo ? '硅星人 Demo 模块' : isEval ? '硅星人 Eval' : '硅星人内容池'}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">{isTopics ? '从周会进入选题推进' : isFrontier ? 'Frontier 前沿观察' : isPrompt ? 'Prompt PR 推进' : isDemo ? '从 memo 到 Demo 决策' : isEval ? '测试集和评测进度' : '把零散 memo 变成可协作的板块'}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            {isTopics ? '选题分为日常选题、商务选题和深度选题。本周项目推荐固定放在日常选题里；深度选题按更长 timeline 协作推进。' : isFrontier ? '这里承接周会里拆出来的 Frontier 前沿项目、研究和产品观察，不混在选题列表里。' : isPrompt ? '这里承接 Prompt PR 相关项目、协作事项和推进记录，不混在选题列表里。' : isDemo ? '这里都是大家扔上来的 Demo memo。试用后写体验，半数通过就进入 Demo。' : isEval ? '把测试集以飞书链接的方式放进来，记录负责人、评测进度和当前说明，部门大盘会同步显示 Eval 进度。' : 'Demo、每周例会和选题先放在这里。大家写试用体验、投 Demo 票，够半数通过后就可以进入 Demo 或沉淀成项目任务。'}
          </p>
          {isTopics ? (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800">
              <UserCheck size={15} />选题面板：按负责人推进
            </div>
          ) : null}
          {isTopics ? (
            <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Stat label="日常选题" value={displayStats.daily} detail={`含本周推荐 ${topicOverview?.weekly || 0}`} />
              <Stat label="深度选题" value={displayStats.deep} detail="按二级页面推进" />
              <Stat label="商务选题" value={displayStats.business} detail="来自周会其他事项" />
              <Stat label="有 memo / 文档" value={displayStats.withMemo} detail="已挂飞书入口" />
              <Stat label="可 Demo" value={displayStats.demoReady} detail="Demo 池已达条件" />
              <Stat label="试用体验" value={displayStats.experiences} detail={`${displayStats.memo} 个普通 memo`} />
            </div>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <Stat label="池内 memo" value={stats.memos} />
              <Stat label="可 Demo" value={stats.demoReady} />
              <Stat label="选题" value={stats.topics} />
              <Stat label="试用体验" value={stats.experiences} />
            </div>
          )}
        </div>
        {!isTopicLike ? <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-950"><FilePlus2 size={16} />{isTopics ? '新增一个选题' : isEval ? '新增测试集' : '扔一个 memo 进来'}</p>
          {isEval ? (
            <form onSubmit={importEvalDoc} className="mt-4 space-y-3">
              {isGlobal ? (
                <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400">
                  <option value="">选择归属 Build 项目...</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              ) : null}
              <input value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} placeholder="测试集飞书文档链接" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
              <input value={form.ownerText} onChange={(event) => setForm({ ...form, ownerText: event.target.value })} placeholder="负责人，可选，比如 评测负责人 / 待分配" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
              <p className="text-xs leading-5 text-slate-500">
                PM Board 会读取飞书文档，用 DeepSeek 整理测试目标、覆盖范围、负责人、当前状态和 Eval 计划，并生成共享测试集卡片。
              </p>
              <button disabled={importingEval} className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60">
                {importingEval ? '解析中...' : '解析并加入 Eval'}
              </button>
            </form>
          ) : (
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
                <option value="business">商务选题</option>
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
                <input value={form.meetingMinutesUrl} onChange={(event) => setForm({ ...form, meetingMinutesUrl: event.target.value })} placeholder="来源周会速记文档链接" className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
              </div>
            ) : null}
            {(form.kind === 'topic' || isTopics) ? (
              <textarea value={form.timelineText} onChange={(event) => setForm({ ...form, timelineText: event.target.value })} placeholder="选题 timeline，比如 W1 试用，W2 采访，W3 成稿" rows={3} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            ) : null}
            <button disabled={creating} className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60">
              {creating ? '正在保存...' : isTopics ? '放进选题池' : isEval ? '加入 Eval' : '放进内容池'}
            </button>
          </form>
          )}
        </div> : null}
      </div>

      {!isDemo && !isEval && !isTopicLike ? <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-950"><CalendarDays size={16} />例会速记导入</p>
            <p className="mt-1 text-sm text-slate-500">把例会文档和速记文档放进来，系统会整理选题和 Demo 候选。</p>
          </div>
          <form onSubmit={importMinutes} className="grid w-full gap-2 lg:max-w-3xl lg:grid-cols-[180px_1fr_1fr_120px]">
            <input value={minutes.title} onChange={(event) => setMinutes({ ...minutes, title: event.target.value })} placeholder="例会标题" className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            <input value={minutes.meetingDocUrl} onChange={(event) => setMinutes({ ...minutes, meetingDocUrl: event.target.value })} placeholder="周会文档链接" className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            <input value={minutes.meetingMinutesUrl} onChange={(event) => setMinutes({ ...minutes, meetingMinutesUrl: event.target.value })} placeholder="周会速记文档链接" className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            <button disabled={importing} className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60">
              {importing ? '导入中' : '导入'}
            </button>
            <textarea value={minutes.transcript} onChange={(event) => setMinutes({ ...minutes, transcript: event.target.value })} placeholder="可选：粘贴速记文字记录" rows={4} className="lg:col-span-4 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
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
            ['business', '商务选题'],
            ['deep', '深度选题'],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setTopicType(key)} className={`rounded-md px-3 py-2 text-sm transition ${topicType === key ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{label}</button>
          ))}
        </div>
      ) : null}

      {selectedTopic ? (
        <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
          <button onClick={() => setSelectedTopicId('')} className="mb-5 inline-flex items-center rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            返回深度选题
          </button>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">深度选题</span>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">初稿阶段</span>
              </div>
              <h3 className="mt-3 text-2xl font-semibold tracking-normal text-slate-950">{selectedTopic.title}</h3>
              <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-600">{topicCardBody(selectedTopic)}</p>
            </div>
            <div className="shrink-0 rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">执行人</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{topicOwnerText(selectedTopic)}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <TopicDetailBlock title="周计划" value={topicDetailSections(selectedTopic).weeklyPlan || selectedTopic.timeline_text || '等待补充周计划'} />
            <TopicDetailBlock title="阶段性进度" value={topicDetailSections(selectedTopic).phaseProgress || '暂无进度更新'} />
            <TopicDetailBlock title="采访原文" value={topicDetailSections(selectedTopic).interviewRaw || '等待飞书原文链接或摘录'} />
            <TopicDetailBlock title="稿件框架" value={topicDetailSections(selectedTopic).outline || '等待补充稿件框架'} />
          </div>

          <div className="mt-4 rounded-lg border border-emerald-100 bg-white p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-950">飞书文档入口</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">正文继续放在飞书里，PM Board 只负责挂入口、看负责人和进度。</p>
              </div>
              {canEditTopicDocLinks(selectedTopic) ? (
                <button onClick={() => saveTopicDocLinks(selectedTopic)} className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
                  保存入口
                </button>
              ) : null}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {[
                ['techIntro', '技术介绍文档'],
                ['weeklyPlan', '周计划文档'],
                ['phaseProgress', '阶段进度文档'],
                ['interviewRaw', '采访原文文档'],
                ['outline', '稿件框架文档'],
                ['reference', '资料补充文档'],
              ].map(([key, label]) => (
                <TopicDocLinkInput
                  key={key}
                  label={label}
                  value={docLinkValue(selectedTopic, key)}
                  disabled={!canEditTopicDocLinks(selectedTopic)}
                  onChange={(value) => setTopicDocLink(selectedTopic, key, value)}
                  onCopy={() => copyText(docLinkValue(selectedTopic, key), '链接已复制')}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-3 rounded-md border border-slate-200 bg-white p-3">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
              <label className="min-w-0">
                <span className="mb-1.5 block text-xs font-semibold text-slate-500">初稿飞书链接</span>
                <input
                  value={topicDraftLinks[selectedTopic.id] ?? selectedTopic.draft_doc_url ?? ''}
                  onChange={(event) => setTopicDraftLinks((drafts) => ({ ...drafts, [selectedTopic.id]: event.target.value }))}
                  disabled={!isTopicAuthor(selectedTopic)}
                  placeholder={isTopicAuthor(selectedTopic) ? '作者提交初稿飞书链接' : '等待作者提交初稿'}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-400 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </label>
              {isTopicAuthor(selectedTopic) ? (
                <button onClick={() => submitTopicDraft(selectedTopic)} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
                  提交初稿
                </button>
              ) : null}
            </div>
            <div className="rounded-md border border-amber-100 bg-amber-50/60 p-3">
              <span className="text-xs font-semibold text-amber-800">编辑建议</span>
              <div className="mt-2 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                <textarea
                  value={topicEditorNotes[selectedTopic.id] ?? selectedTopic.editor_notes ?? ''}
                  onChange={(event) => setTopicEditorNotes((drafts) => ({ ...drafts, [selectedTopic.id]: event.target.value }))}
                  disabled={!canEditTopicMeta()}
                  placeholder={canEditTopicMeta() ? '写给作者的修改建议，可由 Agent 回传后粘贴' : '暂无编辑建议'}
                  rows={3}
                  className="w-full rounded-md border border-amber-100 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-400 disabled:bg-amber-50 disabled:text-amber-900"
                />
                {canEditTopicMeta() ? (
                  <button onClick={() => saveTopicEditorNotes(selectedTopic)} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                    推送建议
                  </button>
                ) : null}
              </div>
            </div>
            {canArchiveTopic(selectedTopic) ? (
              <button onClick={() => archiveTopic(selectedTopic)} className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                <Archive size={14} />归档
              </button>
            ) : null}
          </div>
        </article>
      ) : loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-56 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      ) : filteredItems.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredItems.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
              {item.kind === 'topic' && item.sub_kind === 'deep' ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">{topicTypeLabels[item.sub_kind] || kindLabels[item.kind] || 'Memo'}</span>
                    {item.project_name ? <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">{item.project_name}</span> : null}
                    {hasTopicMemo(item) ? <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">有 memo / 文档</span> : null}
                  </div>
                  <h3 className="mt-4 text-xl font-semibold tracking-normal text-slate-950">{item.title}</h3>
                  <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-500">主题</p>
                    <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-700">{topicCardBody(item)}</p>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-500">负责人</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{topicOwnerText(item)}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-500">当前进度</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{topicProgressText(item)}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedTopicId(item.id)} className="mt-4 inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                    进入二级页面
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">{topicTypeLabels[item.sub_kind] || kindLabels[item.kind] || 'Memo'}</span>
                        {item.project_name ? <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">{item.project_name}</span> : null}
                        {item.kind === 'eval' ? <span className="rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700">{item.eval_questions?.length || 0} 道题</span> : null}
                        {item.kind === 'topic' && hasTopicMemo(item) ? <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">有 memo / 文档</span> : null}
                        {item.kind !== 'topic' && item.demo_ready ? <span className="rounded-md bg-slate-950 px-2 py-1 text-xs font-medium text-white">已达 Demo 条件</span> : null}
                      </div>
                      <h3 className="mt-3 text-xl font-semibold tracking-normal text-slate-950">{item.title}</h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.kind === 'topic' ? topicCardBody(item) : item.body || '还没有补充内容'}</p>
                    </div>
                    <Avatar member={{ name: item.created_by_name, avatar_url: item.created_by_avatar }} size="md" />
                  </div>

                  {item.kind === 'topic' || item.kind === 'eval' ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-500">负责人</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{item.kind === 'topic' ? topicOwnerText(item) : item.owner_text || '待分配'}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    {item.kind === 'topic' ? (
                      <>
                        <p className="text-xs font-semibold text-slate-500">交稿日期</p>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            value={topicDraftDates[item.id] ?? topicDraftDateText(item)}
                            onChange={(event) => setTopicDraftDates((drafts) => ({ ...drafts, [item.id]: event.target.value }))}
                            disabled={!canEditTopicDraftDate(item)}
                            placeholder={canEditTopicDraftDate(item) ? '负责人填写，比如 8月15日 / 下周三' : ''}
                            className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-emerald-400 disabled:bg-slate-50 disabled:text-slate-500"
                          />
                          {canEditTopicDraftDate(item) ? (
                            <button onClick={() => saveTopicDraftDate(item)} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                              保存
                            </button>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="mb-2 flex items-center justify-between text-xs text-slate-500"><span>执行进度</span><span>{item.progress || 0}%</span></div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${item.progress || 0}%` }} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : null}

              {(item.timeline_text || item.kind === 'topic') && !(item.kind === 'topic' && item.sub_kind === 'deep') ? (
                <div className="mt-4 rounded-md border border-emerald-100 bg-emerald-50/70 p-3">
                  <p className="text-xs font-semibold text-emerald-800">{item.kind === 'topic' ? '发布日期' : item.kind === 'eval' ? 'Eval 计划' : item.sub_kind === 'deep' ? '深度选题长 timeline' : '选题执行计划'}</p>
                  {item.kind === 'topic' ? (
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        type="date"
                        value={topicPublishDates[item.id] ?? item.publish_date ?? ''}
                        onChange={(event) => setTopicPublishDates((drafts) => ({ ...drafts, [item.id]: event.target.value }))}
                        disabled={!canEditTopicMeta()}
                        className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 disabled:bg-emerald-50 disabled:text-emerald-800"
                      />
                      {canEditTopicMeta() ? (
                        <button onClick={() => saveTopicPublishDate(item)} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
                          保存发布日期
                        </button>
                      ) : (
                        <span className="min-h-5 text-sm text-emerald-900">{item.publish_date || ' '}</span>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-emerald-900">{item.timeline_text}</p>
                  )}
                </div>
              ) : null}

              {item.kind === 'topic' && item.sub_kind !== 'deep' ? (
                <div className="mt-4 space-y-3 rounded-md border border-slate-200 bg-white p-3">
                  <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                    <label className="min-w-0">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-500">初稿飞书链接</span>
                      <input
                        value={topicDraftLinks[item.id] ?? item.draft_doc_url ?? ''}
                        onChange={(event) => setTopicDraftLinks((drafts) => ({ ...drafts, [item.id]: event.target.value }))}
                        disabled={!isTopicAuthor(item)}
                        placeholder={isTopicAuthor(item) ? '作者提交初稿飞书链接' : '等待作者提交初稿'}
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-400 disabled:bg-slate-50 disabled:text-slate-500"
                      />
                    </label>
                    {isTopicAuthor(item) ? (
                      <button onClick={() => submitTopicDraft(item)} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
                        提交初稿
                      </button>
                    ) : null}
                  </div>

                  <div className="rounded-md border border-amber-100 bg-amber-50/60 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-amber-800">编辑建议</span>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                      <textarea
                        value={topicEditorNotes[item.id] ?? item.editor_notes ?? ''}
                        onChange={(event) => setTopicEditorNotes((drafts) => ({ ...drafts, [item.id]: event.target.value }))}
                        disabled={!canEditTopicMeta()}
                        placeholder={canEditTopicMeta() ? '写给作者的修改建议，可由 Agent 回传后粘贴' : '暂无编辑建议'}
                        rows={3}
                        className="w-full rounded-md border border-amber-100 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-400 disabled:bg-amber-50 disabled:text-amber-900"
                      />
                      {canEditTopicMeta() ? (
                        <button onClick={() => saveTopicEditorNotes(item)} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                          推送建议
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {canArchiveTopic(item) ? (
                    <button onClick={() => archiveTopic(item)} className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                      <Archive size={14} />归档
                    </button>
                  ) : null}
                </div>
              ) : null}

              {item.kind === 'eval' && item.eval_questions?.length ? (
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-500">测试题模块</p>
                  {item.eval_questions.map((question, index) => (
                    <div key={question.id} className="rounded-lg border border-violet-100 bg-violet-50/40 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-violet-700">第 {index + 1} 题</p>
                          <h4 className="mt-1 text-sm font-semibold text-slate-950">{question.title}</h4>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button onClick={() => copyText(question.prompt_text, 'Prompt 已复制')} className="inline-flex items-center gap-1 rounded-md border border-violet-100 bg-white px-2 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50">
                            <Copy size={12} />复制 Prompt
                          </button>
                          <button onClick={() => copyText(evalQuestionCopy(question), '完整题包已复制')} className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-violet-500">
                            <Copy size={12} />复制题包
                          </button>
                        </div>
                      </div>
                      {question.prompt_text ? (
                        <div className="mt-3 rounded-md bg-white p-3">
                          <p className="text-xs font-semibold text-slate-500">Prompt</p>
                          <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{question.prompt_text}</p>
                        </div>
                      ) : null}
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {question.input_text ? (
                          <div className="rounded-md bg-white p-3">
                            <p className="text-xs font-semibold text-slate-500">输入 / 素材</p>
                            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">{question.input_text}</p>
                          </div>
                        ) : null}
                        {question.evaluation_criteria ? (
                          <div className="rounded-md bg-white p-3">
                            <p className="text-xs font-semibold text-slate-500">评测标准</p>
                            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">{question.evaluation_criteria}</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-3">
                {item.draft_doc_url ? (
                  <a href={item.draft_doc_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-600 hover:text-slate-950">打开初稿</a>
                ) : null}
                {item.source_url ? (
                  <a href={item.source_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-700 hover:text-emerald-600">打开资料链接</a>
                ) : null}
                {item.meeting_doc_url ? (
                  <a href={item.meeting_doc_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-600 hover:text-slate-950">周会文档</a>
                ) : null}
                {item.meeting_minutes_url ? (
                  <a href={item.meeting_minutes_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-600 hover:text-slate-950">周会速记文档</a>
                ) : null}
              </div>

              {item.kind !== 'topic' ? (
                <>
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
                </>
              ) : null}
                </>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="这里还没有内容" detail="先把 demo memo、例会文档或选题放进来，大家再一起投票和补试用体验。" />
      )}
    </section>
  );
}

function Stat({ label, value, detail = '' }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <p className="text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
      {detail ? <p className="mt-1 text-[11px] leading-4 text-slate-400">{detail}</p> : null}
    </div>
  );
}

function TopicDetailBlock({ title, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold text-slate-500">{title}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function TopicDocLinkInput({ label, value, disabled, onChange, onCopy }) {
  const hasValue = Boolean(String(value || '').trim());
  return (
    <label className="block rounded-md border border-slate-100 bg-slate-50 p-3">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <div className="mt-2 flex gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          placeholder="粘贴飞书文档链接"
          className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-emerald-400 disabled:bg-slate-50 disabled:text-slate-500"
        />
        {hasValue ? (
          <>
            <a href={value} target="_blank" rel="noreferrer" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100" title="打开飞书文档">
              <ExternalLink size={15} />
            </a>
            <button type="button" onClick={onCopy} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100" title="复制链接">
              <Copy size={15} />
            </button>
          </>
        ) : null}
      </div>
    </label>
  );
}
