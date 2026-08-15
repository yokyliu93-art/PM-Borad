import { config } from '../config.js';

const AI_JSON_MAX_TOKENS = Number(process.env.AI_JSON_MAX_TOKENS || 12000);

const SYSTEM_PROMPT = `你是专业的项目管理和任务拆解助手。请根据用户提供的项目信息，把项目拆解成 5-8 个可执行的任务，每个任务下再拆 2-5 个子任务。
只输出一个 JSON 对象，不要输出任何解释文字、Markdown 代码块或其他内容。格式如下：
{"tasks":[{"title":"任务标题","summary":"一句话说明任务目标","cycle":"周期，如 第1周","idea":"这块任务背后的核心想法","executionPlan":"执行方案","resourcePlan":"资源配合","subtasks":[{"title":"子任务标题","note":"备注，可为空字符串"}]}]}`;

const DETAIL_PROMPT = `你是专业的项目管理助手。请把输入的任务说明书细化为可交给 Agent 执行的工作包。
只输出 JSON 对象，不要输出解释或 Markdown。格式：
{"idea":"想法：为什么做、判断标准、关键假设","executionPlan":"执行方案：阶段、动作、验收标准、风险","resourcePlan":"资源配合：需要谁、需要什么材料/权限/预算/文档","agentInstructions":"给 Agent 的详细说明书，明确边界、输出物、回传 PM Board 的要求","subtasks":[{"title":"建议子任务","note":"说明","steps":[{"title":"执行步骤"}],"schedule":[{"weekIndex":1,"goal":"周目标","reminderDay":1,"reminderTime":"10:00"}]}]}`;

const AUDIT_PROMPT = `你是总 PM 的审核 Agent。请审核子 PM 或执行 Agent 回传的工作文件，指出问题并给出建议。
只输出 JSON 对象，不要输出解释或 Markdown。格式：
{"decision":"通过/需要修改/风险较高","score":0-100,"issues":["问题"],"suggestions":["建议"],"missingResources":["缺少的资源"],"nextQuestions":["需要追问的问题"]}`;

const TOPIC_PARSE_PROMPT = `你是硅星人内容编辑部的选题统筹助手。请根据周会文档抽取候选选题并归类。
如果周会文档里有「其他」栏目，尤其是写着“大厂报道、商务合作、灵活内容、小绿书”等内容，这一栏里的选题全部归入 businessTopics，不要归入 dailyTopics。
只输出 JSON 对象，不要输出解释或 Markdown。格式：
{"dailyTopics":[{"title":"日常选题标题","owner":"负责人姓名","firstDraftAt":"交稿日期，如 8月16日/下周三；如果文档没有明确日期就留空","summary":"当前进展和需要做什么"}],"businessTopics":[{"title":"商务选题标题","owner":"负责人姓名","firstDraftAt":"交稿日期或空","summary":"商务需求、客户/合作背景、当前要做什么"}],"deepTopics":[{"title":"深度选题标题","owner":"负责人姓名","firstDraftAt":"首稿或阶段稿时间，没有则留空","summary":"选题背景和当前阶段","timeline":[{"week":"W1","detail":"目标、动作、负责人和交付物"}],"resources":"需要谁配合、需要什么资料"}],"weeklyRecommendations":[{"title":"本周项目推荐标题","owner":"负责人姓名","firstDraftAt":"交稿日期或空","summary":"推荐理由、项目亮点和要做什么"}],"frontierTopics":[{"title":"Frontier 研究/项目/产品名称","owner":"负责人姓名","summary":"一句话介绍","reason":"人们为什么必须关注","resources":"链接、memo 或下一步操作"}],"promptTopics":[{"title":"Prompt PR 项目或主题","owner":"负责人姓名","firstDraftAt":"交稿日期或空","summary":"当前要做什么、需要谁配合"}]}`;

const TOPIC_DISCUSSION_PROMPT = `你是硅星人内容编辑部的周会速记整理助手。请把周会速记里的讨论内容匹配到已经确认的选题上。
输入会给你已有选题列表，每个选题有 topicId、title、type、owner。你只能给这些已有选题补充讨论纪要，不要新建选题。
只输出 JSON 对象，不要输出解释或 Markdown。格式：
{"discussions":[{"topicId":"必须来自已有选题列表的 topicId","title":"选题标题","discussion":"周会上围绕这个选题讨论了什么，包括角度判断、反对意见、信息增量、需要补的材料","editorNotes":"编辑建议和下一步动作，写给负责人看","confidence":0.8}]}`;

const EVAL_PARSE_PROMPT = `你是硅星人 Eval 测试集整理助手。请根据飞书文档内容，整理成 PM Board 里的共享测试集模块，并把测试集拆成一道一道可复制给模型测试的问题。
只输出 JSON 对象，不要输出解释或 Markdown。格式：
{"title":"测试集名称","owner":"负责人姓名或待分配","progress":0,"summary":"测试目标、覆盖范围、使用方式和当前状态","timeline":[{"phase":"阶段或时间","detail":"要做什么、负责人、交付物或验收标准"}],"questions":[{"title":"第 1 题标题","prompt":"可直接复制给模型的完整 prompt","input":"题目所需素材、上下文、链接或变量","expectedOutput":"期望输出格式或交付物","evaluationCriteria":"评分标准、通过条件、扣分点","referenceAnswer":"可选参考答案或标杆输出"}]}`;

export async function splitTasks({ name, description, planMarkdown }) {
  const provider = getAIProvider();
  if (!provider.apiKey || !provider.baseUrl) {
    throw new Error('AI 未配置，请在 server/.env 配置 AI_BASE_URL / AI_API_KEY / AI_MODEL');
  }

  const userContent = `项目名称：${name || ''}\n项目描述：${description || ''}\n项目计划书：\n${planMarkdown || ''}`;

  let res;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.aiTimeoutMs);
  try {
    res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        temperature: 0.4,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
  } catch {
    throw new Error(
      controller.signal.aborted
        ? `AI 服务响应超时（${config.aiTimeoutMs / 1000}秒），请重试`
        : '无法连接 AI 服务，请检查网络或 AI_BASE_URL 配置'
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI 服务返回错误（${res.status}）：${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI 未返回有效内容');

  const tasks = parseTasks(content);
  if (tasks.length === 0) throw new Error('AI 返回的任务列表为空，请重试');
  return tasks;
}

export async function refineTaskPackage({ project, task, subtasks = [] }) {
  const userContent = [
    `项目：${project?.name || ''}`,
    project?.description ? `项目简介：${project.description}` : '',
    project?.plan_markdown ? `项目计划书：\n${project.plan_markdown}` : '',
    `任务块：${task?.title || ''}`,
    task?.summary ? `当前说明：${task.summary}` : '',
    task?.agent_instructions ? `当前 Agent 说明书：\n${task.agent_instructions}` : '',
    subtasks.length ? `已有子任务：\n${subtasks.map((s) => `- ${s.title}: ${s.note || ''}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
  return callAIJson({ systemPrompt: DETAIL_PROMPT, userContent, fallbackError: 'AI 细化任务失败' });
}

export async function auditAgentFile({ project, task, payload }) {
  const userContent = [
    `项目：${project?.name || ''}`,
    project?.plan_markdown ? `项目计划书：\n${project.plan_markdown}` : '',
    task ? `任务块：${task.title}\n${task.summary || ''}` : '',
    `待审核内容：\n${typeof payload === 'string' ? payload : JSON.stringify(payload || {}, null, 2)}`,
  ].filter(Boolean).join('\n\n');
  return callAIJson({ systemPrompt: AUDIT_PROMPT, userContent, fallbackError: 'AI 审核失败' });
}

export async function parseWeeklyTopics({ meetingDoc, meetingNotes }) {
  const userContent = buildTopicParseInput({ meetingDoc, meetingNotes });
  const parsed = await callAIJson({
    systemPrompt: TOPIC_PARSE_PROMPT,
    userContent,
    fallbackError: 'DeepSeek 解析周会选题失败',
  });
  return {
    dailyTopics: Array.isArray(parsed.dailyTopics) ? parsed.dailyTopics : [],
    businessTopics: Array.isArray(parsed.businessTopics) ? parsed.businessTopics : [],
    deepTopics: Array.isArray(parsed.deepTopics) ? parsed.deepTopics : [],
    weeklyRecommendations: Array.isArray(parsed.weeklyRecommendations) ? parsed.weeklyRecommendations : [],
    frontierTopics: Array.isArray(parsed.frontierTopics) ? parsed.frontierTopics : [],
    promptTopics: Array.isArray(parsed.promptTopics) ? parsed.promptTopics : [],
  };
}

export async function parseTopicDiscussions({ topics = [], meetingNotes }) {
  const topicList = topics.map((topic) => ({
    topicId: topic.id,
    title: topic.title,
    type: topic.sub_kind,
    owner: topic.owner_text,
  }));
  const userContent = [
    `已有选题列表：\n${JSON.stringify(topicList, null, 2)}`,
    `周会速记链接：${meetingNotes?.url || ''}`,
    meetingNotes?.title ? `周会速记标题：${meetingNotes.title}` : '',
    meetingNotes?.content ? `周会速记相关片段：\n${topicRelevantExcerpt(meetingNotes.content, 36000)}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 52000);
  const parsed = await callAIJson({
    systemPrompt: TOPIC_DISCUSSION_PROMPT,
    userContent,
    fallbackError: 'DeepSeek 解析周会讨论失败',
  });
  return {
    discussions: Array.isArray(parsed.discussions) ? parsed.discussions.map((item) => ({
      topicId: String(item.topicId || item.topic_id || '').trim(),
      title: String(item.title || '').trim(),
      discussion: String(item.discussion || item.meetingDiscussion || '').trim(),
      editorNotes: String(item.editorNotes || item.editor_notes || item.notes || '').trim(),
      confidence: Number(item.confidence || 0),
    })).filter((item) => item.topicId && (item.discussion || item.editorNotes)) : [],
  };
}

function buildTopicParseInput({ meetingDoc, meetingNotes }) {
  const docExcerpt = topicRelevantExcerpt(meetingDoc?.content || '', 12000);
  return [
    `周会文档链接：${meetingDoc?.url || ''}`,
    meetingDoc?.title ? `周会文档标题：${meetingDoc.title}` : '',
    docExcerpt ? `周会文档选题相关片段：\n${docExcerpt}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 42000);
}

const TOPIC_KEYWORDS = /选题|题目|主题|负责人|负责|初稿|截稿|稿|文章|报道|采访|约访|试用|体验|Demo|demo|深度|日常|商务|其他|小绿书|Frontier|Prompt|PR|专题|系列|发布|上线|推荐|Builder|GAI|GenAI|下周|本周|时间|进度|排期|timeline|讨论|确定|待定|王兆洋|刘雨琦|樊雅婷|孙芮|董道力|潘仁浩|饶上|温新炮|周一笑|李楠/i;

function topicRelevantExcerpt(content = '', limit = 20000) {
  const text = String(content || '').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return '';
  if (text.length <= limit) return text;

  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const selected = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    if (!TOPIC_KEYWORDS.test(lines[i])) continue;
    for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 2); j += 1) {
      const line = lines[j];
      if (seen.has(line)) continue;
      selected.push(line);
      seen.add(line);
    }
  }
  const relevant = selected.join('\n');
  const head = text.slice(0, Math.min(5000, Math.floor(limit * 0.25)));
  const tail = text.slice(-Math.min(3000, Math.floor(limit * 0.15)));
  return [head, relevant, tail].filter(Boolean).join('\n\n---\n\n').slice(0, limit);
}

export async function parseEvalDoc({ doc }) {
  const userContent = [
    `测试集文档链接：${doc?.url || ''}`,
    doc?.title ? `文档标题：${doc.title}` : '',
    doc?.content ? `文档内容：\n${doc.content}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 60000);
  const parsed = await callAIJson({
    systemPrompt: EVAL_PARSE_PROMPT,
    userContent,
    fallbackError: 'DeepSeek 解析 Eval 测试集失败',
  });
  return {
    title: String(parsed.title || doc?.title || '未命名测试集').trim(),
    owner: String(parsed.owner || '待分配').trim(),
    progress: Math.min(100, Math.max(0, Math.round(Number(parsed.progress || 0)))),
    summary: String(parsed.summary || doc?.content || '').trim(),
    timeline: Array.isArray(parsed.timeline) ? parsed.timeline : [],
    questions: Array.isArray(parsed.questions) ? parsed.questions.map((question, index) => ({
      title: String(question.title || `第 ${index + 1} 题`).trim(),
      prompt: String(question.prompt || question.promptText || '').trim(),
      input: String(question.input || question.inputText || question.material || '').trim(),
      expectedOutput: String(question.expectedOutput || question.expected_output || '').trim(),
      evaluationCriteria: String(question.evaluationCriteria || question.evaluation_criteria || question.criteria || '').trim(),
      referenceAnswer: String(question.referenceAnswer || question.reference_answer || '').trim(),
    })).filter((question) => question.title || question.prompt || question.input) : [],
  };
}

async function callAIJson({ systemPrompt, userContent, fallbackError }) {
  const provider = getAIProvider();
  if (!provider.apiKey || !provider.baseUrl) {
    throw new Error('AI 未配置，请在 server/.env 配置 DEEPSEEK_API_KEY，或配置 AI_BASE_URL / AI_API_KEY / AI_MODEL');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.aiTimeoutMs);
  let res;
  try {
    res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.3,
        max_tokens: AI_JSON_MAX_TOKENS,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
  } catch {
    throw new Error(controller.signal.aborted ? `AI 服务响应超时（${config.aiTimeoutMs / 1000}秒）` : '无法连接 AI 服务');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${fallbackError}（${res.status}）：${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const finishReason = data?.choices?.[0]?.finish_reason || '';
  if (!content) {
    console.error('[ai] empty content', {
      model: provider.model,
      finishReason,
      reasoningLength: String(data?.choices?.[0]?.message?.reasoning_content || '').length,
    });
    throw new Error(finishReason === 'length' ? 'AI 输出被截断，请缩短文档内容后重试' : 'AI 未返回有效内容');
  }
  try {
    return parseJsonObject(content);
  } catch (err) {
    console.error('[ai] invalid json content', {
      model: provider.model,
      finishReason,
      contentLength: String(content || '').length,
      preview: String(content || '').slice(0, 240),
    });
    throw err;
  }
}

function getAIProvider() {
  if (config.deepseekApiKey) {
    return {
      baseUrl: config.deepseekBaseUrl.replace(/\/$/, ''),
      apiKey: config.deepseekApiKey,
      model: config.deepseekModel,
    };
  }
  return {
    baseUrl: config.aiBaseUrl.replace(/\/$/, ''),
    apiKey: config.aiApiKey,
    model: config.aiModel,
  };
}

function parseJsonObject(content) {
  let text = String(content || '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const json = extractJson(text, '{', '}');
  try {
    return JSON.parse(json || text);
  } catch {
    throw new Error('AI 返回的 JSON 无法解析，请重试');
  }
}

function parseTasks(content) {
  let text = content.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const json = extractJson(text, '{', '}');
  let parsed;
  try {
    parsed = JSON.parse(json || text);
  } catch {
    throw new Error('AI 返回的 JSON 无法解析，请重试');
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.tasks;
  if (!Array.isArray(list)) throw new Error('AI 返回格式不正确，缺少 tasks 数组');
  return list.map((t) => ({
    title: (t.title || '').trim(),
    summary: (t.summary || '').trim(),
    cycle: (t.cycle || '').trim(),
    idea_text: (t.idea || t.ideaText || t.idea_text || '').trim(),
    execution_plan: (t.executionPlan || t.execution_plan || '').trim(),
    resource_plan: (t.resourcePlan || t.resource_plan || '').trim(),
    subtasks: Array.isArray(t.subtasks)
      ? t.subtasks.map((s) => ({ title: (s.title || '').trim(), note: (s.note || '').trim() }))
      : [],
  })).filter((t) => t.title);
}

function extractJson(text, openChar, closeChar) {
  const start = text.indexOf(openChar);
  if (start < 0) return '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = inString;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === openChar) depth += 1;
    if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return '';
}
