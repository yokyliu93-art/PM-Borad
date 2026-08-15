import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { BookOpenText, CalendarDays, Copy, ExternalLink, FilePlus2, FlaskConical, Link2, LogIn, MessageSquareText, Sparkles, ThumbsUp, Trash2, UserCheck, Vote } from 'lucide-react';
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

const deepTopicStages = [
  { key: '待讨论', progress: 10 },
  { key: '组队中', progress: 25 },
  { key: '执行中', progress: 55 },
  { key: '出提纲', progress: 75 },
  { key: '填成稿', progress: 90 },
  { key: '已发布', progress: 100 },
];

export function ContentHub({ mode = 'all', initialTopicType = 'daily' }) {
  const { projectId } = useParams();
  const { currentTeamId, currentUser } = useStore();
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
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
  const [deepTopicDrafts, setDeepTopicDrafts] = useState({});
  const [topicCandidateBatch, setTopicCandidateBatch] = useState(null);
  const [topicCandidateEnabled, setTopicCandidateEnabled] = useState({});
  const [parsingDiscussions, setParsingDiscussions] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [selectedEvalId, setSelectedEvalId] = useState('');
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
    if (currentTeamId) {
      loadProjects();
      loadTeamMembers();
    }
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

  async function loadTeamMembers() {
    const res = await get(`/api/teams/${currentTeamId}`);
    if (res.ok) setTeamMembers(res.data?.members || []);
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
    const [daily, business, deep, weekly] = await Promise.all([
      fetchList({ kind: 'topic', subKind: 'daily' }),
      fetchList({ kind: 'topic', subKind: 'business' }),
      fetchList({ kind: 'topic', subKind: 'deep' }),
      fetchList({ kind: 'topic', subKind: 'weekly_recommendation' }),
    ]);
    const topicGroupStats = (list) => ({
      total: list.length,
      withMemo: list.filter((item) => hasTopicMemo(item)).length,
      active: list.filter((item) => String(item.status || 'open') !== 'archived').length,
      waitingDraft: list.filter((item) => item.sub_kind === 'deep' && !item.draft_doc_url).length,
    });
    const dailyWithWeekly = [...daily, ...weekly];
    setTopicOverview({
      daily: topicGroupStats(dailyWithWeekly),
      dailyPure: daily.length,
      weekly: weekly.length,
      business: topicGroupStats(business),
      deep: topicGroupStats(deep),
    });
  }

  const filteredItems = useMemo(() => (
    isGlobal ? items : activeTab === 'all' ? items : items.filter((item) => item.kind === activeTab)
  ), [items, activeTab, isGlobal]);

  const selectedTopic = useMemo(() => (
    filteredItems.find((item) => item.id === selectedTopicId && item.kind === 'topic') || null
  ), [filteredItems, selectedTopicId]);

  const selectedEval = useMemo(() => (
    filteredItems.find((item) => item.id === selectedEvalId && item.kind === 'eval') || null
  ), [filteredItems, selectedEvalId]);

  const stats = useMemo(() => ({
    memos: items.length,
    demoReady: items.filter((item) => item.demo_ready).length,
    topics: items.filter((item) => item.kind === 'topic').length,
    experiences: items.reduce((sum, item) => sum + Number(item.experience_count || 0), 0),
  }), [items]);

  const displayStats = isTopics ? {
    daily: topicOverview?.daily || { total: 0, withMemo: 0, active: 0, waitingDraft: 0 },
    business: topicOverview?.business || { total: 0, withMemo: 0, active: 0, waitingDraft: 0 },
    deep: topicOverview?.deep || { total: 0, withMemo: 0, active: 0, waitingDraft: 0 },
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
    if (isTopics && !minutes.meetingDocUrl) {
      toast.error('请填写周会文档链接');
      return;
    }
    setTopicParseError('');
    if (isTopics) setParsingTopics(true);
    else setImporting(true);
    let res;
    try {
      res = await post(`/api/projects/${targetProjectId}/content/${isTopics ? 'preview-weekly-topics' : 'import-minutes'}`, minutes);
    } catch (err) {
      res = { ok: false, error: err.message || '请求失败，请重试' };
    } finally {
      if (isTopics) setParsingTopics(false);
      else setImporting(false);
    }
    if (res.ok) {
      if (isTopics) {
        const batch = res.data || {};
        const candidates = flattenTopicCandidates(batch.parsed);
        setTopicCandidateBatch(batch);
        setTopicCandidateEnabled(Object.fromEntries(candidates.map((candidate) => [candidate.key, true])));
        toast.success(`已解析出 ${candidates.length} 个候选，先确认再更新卡片`);
      } else {
        toast.success(`已导入例会，并生成 ${res.data?.topics?.length || 0} 条候选选题`);
        setMinutes({ title: '', meetingDocUrl: '', meetingMinutesUrl: '', transcript: '' });
        loadItems();
      }
    } else {
      if (isTopics) setTopicParseError(res.error || '解析失败');
      toast.error(res.error || '导入失败');
    }
  }

  async function confirmTopicCandidates() {
    const targetProjectId = projectId || selectedProjectId;
    const parsed = filterTopicCandidates(topicCandidateBatch?.parsed, topicCandidateEnabled);
    const selectedCount = flattenTopicCandidates(parsed).length;
    if (!selectedCount) {
      toast.error('请至少保留一个候选选题');
      return;
    }
    setParsingTopics(true);
    const res = await post(`/api/projects/${targetProjectId}/content/confirm-weekly-topics`, {
      parsed,
      source: topicCandidateBatch?.source,
      fallback: topicCandidateBatch?.fallback,
      aiError: topicCandidateBatch?.aiError,
      meetingDocUrl: topicCandidateBatch?.source?.meetingDoc?.url || minutes.meetingDocUrl,
      title: minutes.title,
    });
    setParsingTopics(false);
    if (res.ok) {
      const pushed = (res.data?.notifications || []).filter((item) => item.pushed).length;
      toast.success(`已更新 ${selectedCount} 个选题卡片，推送 ${pushed} 位负责人`);
      setTopicCandidateBatch(null);
      setTopicCandidateEnabled({});
      setMinutes({ title: '', meetingDocUrl: '', meetingMinutesUrl: '', transcript: '' });
      loadItems();
      loadTopicOverview();
    } else {
      toast.error(res.error || '确认失败');
    }
  }

  async function parseTopicDiscussions() {
    const targetProjectId = projectId || selectedProjectId;
    if (!targetProjectId) {
      toast.error('请先选择一个 Build 项目');
      return;
    }
    if (!minutes.meetingMinutesUrl && !minutes.transcript) {
      toast.error('请填写周会速记文档链接，或粘贴速记文字');
      return;
    }
    setParsingDiscussions(true);
    const res = await post(`/api/projects/${targetProjectId}/content/parse-topic-discussions`, {
      title: minutes.title,
      meetingMinutesUrl: minutes.meetingMinutesUrl,
      transcript: minutes.transcript,
    });
    setParsingDiscussions(false);
    if (res.ok) {
      toast.success(`已给 ${res.data?.updatedTopics?.length || 0} 个选题补充周会讨论`);
      setMinutes((current) => ({ ...current, meetingMinutesUrl: '', transcript: '' }));
      loadItems();
    } else {
      setTopicParseError(res.error || '速记解析失败');
      toast.error(res.error || '速记解析失败');
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

  async function saveTopicOwner(item, ownerText) {
    const targetProjectId = item.project_id || projectId;
    const res = await put(`/api/projects/${targetProjectId}/content/${item.id}/topic-owner`, { ownerText });
    if (res.ok) {
      setItems((current) => current.map((memo) => (memo.id === item.id ? res.data : memo)));
      toast.success('负责人已更新');
    } else {
      toast.error(res.error || '负责人更新失败');
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

  async function saveDeepTopicState(item) {
    const targetProjectId = item.project_id || projectId;
    const draft = deepTopicDrafts[item.id] || {};
    const status = draft.status ?? deepTopicStage(item);
    const progress = draft.progress ?? deepTopicProgress(item, status);
    const timelineText = draft.timelineText ?? item.timeline_text ?? '';
    const res = await put(`/api/projects/${targetProjectId}/content/${item.id}/deep-topic-state`, { status, progress, timelineText });
    if (res.ok) {
      setItems((current) => current.map((memo) => (memo.id === item.id ? res.data : memo)));
      setDeepTopicDrafts((drafts) => {
        const next = { ...drafts };
        delete next[item.id];
        return next;
      });
      toast.success('深度选题状态已保存');
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

  function flattenTopicCandidates(parsed = {}) {
    const groups = [
      ['dailyTopics', 'daily', '日常选题'],
      ['weeklyRecommendations', 'weekly_recommendation', '本周项目推荐'],
      ['businessTopics', 'business', '商务选题'],
      ['deepTopics', 'deep', '深度选题'],
      ['frontierTopics', 'frontier', 'Frontier'],
      ['promptTopics', 'prompt', 'Prompt PR'],
    ];
    return groups.flatMap(([groupKey, subKind, label]) => (
      (parsed?.[groupKey] || []).map((topic, index) => ({
        ...topic,
        groupKey,
        subKind,
        label,
        index,
        key: `${groupKey}-${index}`,
      }))
    ));
  }

  function filterTopicCandidates(parsed = {}, enabled = {}) {
    const next = {};
    for (const candidate of flattenTopicCandidates(parsed)) {
      if (!enabled[candidate.key]) continue;
      if (!next[candidate.groupKey]) next[candidate.groupKey] = [];
      const { groupKey, subKind, label, index, key, ...topic } = candidate;
      next[groupKey].push(topic);
    }
    return next;
  }

  function topicDetailSections(item) {
    const sections = {
      intro: '',
      weeklyPlan: '',
      phaseProgress: '',
      meetingDiscussion: '',
      interviewRaw: '',
      outline: '',
    };
    const body = String(item.body || '');
    const sectionPattern = /##\s*(技术介绍|周计划|阶段性进度|周会讨论纪要|采访原文|稿件框架)\s*\n([\s\S]*?)(?=\n##\s*(?:技术介绍|周计划|阶段性进度|周会讨论纪要|采访原文|稿件框架)\s*\n|$)/g;
    const keyMap = {
      技术介绍: 'intro',
      周计划: 'weeklyPlan',
      阶段性进度: 'phaseProgress',
      周会讨论纪要: 'meetingDiscussion',
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
    if (item.sub_kind === 'deep') return deepTopicStage(item);
    const timeline = String(item.timeline_text || '');
    const body = String(item.body || '');
    const explicit = `${timeline}\n${body}`.match(/当前进度[：:]\s*([^\n]+)/);
    if (explicit?.[1]?.trim()) return explicit[1].trim();
    if (item.draft_doc_url) return item.editor_notes ? '编辑建议已返回' : '已提交初稿';
    if (Number(item.progress || 0) > 0) return '等待提交初稿';
    return '等待提交初稿';
  }

  function deepTopicStage(item) {
    const status = String(item.status || '').trim();
    if (deepTopicStages.some((stage) => stage.key === status)) return status;
    const explicit = `${item.timeline_text || ''}\n${item.body || ''}`.match(/当前进度[：:]\s*([^\n]+)/);
    if (explicit?.[1] && deepTopicStages.some((stage) => stage.key === explicit[1].trim())) return explicit[1].trim();
    return item.draft_doc_url ? '填成稿' : '待讨论';
  }

  function deepTopicProgress(item, stage = deepTopicStage(item)) {
    const matched = deepTopicStages.find((option) => option.key === stage);
    if (matched) return matched.progress;
    return Number(item.progress || 0);
  }

  function deepTopicDraftValue(item, key) {
    return deepTopicDrafts[item.id]?.[key] ?? (key === 'status' ? deepTopicStage(item) : key === 'progress' ? deepTopicProgress(item) : item.timeline_text ?? '');
  }

  function setDeepTopicDraft(item, key, value) {
    setDeepTopicDrafts((drafts) => ({
      ...drafts,
      [item.id]: {
        ...(drafts[item.id] || {}),
        [key]: value,
      },
    }));
  }

  function topicWeekPlans(item) {
    const source = topicDetailSections(item).weeklyPlan || item.timeline_text || '';
    return String(source)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(W\d+|第[一二三四五六七八九十]+周|下周)[：:]\s*(.*)$/);
        return {
          week: match?.[1] || '阶段',
          detail: match?.[2] || line,
        };
      });
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
    return '待分配';
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

  function canEditTopicMeta(item = null) {
    const jobTitle = currentUser?.job_title || currentUser?.jobTitle || '';
    return Boolean((item && isTopicAuthor(item)) || canEditTopics || String(jobTitle).includes('编辑'));
  }

  function canEditTopicDraftDate(item) {
    return canEditTopicMeta(item);
  }

  function canEditTopicDocLinks(item) {
    return canEditTopicMeta(item);
  }

  function teamMemberNames() {
    return teamMembers.map((member) => member.name).filter(Boolean);
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
    if (!window.confirm(`确定删除「${item.title}」吗？删除后它不会再出现在选题列表里。`)) return;
    const targetProjectId = item.project_id || projectId;
    const res = await post(`/api/projects/${targetProjectId}/content/${item.id}/archive-topic`, {});
    if (res.ok) {
      setItems((current) => current.filter((memo) => memo.id !== item.id));
      toast.success('已删除');
    } else {
      toast.error(res.error || '删除失败');
    }
  }

  const topicParserPanel = isTopics ? (
    <div className="rounded-xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
      <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.85fr)_1.15fr] xl:items-start">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <CalendarDays size={16} />周会选题解析台
          </p>
          <h2 className="mt-2 max-w-2xl text-2xl font-semibold leading-tight tracking-normal text-slate-950">
            先确认选题，再补周会编辑意见
          </h2>
          <p className="mt-3 max-w-md text-sm leading-7 text-slate-600">
            周会文档只负责抽取候选选题；速记文档只负责给已确认选题补充讨论结果和编辑建议。确认前不会更新卡片。
          </p>
        </div>
        <div className="space-y-3">
          <form onSubmit={importMinutes} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">1</span>
              <div>
                <p className="text-sm font-semibold text-slate-950">贴周会文档，生成候选选题</p>
                <p className="text-xs text-slate-500">先让你确认，不直接写入看板。</p>
              </div>
            </div>
            <div className="grid w-full gap-3 lg:grid-cols-[minmax(0,1fr)_120px]">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">周会文档链接</span>
              <input value={minutes.meetingDocUrl} onChange={(event) => setMinutes({ ...minutes, meetingDocUrl: event.target.value })} placeholder="https://xxx.feishu.cn/docx/..." className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400" />
            </label>
            <button disabled={parsingTopics} className="mt-5 rounded-md bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60">
              {parsingTopics ? '解析中' : '解析候选'}
            </button>
            </div>
          </form>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">2</span>
              <div>
                <p className="text-sm font-semibold text-slate-950">贴周会速记，匹配编辑意见</p>
                <p className="text-xs text-slate-500">只更新已确认选题的详情页右侧栏。</p>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_120px]">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-500">周会速记文档链接</span>
                <input value={minutes.meetingMinutesUrl} onChange={(event) => setMinutes({ ...minutes, meetingMinutesUrl: event.target.value })} placeholder="https://xxx.feishu.cn/docx/..." className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400" />
              </label>
              <button type="button" onClick={parseTopicDiscussions} disabled={parsingDiscussions} className="mt-5 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60">
                {parsingDiscussions ? '解析中' : '解析意见'}
              </button>
              <textarea value={minutes.transcript} onChange={(event) => setMinutes({ ...minutes, transcript: event.target.value })} placeholder="可选：速记太长或链接读不到时，把导出的文字粘贴在这里" rows={3} className="lg:col-span-2 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            </div>
          </div>
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
          {topicCandidateBatch ? (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-emerald-900">待确认选题</p>
                  <p className="text-xs text-emerald-800">取消勾选不需要的条目，再更新卡片。</p>
                </div>
                <button type="button" onClick={confirmTopicCandidates} disabled={parsingTopics} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60">
                  确认并更新卡片
                </button>
              </div>
              <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
                {flattenTopicCandidates(topicCandidateBatch.parsed).map((candidate) => (
                  <label key={candidate.key} className="flex gap-3 rounded-md border border-emerald-100 bg-white p-3">
                    <input
                      type="checkbox"
                      checked={topicCandidateEnabled[candidate.key] !== false}
                      onChange={(event) => setTopicCandidateEnabled((current) => ({ ...current, [candidate.key]: event.target.checked }))}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600"
                    />
                    <span className="min-w-0">
                      <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{candidate.label}</span>
                      <span className="mt-1 block text-sm font-semibold text-slate-950">{candidate.title || '未命名选题'}</span>
                      <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500">{candidate.summary || '暂无摘要'}</span>
                    </span>
                  </label>
                ))}
              </div>
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
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <TopicBoardStat
                label="日常选题"
                value={displayStats.daily.total}
                detail={`含本周项目推荐 ${topicOverview?.weekly || 0}`}
                withMemo={displayStats.daily.withMemo}
                active={displayStats.daily.active}
              />
              <TopicBoardStat
                label="深度选题"
                value={displayStats.deep.total}
                detail="按周计划同步进度"
                withMemo={displayStats.deep.withMemo}
                active={displayStats.deep.active}
                waitingDraft={displayStats.deep.waitingDraft}
              />
              <TopicBoardStat
                label="商务选题"
                value={displayStats.business.total}
                detail="来自周会商务事项"
                withMemo={displayStats.business.withMemo}
                active={displayStats.business.active}
              />
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
            返回选题列表
          </button>
          <div className={`grid gap-5 ${selectedTopic.sub_kind === 'deep' ? 'xl:grid-cols-[minmax(0,1fr)_420px]' : 'xl:grid-cols-[minmax(0,1fr)_320px]'}`}>
          <div className="min-w-0">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">{topicTypeLabels[selectedTopic.sub_kind] || '选题'}</span>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">{topicProgressText(selectedTopic)}</span>
              </div>
              <h3 className="mt-3 text-2xl font-semibold tracking-normal text-slate-950">{selectedTopic.title}</h3>
              <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-600">{topicCardBody(selectedTopic)}</p>
            </div>
            <div className="shrink-0 rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">执行人</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{topicOwnerText(selectedTopic)}</p>
            </div>
          </div>

          {selectedTopic.sub_kind === 'deep' ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/30 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">深度选题生命周期</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">飞书文档是工作空间；PM Board 只同步状态、分工、周计划和编辑意见。</p>
                  </div>
                  {canEditTopicMeta(selectedTopic) ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={deepTopicDraftValue(selectedTopic, 'status')}
                        onChange={(event) => {
                          const stage = deepTopicStages.find((option) => option.key === event.target.value);
                          setDeepTopicDrafts((drafts) => ({
                            ...drafts,
                            [selectedTopic.id]: {
                              ...(drafts[selectedTopic.id] || {}),
                              status: event.target.value,
                              progress: stage?.progress ?? deepTopicProgress(selectedTopic),
                            },
                          }));
                        }}
                        className="rounded-md border border-emerald-100 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400"
                      >
                        {deepTopicStages.map((stage) => <option key={stage.key} value={stage.key}>{stage.key}</option>)}
                      </select>
                      <button onClick={() => saveDeepTopicState(selectedTopic)} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
                        保存阶段
                      </button>
                    </div>
                  ) : null}
                </div>
                <DeepStageRail stages={deepTopicStages} current={deepTopicDraftValue(selectedTopic, 'status')} />
              </div>

              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-950">组队与分工</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">直接从团队成员里点选，可以多选；具体分工可以在飞书文档里写细。</p>
                  <MemberMultiSelect
                    members={teamMemberNames()}
                    value={docLinkValue(selectedTopic, 'members')}
                    disabled={!canEditTopicDocLinks(selectedTopic)}
                    onChange={(value) => setTopicDocLink(selectedTopic, 'members', value)}
                  />
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-950">本页怎么协作</p>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                    <p>1. 负责人和队员在飞书文档里推进具体内容。</p>
                    <p>2. Agent 每天把进度回传到 PM Board。</p>
                    <p>3. 右侧 timeline 固定展示周计划和当前阶段。</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <TopicDetailBlock title="阶段性进度" value={topicDetailSections(selectedTopic).phaseProgress || '等待 Agent 或负责人回传进度'} />
                <DeepTextArea
                  label="采访对象"
                  value={docLinkValue(selectedTopic, 'interviews')}
                  disabled={!canEditTopicDocLinks(selectedTopic)}
                  placeholder="记录采访对象、联络状态、已完成/待约"
                  onChange={(value) => setTopicDocLink(selectedTopic, 'interviews', value)}
                />
              </div>

              <div className="rounded-lg border border-emerald-100 bg-white p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">飞书工作空间</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">资料放在飞书里，PM Board 只做入口、状态和提醒。</p>
                  </div>
                  {canEditTopicDocLinks(selectedTopic) ? (
                    <button onClick={() => saveTopicDocLinks(selectedTopic)} className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
                      保存入口
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {[
                    ['sourceDoc', '选题文档'],
                    ['references', '参考资料'],
                    ['outline', '写作提纲'],
                    ['draft', '初稿'],
                    ['final', '终稿 / 发布稿'],
                  ].map(([key, label]) => (
                    <TopicDocLinkInput
                      key={key}
                      label={label}
                      value={key === 'draft' ? (docLinkValue(selectedTopic, key) || selectedTopic.draft_doc_url || '') : docLinkValue(selectedTopic, key)}
                      disabled={!canEditTopicDocLinks(selectedTopic)}
                      onChange={(value) => setTopicDocLink(selectedTopic, key, value)}
                      onCopy={() => copyText(key === 'draft' ? (docLinkValue(selectedTopic, key) || selectedTopic.draft_doc_url || '') : docLinkValue(selectedTopic, key), '链接已复制')}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 space-y-3 rounded-md border border-slate-200 bg-white p-3">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
              <label className="min-w-0">
                <span className="mb-1.5 block text-xs font-semibold text-slate-500">初稿飞书链接</span>
                <input
                  value={topicDraftLinks[selectedTopic.id] ?? selectedTopic.draft_doc_url ?? ''}
                  onChange={(event) => setTopicDraftLinks((drafts) => ({ ...drafts, [selectedTopic.id]: event.target.value }))}
                  disabled={!canEditTopicMeta(selectedTopic)}
                  placeholder={canEditTopicMeta(selectedTopic) ? '作者提交初稿飞书链接' : '等待作者提交初稿'}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-400 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </label>
              {canEditTopicMeta(selectedTopic) ? (
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
                  disabled={!canEditTopicMeta(selectedTopic)}
                  placeholder={canEditTopicMeta(selectedTopic) ? '写给作者的修改建议，可由 Agent 回传后粘贴' : '暂无编辑建议'}
                  rows={3}
                  className="w-full rounded-md border border-amber-100 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-400 disabled:bg-amber-50 disabled:text-amber-900"
                />
                {canEditTopicMeta(selectedTopic) ? (
                  <button onClick={() => saveTopicEditorNotes(selectedTopic)} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                    推送建议
                  </button>
                ) : null}
              </div>
            </div>
            {canArchiveTopic(selectedTopic) ? (
              <button onClick={() => archiveTopic(selectedTopic)} className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                <Trash2 size={14} />删除选题
              </button>
            ) : null}
          </div>
          </div>
          <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
            {selectedTopic.sub_kind === 'deep' ? (
              <div className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm shadow-emerald-950/5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                      <CalendarDays size={16} />按周推进
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">这块固定在右侧，方便一眼看到进度。</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{deepTopicDraftValue(selectedTopic, 'status')}</span>
                </div>
                {canEditTopicMeta(selectedTopic) ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={deepTopicDraftValue(selectedTopic, 'timelineText')}
                      onChange={(event) => setDeepTopicDraft(selectedTopic, 'timelineText', event.target.value)}
                      rows={5}
                      placeholder="W1：要点整理&#10;W2：采访和资料补齐&#10;W3：写作提纲&#10;W4：初稿"
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm leading-6 outline-none transition focus:border-emerald-400"
                    />
                    <button onClick={() => saveDeepTopicState(selectedTopic)} className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
                      保存 timeline
                    </button>
                  </div>
                ) : null}
                <TopicWeekPlan plans={topicWeekPlans({ ...selectedTopic, timeline_text: deepTopicDraftValue(selectedTopic, 'timelineText') })} currentWeek="W4" compact />
              </div>
            ) : null}
            <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <MessageSquareText size={16} />周会讨论 / 编辑意见
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950">
                {selectedTopic.editor_notes || topicDetailSections(selectedTopic).meetingDiscussion || '第二步解析周会速记后，这里会显示大家围绕这个选题的讨论结果和编辑意见。'}
              </p>
              <div className="mt-4 space-y-2 border-t border-amber-100 pt-3">
                {selectedTopic.meeting_minutes_url ? (
                  <a href={selectedTopic.meeting_minutes_url} target="_blank" rel="noreferrer" className="block text-sm font-medium text-amber-900 hover:text-amber-700">打开周会速记文档</a>
                ) : null}
                {selectedTopic.meeting_doc_url ? (
                  <a href={selectedTopic.meeting_doc_url} target="_blank" rel="noreferrer" className="block text-sm font-medium text-amber-900 hover:text-amber-700">打开周会文档</a>
                ) : null}
              </div>
            </div>
          </aside>
          </div>
        </article>
      ) : selectedEval ? (
        <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
          <button onClick={() => setSelectedEvalId('')} className="mb-5 inline-flex items-center rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            返回测试集列表
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700">Eval 测试集</span>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">{selectedEval.eval_questions?.length || 0} 道题</span>
            {selectedEval.owner_text && !['待分配', '待定'].includes(selectedEval.owner_text) ? (
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">负责人 {selectedEval.owner_text}</span>
            ) : (
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-400">待分配</span>
            )}
          </div>
          <h3 className="mt-4 text-2xl font-semibold tracking-normal text-slate-950">{selectedEval.title}</h3>
          {selectedEval.body ? <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedEval.body}</p> : null}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={() => copyText(window.location.origin + '/p/eval/' + selectedEval.id, '公开链接已复制')} className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500">
              <Link2 size={15} />复制公开链接
            </button>
            {selectedEval.source_url ? (
              <a href={selectedEval.source_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-500 hover:text-slate-900">打开原始飞书文档 ↗</a>
            ) : null}
          </div>
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="text-xs font-semibold text-slate-500">测试模块</p>
            {selectedEval.eval_questions?.length ? (
              <div className="mt-3 space-y-3">
                {selectedEval.eval_questions.map((question, index) => (
                  <div key={question.id} className="rounded-lg border border-violet-100 bg-violet-50/40 p-4">
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
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{question.prompt_text}</p>
                      </div>
                    ) : null}
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {question.input_text ? (
                        <div className="rounded-md bg-white p-3">
                          <p className="text-xs font-semibold text-slate-500">输入 / 素材</p>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{question.input_text}</p>
                        </div>
                      ) : null}
                      {question.expected_output ? (
                        <div className="rounded-md bg-white p-3">
                          <p className="text-xs font-semibold text-slate-500">期望输出</p>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{question.expected_output}</p>
                        </div>
                      ) : null}
                      {question.evaluation_criteria ? (
                        <div className="rounded-md bg-white p-3">
                          <p className="text-xs font-semibold text-slate-500">评测标准</p>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{question.evaluation_criteria}</p>
                        </div>
                      ) : null}
                      {question.reference_answer ? (
                        <div className="rounded-md bg-white p-3">
                          <p className="text-xs font-semibold text-slate-500">参考答案</p>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{question.reference_answer}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">这个测试集还没有解析出测试题。</p>
            )}
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
              {item.kind === 'eval' ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700">Eval 测试集</span>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">{item.eval_questions?.length || 0} 道题</span>
                    {item.project_name ? <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">{item.project_name}</span> : null}
                  </div>
                  <h3 className="mt-3 text-xl font-semibold tracking-normal text-slate-950">{item.title}</h3>
                  <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.body || '还没有补充介绍'}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => setSelectedEvalId(item.id)} className="inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                      查看详情
                    </button>
                    <button onClick={() => copyText(window.location.origin + '/p/eval/' + item.id, '公开链接已复制')} className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-50">
                      <Link2 size={14} />复制公开链接
                    </button>
                  </div>
                </>
              ) : item.kind === 'topic' ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">{topicTypeLabels[item.sub_kind] || kindLabels[item.kind] || 'Memo'}</span>
                    {hasTopicMemo(item) ? <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">有 memo / 文档</span> : null}
                  </div>
                  <h3 className="mt-4 text-xl font-semibold tracking-normal text-slate-950">{item.title}</h3>
                  <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-500">主题</p>
                    <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-700">{topicCardBody(item)}</p>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-500">{item.sub_kind === 'deep' ? '主笔 / 负责人' : '负责人'}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{topicOwnerText(item)}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-500">{item.sub_kind === 'deep' ? '生命周期' : '当前进度'}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{topicProgressText(item)}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => setSelectedTopicId(item.id)} className="inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                      查看详情
                    </button>
                    {canArchiveTopic(item) ? (
                      <button onClick={() => archiveTopic(item)} className="inline-flex items-center justify-center gap-2 rounded-md border border-red-100 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50">
                        <Trash2 size={14} />删除
                      </button>
                    ) : null}
                  </div>
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
                        disabled={!canEditTopicMeta(item)}
                        className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 disabled:bg-emerald-50 disabled:text-emerald-800"
                      />
                      {canEditTopicMeta(item) ? (
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
                        disabled={!canEditTopicMeta(item)}
                        placeholder={canEditTopicMeta(item) ? '写给作者的修改建议，可由 Agent 回传后粘贴' : '暂无编辑建议'}
                        rows={3}
                        className="w-full rounded-md border border-amber-100 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-400 disabled:bg-amber-50 disabled:text-amber-900"
                      />
                      {canEditTopicMeta(item) ? (
                        <button onClick={() => saveTopicEditorNotes(item)} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                          推送建议
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {canArchiveTopic(item) ? (
                    <button onClick={() => archiveTopic(item)} className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                      <Trash2 size={14} />删除
                    </button>
                  ) : null}
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

function TopicBoardStat({ label, value, detail, withMemo, active, waitingDraft }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-400">{detail}</p>
        </div>
        <p className="text-3xl font-semibold text-slate-950">{value}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-white px-3 py-2">
          <p className="font-semibold text-slate-950">{withMemo}</p>
          <p className="mt-0.5 text-slate-500">有 memo / 文档</p>
        </div>
        <div className="rounded-md bg-white px-3 py-2">
          <p className="font-semibold text-slate-950">{active}</p>
          <p className="mt-0.5 text-slate-500">推进中</p>
        </div>
        {waitingDraft !== undefined ? (
          <div className="col-span-2 rounded-md bg-white px-3 py-2">
            <p className="font-semibold text-slate-950">{waitingDraft}</p>
            <p className="mt-0.5 text-slate-500">等待提交初稿</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DeepStageRail({ stages, current }) {
  const currentIndex = Math.max(0, stages.findIndex((stage) => stage.key === current));
  return (
    <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
      {stages.map((stage, index) => {
        const active = index <= currentIndex;
        const currentStage = stage.key === current;
        return (
          <div key={stage.key} className={`rounded-md border p-3 ${currentStage ? 'border-emerald-300 bg-white shadow-sm' : active ? 'border-emerald-100 bg-white/80' : 'border-slate-200 bg-white/50'}`}>
            <p className={`text-sm font-semibold ${active ? 'text-emerald-700' : 'text-slate-500'}`}>{stage.key}</p>
            <div className="mt-2 h-1.5 rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-200'}`} style={{ width: `${active ? stage.progress : 0}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DeepTextArea({ label, value, disabled, placeholder, onChange }) {
  return (
    <label className="mt-3 block">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={4}
        className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition focus:border-emerald-400 disabled:bg-slate-50 disabled:text-slate-500"
      />
    </label>
  );
}

function MemberMultiSelect({ members, value, disabled, onChange }) {
  const selected = String(value || '')
    .split(/[、,，\n]/)
    .map((name) => name.trim())
    .filter(Boolean);
  const selectedSet = new Set(selected);

  function toggle(name) {
    if (disabled) return;
    const next = selectedSet.has(name)
      ? selected.filter((item) => item !== name)
      : [...selected, name];
    onChange(next.join('、'));
  }

  if (!members.length) {
    return (
      <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
        暂无团队成员数据
      </p>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {members.map((name) => {
          const active = selectedSet.has(name);
          return (
            <button
              key={name}
              type="button"
              disabled={disabled}
              onClick={() => toggle(name)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {name}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">已选择：{selected.length ? selected.join('、') : '暂无'}</p>
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

function TopicWeekPlan({ plans, currentWeek, compact = false }) {
  const list = plans.length ? plans : [{ week: 'W1', detail: '等待补充周计划' }];
  function statusFor(week) {
    if (week === currentWeek) return { label: '当前阶段', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
    if (/下周/.test(week)) return { label: '下一阶段', className: 'bg-sky-50 text-sky-700 border-sky-100' };
    const currentNum = Number(String(currentWeek).replace(/\D/g, '') || 0);
    const weekNum = Number(String(week).replace(/\D/g, '') || 0);
    if (weekNum && currentNum && weekNum < currentNum) return { label: '已推进', className: 'bg-slate-100 text-slate-600 border-slate-200' };
    return { label: '待推进', className: 'bg-white text-slate-500 border-slate-200' };
  }
  return (
    <div className={`mt-4 grid gap-3 ${compact ? 'grid-cols-1' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
      {list.map((plan, index) => {
        const status = statusFor(plan.week);
        return (
          <div key={`${plan.week}-${index}`} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">{plan.week}</p>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>{status.label}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{plan.detail}</p>
          </div>
        );
      })}
    </div>
  );
}

function TopicDocLinkInput({ label, value, disabled, onChange, onCopy }) {
  const hasValue = Boolean(String(value || '').trim());
  return (
    <label className={`block rounded-md border p-3 transition ${hasValue ? 'border-emerald-100 bg-emerald-50/40 hover:bg-emerald-50' : 'border-slate-100 bg-slate-50'}`}>
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      {hasValue ? (
        <a href={value} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-600">
          直接打开 <ExternalLink size={13} />
        </a>
      ) : (
        <p className="mt-1 text-sm font-semibold text-slate-400">等待链接</p>
      )}
      <div className="mt-2 flex gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          placeholder="粘贴飞书文档链接"
          className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-emerald-400 disabled:bg-slate-50 disabled:text-slate-500"
        />
        {hasValue ? (
          <button type="button" onClick={onCopy} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100" title="复制链接">
            <Copy size={15} />
          </button>
        ) : null}
      </div>
    </label>
  );
}
