import { UserCheck, Trash2 } from 'lucide-react';
import { Avatar } from './Avatar';
import { StatusPill } from './StatusPill';
import { Progress } from './Progress';

export function TaskCard({ task, onClaim, onUnclaim, onOpen, onDelete, currentUserId, compact = false }) {
  const owner = task.owner_id || task.ownerId
    ? { id: task.owner_id || task.ownerId, name: task.owner_name || '子PM', color: 'from-violet-500 to-fuchsia-500', avatar_url: task.owner_avatar }
    : null;

  const collaborators = []; // simplified: we don't need this for now

  return (
    <article className="rounded-lg border border-white/10 bg-[#151925] p-4 transition hover:border-violet-400/40">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusPill status={task.status} />
            {task.cycle ? <span className="rounded bg-white/8 px-2 py-1 text-xs text-slate-400">{task.cycle}</span> : null}
          </div>
          <h3 className="text-lg font-semibold text-white">{task.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{task.summary}</p>
        </div>
        {owner ? (
          <div className="shrink-0 text-center">
            <Avatar member={owner} size="lg" pm />
            <p className="mt-2 text-xs text-violet-200">子PM</p>
          </div>
        ) : (
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-md border border-dashed border-white/20 text-slate-500">
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
        <div className="flex items-center">
          {!owner ? <span className="text-sm text-slate-500">暂未认领</span> : null}
        </div>
        <div className="flex gap-2">
          {owner ? (
            <>
              {onUnclaim ? (
                <button onClick={onUnclaim} className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200 transition hover:bg-red-500/20">取消认领</button>
              ) : null}
              <button onClick={() => onOpen?.(task.id)} className="rounded-md border border-white/10 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/8">进入子项目</button>
            </>
          ) : (
            <button onClick={() => onClaim?.(task.id)} className="rounded-md bg-violet-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-400">
              认领
            </button>
          )}
          {onDelete ? (
            <button
              onClick={onDelete}
              title="删除任务"
              className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-slate-500 transition hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
