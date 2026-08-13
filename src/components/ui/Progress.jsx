export function Progress({ value }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/8">
      <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-cyan-400 to-emerald-400 transition-all duration-500" style={{ width: `${value}%` }} />
    </div>
  );
}
