import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Bot, CheckCircle2, ChevronUp, Copy, FileText, KeyRound, LogOut, Radio } from 'lucide-react';
import { get, post } from '../lib/api';
import { useStore } from '../store';
import { Avatar } from './ui/Avatar';

export function AgentAccountMenu() {
  const { currentUser } = useStore();
  const [open, setOpen] = useState(false);
  const [access, setAccess] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function onDocClick(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (open) loadAccess();
  }, [open]);

  async function loadAccess() {
    const res = await get('/api/auth/me/agent');
    if (res.ok) setAccess(res.data);
  }

  async function generateKey() {
    const res = await post('/api/auth/me/agent-key', {});
    if (res.ok) {
      setApiKey(res.data.apiKey);
      setAccess(res.data.access);
      toast.success('我的 Agent Key 已生成，只显示这一次');
    } else {
      toast.error(res.error || '生成失败');
    }
  }

  async function copyText(text, message) {
    if (!text) {
      toast.error('还没有可复制的内容');
      return;
    }
    await navigator.clipboard.writeText(text);
    toast.success(message);
  }

  async function logout() {
    try { await post('/api/auth/logout'); } catch {}
    window.location.reload();
  }

  const connection = access?.connection;
  const connected = connection?.status === 'connected';
  const client = connection?.client_name || '未接入';

  return (
    <div className="relative" ref={ref}>
      {open ? (
        <div className="absolute bottom-full left-0 z-40 mb-3 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-950/10">
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="flex items-center gap-3">
              <Avatar member={{ name: currentUser?.name, avatar_url: currentUser?.avatar_url }} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{currentUser?.name || '我'}</p>
                <p className="truncate text-xs text-slate-500">{currentUser?.email || '飞书账号'}</p>
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-950"><Radio size={15} />接入状态</p>
                <p className="mt-1 text-xs text-slate-500">{connected ? `${client} 已接入` : '还没有 Agent 回传 hello'}</p>
              </div>
              <span className={`rounded-md px-2 py-1 text-xs font-medium ${connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {connected ? '在线' : '未接入'}
              </span>
            </div>
            {connection?.message ? <p className="mt-2 rounded-md bg-emerald-50 p-2 text-xs leading-5 text-emerald-800">{connection.message}</p> : null}
            {connection?.last_seen_at ? <p className="mt-2 text-xs text-slate-400">最后回传：{connection.last_seen_at}</p> : null}
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-950"><KeyRound size={15} />我的 Key</p>
              <button
                onClick={() => copyText(apiKey, 'Key 已复制')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                title="复制 Key"
              >
                <Copy size={15} />
              </button>
            </div>
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="truncate font-mono text-xs text-slate-600">{apiKey || access?.keyPrefix || '还没有生成个人 Agent Key'}</p>
            </div>
            <div className="mt-3">
              <button onClick={generateKey} className="w-full rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500">
                {access?.hasKey ? '重新生成' : '生成 Key'}
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => copyText(access?.instructions, '个人 Agent 说明书已复制')} className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <FileText size={13} />复制说明书
            </button>
            <button onClick={() => copyText(`POST /api/agent/user/hello\nAuthorization: Bearer <我的 Key>\n{ "client": "codex", "message": "我已接入 PM Board" }`, '接入测试说明已复制')} className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <CheckCircle2 size={13} />测试接入
            </button>
          </div>

          <button onClick={logout} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">
            <LogOut size={13} />退出登录
          </button>
        </div>
      ) : null}

      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm shadow-slate-950/5 transition hover:bg-slate-50"
      >
        <Avatar member={{ name: currentUser?.name, avatar_url: currentUser?.avatar_url }} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-950">我</p>
          <p className="truncate text-xs text-slate-500">{connected ? `Agent: ${client}` : '我的 Key / Agent 接入'}</p>
        </div>
        <Bot size={16} className="text-emerald-600" />
        <ChevronUp size={14} className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
    </div>
  );
}
