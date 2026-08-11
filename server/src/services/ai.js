import { config } from '../config.js';

const SYSTEM_PROMPT = `你是专业的项目管理和任务拆解助手。请根据用户提供的项目信息，把项目拆解成 5-8 个可执行的任务，每个任务下再拆 2-5 个子任务。
只输出一个 JSON 对象，不要输出任何解释文字、Markdown 代码块或其他内容。格式如下：
{"tasks":[{"title":"任务标题","summary":"一句话说明任务目标","cycle":"周期，如 第1周","subtasks":[{"title":"子任务标题","note":"备注，可为空字符串"}]}]}`;

export async function splitTasks({ name, description, planMarkdown }) {
  if (!config.aiApiKey || !config.aiBaseUrl) {
    throw new Error('AI 未配置，请在 server/.env 配置 AI_BASE_URL / AI_API_KEY / AI_MODEL');
  }

  const userContent = `项目名称：${name || ''}\n项目描述：${description || ''}\n项目计划书：\n${planMarkdown || ''}`;

  let res;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.aiTimeoutMs);
  try {
    res = await fetch(`${config.aiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.aiApiKey}`,
      },
      body: JSON.stringify({
        model: config.aiModel,
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
    subtasks: Array.isArray(t.subtasks)
      ? t.subtasks.map((s) => ({ title: (s.title || '').trim(), note: (s.note || '').trim() }))
      : [],
  })).filter((t) => t.title);
}
