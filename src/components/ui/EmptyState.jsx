import { Briefcase } from 'lucide-react';

export function EmptyState({ title, detail, action, onClick }) {
  return (
    <div className="grid min-h-60 place-items-center rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center">
      <div>
        <Briefcase className="mx-auto text-slate-400" size={36} />
        <h3 className="mt-4 text-lg font-semibold text-slate-950">{title}</h3>
        {detail ? <p className="mt-2 text-sm text-slate-500">{detail}</p> : null}
        {action ? <button onClick={onClick} className="mt-4 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500">{action}</button> : null}
      </div>
    </div>
  );
}
