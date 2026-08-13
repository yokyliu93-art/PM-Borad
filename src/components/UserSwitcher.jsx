import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, LogOut, Plus, Trash2, UserRound } from 'lucide-react';
import { useStore } from '../store';
import { get, post, del } from '../lib/api';
import { Avatar } from './ui/Avatar';

export function UserSwitcher({ variant = 'header' }) {
  const { currentUser } = useStore();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const loadUsers = useCallback(async () => {
    if (!currentUser?.devLoginEnabled) return;
    setLoading(true);
    try {
      const res = await get('/api/auth/users');
      if (res.ok) setUsers(res.data || []);
    } catch {}
    setLoading(false);
  }, [currentUser]);

  useEffect(() => {
    if (open && currentUser?.devLoginEnabled) loadUsers();
  }, [open, loadUsers, currentUser]);

  function switchTo(id) {
    setOpen(false);
    window.location.href = `/api/auth/dev-login?user=${id}`;
  }

  async function logout() {
    setOpen(false);
    try { await post('/api/auth/logout'); } catch {}
    window.location.reload();
  }

  async function handleAdd() {
    const name = window.prompt('输入新账号的名称');
    if (!name || !name.trim()) return;
    try {
      const res = await post('/api/auth/users', { name: name.trim() });
      if (res.ok) {
        toast.success(`账号「${res.data.name}」已创建`);
        loadUsers();
      } else {
        toast.error(res.error || '创建失败');
      }
    } catch {
      toast.error('创建失败，请确认后端已启动');
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`确定删除账号「${name}」？\n该账号的认领、进度、附件等数据将一并清除，不可恢复。`)) return;
    try {
      const res = await del(`/api/auth/users/${id}`);
      if (res.ok) {
        toast.success(`账号「${name}」已删除`);
        loadUsers();
      } else {
        toast.error(res.error || '删除失败');
      }
    } catch {
      toast.error('删除失败，请确认后端已启动');
    }
  }

  const list = users.some((u) => u.id === currentUser?.id)
    ? users
    : [currentUser, ...users].filter(Boolean);

  const triggerCls = variant === 'light'
    ? 'bg-[#2d2823] text-white border-[#2d2823]'
    : 'border-white/10 bg-white/[0.03] text-white';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition ${triggerCls}`}
        title={currentUser ? '切换账号' : '登录'}
      >
        {currentUser ? (
          <Avatar member={{ name: currentUser.name, avatar_url: currentUser.avatar_url, color: 'from-violet-500 to-fuchsia-500' }} size="xs" />
        ) : (
          <UserRound size={15} />
        )}
        <span>{currentUser?.name || '登录'}</span>
        <ChevronDown size={14} className="opacity-70" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-60 rounded-lg border border-white/10 bg-[#151925] p-2 shadow-2xl">
          {currentUser?.devLoginEnabled && (
            <>
              <p className="px-2 pb-1 pt-1 text-xs text-slate-500">切换PM账号</p>
              {loading && users.length === 0 ? (
                <p className="px-2 py-2 text-xs text-slate-500">加载中...</p>
              ) : (
                list.map((u) => (
                  <div key={u.id} className="group flex items-center">
                    <button
                      onClick={() => switchTo(u.id)}
                      className={`flex w-full flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition hover:bg-white/8 ${
                        u.id === currentUser?.id ? 'text-violet-200' : 'text-slate-200'
                      }`}
                    >
                      <Avatar member={{ name: u.name, color: 'from-violet-500 to-fuchsia-500' }} size="xs" />
                      <span className="flex-1 truncate">{u.name}</span>
                      {u.id === currentUser?.id && <span className="text-[10px] text-violet-300">当前</span>}
                    </button>
                    {u.id !== currentUser?.id && (
                      <button
                        onClick={() => handleDelete(u.id, u.name)}
                        title="删除账号"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-600 transition hover:bg-red-500/10 hover:text-red-300"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))
              )}
              <div className="my-1 border-t border-white/10" />
              <button
                onClick={handleAdd}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-violet-200 transition hover:bg-violet-500/10"
              >
                <Plus size={14} /> 新增账号
              </button>
            </>
          )}
          <button
            onClick={logout}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-red-300/90 transition hover:bg-red-500/10 ${
              currentUser?.devLoginEnabled ? 'mt-0.5' : ''
            }`}
          >
            <LogOut size={14} /> 退出登录
          </button>
        </div>
      )}
    </div>
  );
}
