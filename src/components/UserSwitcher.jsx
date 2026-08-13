import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, LogOut, Pencil, Plus, Save, Trash2, UserRound } from 'lucide-react';
import { useStore } from '../store';
import { get, post, put, del } from '../lib/api';
import { Avatar } from './ui/Avatar';

export function UserSwitcher({ variant = 'header' }) {
  const { currentUser, setCurrentUser } = useStore();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ name: '', avatarUrl: '' });
  const [savingProfile, setSavingProfile] = useState(false);
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

  useEffect(() => {
    if (!open || !currentUser) return;
    setProfileDraft({
      name: currentUser.name || '',
      avatarUrl: currentUser.avatar_url || currentUser.avatar || '',
    });
  }, [open, currentUser]);

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

  async function handleSaveProfile() {
    if (!profileDraft.name.trim()) {
      toast.error('昵称不能为空');
      return;
    }
    setSavingProfile(true);
    try {
      const res = await put('/api/auth/me', {
        name: profileDraft.name.trim(),
        avatarUrl: profileDraft.avatarUrl.trim(),
      });
      if (res.ok) {
        setCurrentUser(res.data);
        setEditingProfile(false);
        toast.success('个人资料已保存');
      } else {
        toast.error(res.error || '保存失败');
      }
    } catch {
      toast.error('保存失败，请确认后端已启动');
    } finally {
      setSavingProfile(false);
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
        <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-lg border border-white/10 bg-[#151925] p-2 shadow-2xl">
          {currentUser && (
            <div className="mb-1 rounded-md border border-white/10 bg-white/[0.03] p-3">
              {editingProfile ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Avatar member={{ name: profileDraft.name, avatar_url: profileDraft.avatarUrl, color: 'from-violet-500 to-fuchsia-500' }} size="sm" />
                    <div className="min-w-0 flex-1">
                      <input
                        value={profileDraft.name}
                        onChange={(e) => setProfileDraft((d) => ({ ...d, name: e.target.value }))}
                        placeholder="昵称"
                        className="w-full rounded-md border border-white/10 bg-[#0c0f16] px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-violet-400/60"
                      />
                    </div>
                  </div>
                  <input
                    value={profileDraft.avatarUrl}
                    onChange={(e) => setProfileDraft((d) => ({ ...d, avatarUrl: e.target.value }))}
                    placeholder="头像图片链接"
                    className="w-full rounded-md border border-white/10 bg-[#0c0f16] px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-violet-400/60"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveProfile}
                      disabled={savingProfile}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-[#0f1117] disabled:opacity-60"
                    >
                      <Save size={13} /> {savingProfile ? '保存中' : '保存'}
                    </button>
                    <button
                      onClick={() => setEditingProfile(false)}
                      className="rounded-md border border-white/10 px-2 py-1.5 text-xs text-slate-300 hover:bg-white/8"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Avatar member={{ name: currentUser.name, avatar_url: currentUser.avatar_url, color: 'from-violet-500 to-fuchsia-500' }} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{currentUser.name}</p>
                    <p className="truncate text-xs text-slate-500">{currentUser.email || '个人资料'}</p>
                  </div>
                  <button
                    onClick={() => setEditingProfile(true)}
                    title="编辑资料"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/10 text-slate-400 hover:bg-white/8 hover:text-white"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
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
