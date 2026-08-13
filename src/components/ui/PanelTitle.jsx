export function PanelTitle({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={17} className="text-violet-300" />
      <h3 className="font-semibold text-white">{title}</h3>
    </div>
  );
}
