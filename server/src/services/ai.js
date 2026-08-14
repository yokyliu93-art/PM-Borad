import { config } from '../config.js';

const SYSTEM_PROMPT = `你是专业的项目管理和任务拆解助手。请根据用户提供的项目信息，把项目拆解成 5-8 个可执行的任务，每个任务下再拆 2-5 个子任务。
只输出一个 JSON 对象，不要输出任何解释文字、Markdown 代码块或其他内容。格式如下：
{"tasks":[{"title":"任务标题","summary":"一句话说明任务目标","cycle":"周期，如 第1周","idea":"这块任务背后的核心想法","executionPlan":"执行方案","resourcePlan":"资源配合","subtasks":[{"title":"子任务标题","note":"备注，可为空字符串"}]}]}`;

const DETAIL_PROMPT = `你是专业的项目管理助手。请把输入的任务说明书细化为可交给 Agent 执行的工作包。
只输出 JSON 对象，不要输出解释或 Markdown。格式：
{"idea":"想法：为什么做、判断标准、关键假设","executionPlan":"执行方案：阶段、动作、验收标准、风险","resourcePlan":"资源配合：需要谁、需要什么材料/权限/预算/文档","agentInstructions":"给 Agent 的详细说明书，明确边界、输出物、回传 PM Board 的要求","subtasks":[{"title":"建议子任务","note":"说明","steps":[{"title":"执行步骤"}],"schedule":[{"weekIndex":1,"goal":"周目标","reminderDay":1,"reminderTime":"10:00"}]}]}`;

const AUDIT_PROMPT = `你是总 PM 的审核 Agent。请审核子 PM 或执行 Agent 回传的工作文件，指出问题并给出建议。
只输出 JSON 对象，不要输出解释或 Markdown。格式：
{"decision":"通过/需要修改/风险较高","score":0-100,"issues":["问题"],"suggestions":["建议"],"missingResources":["缺少的资源"],"nextQuestions":["需要追问的问题"]}`;

const TOPIC_PARSE_PROMPT = `你是硅星人内容编辑部的选题统筹助手。请根据周会文档和周会妙记，抽取选题并归类。
只输出 JSON 对象，不要输出解释或 Markdown。格式：
{"dailyTopics":[{"title":"日常选题标题","owner":"负责人姓名","firstDraftAt":"初稿时间，如 8月16日/下周三/待定","summary":"当前进展和需要做什么"}],"deepTopics":[{"title":"深度选题标题","owner":"负责人姓名","firstDraftAt":"首稿或阶段稿时间","summary":"选题背景和当前阶段","timeline":[{"week":"W1","detail":"目标、动作、负责人和交付物"}],"resources":"需要谁配合、需要什么资料"}]}`;

const EVAL_PARSE_PROMPT = `你是硅星人 Eval 测试集整理助手。请根据飞书文档内容，整理成 PM Board 里的共享测试集模块。
只输出 JSON 对象，不要输出解释或 Markdown。格式：
{"title":"测试集名称","owner":"负责人姓名或待分配","progress":0,"summary":"测试目标、覆盖范围、使用方式和当前状态","timeline":[{"phase":"阶段或时间","detail":"要做什么、负责人、交付物或验收标准"}]}`;

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

export async function parseWeeklyTopics({ meetingDoc, meetingMinutes }) {
  const userContent = [
    `周会文档链接：${meetingDoc?.url || ''}`,
    meetingDoc?.content ? `周会文档内容：\n${meetingDoc.content}` : '',
    `周会妙记链接：${meetingMinutes?.url || ''}`,
    meetingMinutes?.content ? `周会妙记内容：\n${meetingMinutes.content}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 60000);
  const parsed = await callAIJson({
    systemPrompt: TOPIC_PARSE_PROMPT,
    userContent,
    fallbackError: 'DeepSeek 解析周会选题失败',
  });
  return {
    dailyTopics: Array.isArray(parsed.dailyTopics) ? parsed.dailyTopics : [],
    deepTopics: Array.isArray(parsed.deepTopics) ? parsed.deepTopics : [],
  };
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
        max_tokens: 5000,
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
  if (!content) throw new Error('AI 未返回有效内容');
  return parseJsonObject(content);
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
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  try {
    return JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
  } catch {
    throw new Error('AI 返回的 JSON 无法解析，请重试');
  }
}

function parseTasks(content) {
  let text = content.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  let parsed;
  try {
    parsed = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
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
