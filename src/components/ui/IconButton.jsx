export function IconButton({ label, onClick, icon: Icon }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-950">
      <Icon size={15} />
    </button>
  );
}
