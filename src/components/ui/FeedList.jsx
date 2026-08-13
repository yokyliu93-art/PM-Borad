export function FeedList({ updates }) {
  return (
    <div className="mt-5 space-y-3">
      {updates.map((update, index) => (
        <div key={`${update}-${index}`} className="rounded-md border border-white/10 bg-[#11141d] p-3">
          <p className="text-sm text-slate-300">{typeof update === 'string' ? update : update.content}</p>
          <p className="mt-1 text-xs text-slate-600">{index === 0 ? '刚刚' : `${index + 1}分钟前`}</p>
        </div>
      ))}
    </div>
  );
}
