import db from '../db/connection.js';
import * as feishuPushService from './feishuPush.js';

function currentReminderWindow() {
  const now = new Date();
  const jsDay = now.getDay();
  const reminderDay = jsDay === 0 ? 7 : jsDay;
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return {
    dateKey: now.toISOString().slice(0, 10),
    reminderDay,
    hhmm: `${hh}:${mm}`,
  };
}

async function sendDueRemindersOnce() {
  const { dateKey, reminderDay, hhmm } = currentReminderWindow();
  const rows = db.prepare(`
    SELECT
      si.*,
      s.title as subtask_title,
      s.feishu_chat_id,
      t.title as task_title,
      p.name as project_name
    FROM subtask_schedule_items si
    JOIN subtasks s ON s.id = si.subtask_id
    JOIN tasks t ON t.id = si.task_id
    JOIN projects p ON p.id = t.project_id
    WHERE si.reminder_enabled = 1
      AND s.feishu_push_enabled = 1
      AND s.feishu_chat_id != ''
      AND si.reminder_day = ?
      AND si.reminder_time <= ?
      AND si.status != '已完成'
      AND (si.last_reminded_at IS NULL OR substr(si.last_reminded_at, 1, 10) != ?)
  `).all(reminderDay, hhmm, dateKey);

  for (const row of rows) {
    try {
      await feishuPushService.sendTextToChat(row.feishu_chat_id, [
        `PM Board 周提醒：${row.project_name} / ${row.task_title}`,
        `子任务：${row.subtask_title}`,
        `第 ${row.week_index} 周目标：${row.goal || '请更新本周进展'}`,
        row.delivery_doc_url ? `交付文档：${row.delivery_doc_url}` : '请在 PM Board 或 Agent 接口补充飞书交付文档。',
      ].join('\n'));
      db.prepare("UPDATE subtask_schedule_items SET last_reminded_at = datetime('now') WHERE id = ?").run(row.id);
    } catch (err) {
      console.error('[reminder] Feishu push failed:', err.userMessage || err.message);
    }
  }
}

export function startReminderWorker() {
  const intervalMs = 5 * 60 * 1000;
  setTimeout(sendDueRemindersOnce, 10_000);
  setInterval(sendDueRemindersOnce, intervalMs);
}
