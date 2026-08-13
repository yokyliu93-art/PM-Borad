export function InfoField({ label, value }) {
  return (
    <div className="rounded-md border border-white/10 bg-[#11141d] p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-200">{value}</p>
    </div>
  );
}
