export function IconButton({ label, onClick, icon: Icon }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-slate-300 transition hover:bg-white/8">
      <Icon size={15} />
    </button>
  );
}
