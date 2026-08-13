export function StatusPill({ status }) {
  const styles = {
    待开始: 'bg-slate-500/15 text-slate-300 ring-slate-400/20',
    进行中: 'bg-cyan-500/15 text-cyan-200 ring-cyan-400/20',
    审核中: 'bg-amber-500/15 text-amber-200 ring-amber-400/20',
    已提交: 'bg-sky-500/15 text-sky-200 ring-sky-400/20',
    已完成: 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/20',
    推进中: 'bg-amber-500/15 text-amber-200 ring-amber-400/20',
    筹备中: 'bg-violet-500/15 text-violet-200 ring-violet-400/20',
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
