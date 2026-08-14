import { UserCheck, Trash2 } from 'lucide-react';
import { Avatar } from './Avatar';
import { StatusPill } from './StatusPill';
import { Progress } from './Progress';

export function TaskCard({ task, onClaim, onUnclaim, onOpen, onDelete, onAssign, memberOptions = [], currentUserId, compact = false }) {
  const owner = task.owner_id || task.ownerId
    ? { id: task.owner_id || task.ownerId, name: task.owner_name || '子PM', color: 'from-violet-500 to-fuchsia-500', avatar_url: task.owner_avatar }
    : null;

  const collaborators = []; // simplified: we don't need this for now

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 transition hover:border-emerald-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusPill status={task.status} />
            {task.cycle ? <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">{task.cycle}</span> : null}
          </div>
          <h3 className={`${compact ? 'text-base' : 'text-lg'} font-semibold text-slate-950`}>{task.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">{task.summary}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-md bg-slate-50 px-2 py-1">{(task.subtasks || []).length} 个子任务</span>
            <span className="rounded-md bg-slate-50 px-2 py-1">{(task.subtasks || []).filter((s) => s.agent_api_key_prefix).length} 个 Agent 工作包</span>
          </div>
        </div>
        {owner ? (
          <div className="shrink-0 text-center">
            <Avatar member={owner} size="lg" pm />
            <p className="mt-2 text-xs text-emerald-700">子PM</p>
          </div>
        ) : (
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-md border border-dashed border-slate-200 text-slate-400">
            <UserCheck size={22} />
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span>进度</span>
          <span>{task.progress}%</span>
        </div>
        <Progress value={task.progress} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {!owner ? <span className="text-sm text-slate-500">暂未认领</span> : null}
          {onAssign ? (
            <select
              value={task.owner_id || ''}
              onChange={(event) => onAssign(event.target.value)}
              className="max-w-40 rounded-md border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 outline-none transition focus:border-emerald-400"
            >
              <option value="">指派子 PM...</option>
              {memberOptions.map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="flex gap-2">
          {owner ? (
            <>
              {onUnclaim ? (
                <button onClick={onUnclaim} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 transition hover:bg-red-100">取消认领</button>
              ) : null}
              <button onClick={() => onOpen?.(task.id)} className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50">进入任务</button>
            </>
          ) : (
            <button onClick={() => onClaim?.(task.id)} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
              认领成为子 PM
            </button>
          )}
          {onDelete ? (
            <button
              onClick={onDelete}
              title="删除任务"
              className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
