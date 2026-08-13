export function Avatar({ member, size = 'md', pm = false, className = '' }) {
  const sizes = {
    xs: 'h-8 w-8 text-xs',
    sm: 'h-9 w-9 text-xs',
    md: 'h-11 w-11 text-sm',
    lg: 'h-16 w-16 text-base',
    xl: 'h-20 w-20 text-lg',
  };
  const color = member?.color || 'from-slate-500 to-slate-400';
  const name = member?.name || '?';
  const avatarUrl = member?.avatar_url || member?.avatar;
  return (
    <div className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br ${color} ${sizes[size]} font-semibold text-white ring-2 ring-[#151925] ${className}`}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        name.slice(0, 1)
      )}
      {pm ? <span className="absolute -bottom-1 rounded bg-violet-500 px-1.5 py-0.5 text-[10px] font-bold text-white ring-2 ring-[#151925]">PM</span> : null}
    </div>
  );
}
