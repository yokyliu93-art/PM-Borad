export function PanelTitle({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={17} className="text-emerald-600" />
      <h3 className="font-semibold text-slate-950">{title}</h3>
    </div>
  );
}
