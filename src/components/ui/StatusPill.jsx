export function StatusPill({ status }) {
  const styles = {
    待开始: 'bg-slate-100 text-slate-600 ring-slate-200',
    进行中: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
    审核中: 'bg-amber-50 text-amber-700 ring-amber-100',
    已提交: 'bg-sky-50 text-sky-700 ring-sky-100',
    已完成: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    推进中: 'bg-amber-50 text-amber-700 ring-amber-100',
    筹备中: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  };
  return (
    <span className={`inline-flex w-fit items-center gap-1 rounded px-2 py-1 text-xs ring-1 ${styles[status] || styles['待开始']}`}>
      <CircleDot size={11} />{status}
    </span>
  );
}

function CircleDot(props) {
  return <svg width={props.size} height={props.size} viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" /></svg>;
}
