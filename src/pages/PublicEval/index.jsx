import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Copy, FlaskConical, Loader2, ArrowLeft } from 'lucide-react';

function questionPackage(question) {
  return [
    `# ${question.title || '测试题'}`,
    question.prompt_text ? `## Prompt\n${question.prompt_text}` : '',
    question.input_text ? `## 输入 / 素材\n${question.input_text}` : '',
    question.expected_output ? `## 期望输出\n${question.expected_output}` : '',
    question.evaluation_criteria ? `## 评测标准\n${question.evaluation_criteria}` : '',
    question.reference_answer ? `## 参考答案\n${question.reference_answer}` : '',
  ].filter(Boolean).join('\n\n');
}

export function PublicEval() {
  const { id } = useParams();
  const [state, setState] = useState('loading'); // loading | ready | notfound | error
  const [data, setData] = useState(null);
  const [copiedKey, setCopiedKey] = useState('');
  const [copyError, setCopyError] = useState('');

  useEffect(() => {
    let alive = true;
    setState('loading');
    fetch(`/api/public/evals/${encodeURIComponent(id)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.ok && json.ok) {
          setData(json.data);
          setState('ready');
          if (json.data?.title) document.title = `${json.data.title} · 硅星人 Eval`;
        } else if (res.status === 404) {
          setState('notfound');
        } else {
          setState('error');
        }
      })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [id]);

  async function copyToClipboard(text) {
    const value = text || '';
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch { /* fall through to legacy path */ }
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  async function copy(text, key) {
    setCopyError('');
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 1600);
    } else {
      setCopyError('自动复制失败，请手动选中文本复制');
      setTimeout(() => setCopyError(''), 2600);
    }
  }

  if (state === 'loading') {
    return (
      <main className="min-h-screen bg-[#f7f3ec] grid place-items-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 size={28} className="animate-spin text-emerald-600" />
          <p className="text-sm">正在加载测试集…</p>
        </div>
      </main>
    );
  }

  if (state === 'notfound') {
    return (
      <main className="min-h-screen bg-[#f7f3ec] grid place-items-center p-6">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-2xl font-semibold text-slate-900">测试集不存在</p>
          <p className="mt-2 text-sm text-slate-500">这个测试集可能已被删除或下线。</p>
        </div>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="min-h-screen bg-[#f7f3ec] grid place-items-center p-6">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-2xl font-semibold text-slate-900">加载失败</p>
          <p className="mt-2 text-sm text-slate-500">请稍后刷新重试。</p>
          <button onClick={() => window.location.reload()} className="mt-5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">刷新</button>
        </div>
      </main>
    );
  }

  const questions = Array.isArray(data.questions) ? data.questions : [];
  const allPackage = questions.map((q) => questionPackage(q)).join('\n\n---\n\n');

  return (
    <main className="min-h-screen bg-[#f7f3ec]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <FlaskConical size={16} className="text-emerald-600" />
            <span>硅星人 Eval 测试集</span>
          </div>
          <a href="/" className="text-sm font-medium text-slate-500 hover:text-slate-900">PM Board</a>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700">{questions.length} 道测试题</span>
            {data.owner_text ? <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">负责人 {data.owner_text}</span> : null}
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">{data.title || '未命名测试集'}</h1>
          {data.body ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{data.body}</p> : null}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={() => copy(allPackage, 'all')} className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500">
              <Copy size={15} />{copiedKey === 'all' ? '已复制全部题包' : '复制全部题包'}
            </button>
            {data.source_url ? (
              <a href={data.source_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-500 hover:text-slate-900">查看原始飞书文档 ↗</a>
            ) : null}
          </div>
        </div>

        {copyError ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">{copyError}</div>
        ) : null}

        <div className="mt-6 space-y-4">
          {questions.map((question, index) => (
            <section key={question.id} className="rounded-xl border border-violet-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-violet-700">第 {index + 1} 题</p>
                  <h2 className="mt-1 text-base font-semibold text-slate-950">{question.title || '未命名测试题'}</h2>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button onClick={() => copy(question.prompt_text, `p-${question.id}`)} className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-50">
                    <Copy size={13} />{copiedKey === `p-${question.id}` ? '已复制' : '复制 Prompt'}
                  </button>
                  <button onClick={() => copy(questionPackage(question), `f-${question.id}`)} className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-500">
                    <Copy size={13} />{copiedKey === `f-${question.id}` ? '已复制' : '复制题包'}
                  </button>
                </div>
              </div>

              {question.prompt_text ? (
                <div className="mt-4 rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-500">Prompt</p>
                  <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{question.prompt_text}</pre>
                </div>
              ) : null}

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {question.input_text ? (
                  <div className="rounded-lg bg-slate-50 p-4">
                    <p className="text-xs font-semibold text-slate-500">输入 / 素材</p>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{question.input_text}</p>
                  </div>
                ) : null}
                {question.expected_output ? (
                  <div className="rounded-lg bg-slate-50 p-4">
                    <p className="text-xs font-semibold text-slate-500">期望输出</p>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{question.expected_output}</p>
                  </div>
                ) : null}
                {question.evaluation_criteria ? (
                  <div className="rounded-lg bg-slate-50 p-4">
                    <p className="text-xs font-semibold text-slate-500">评测标准</p>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{question.evaluation_criteria}</p>
                  </div>
                ) : null}
                {question.reference_answer ? (
                  <div className="rounded-lg bg-slate-50 p-4">
                    <p className="text-xs font-semibold text-slate-500">参考答案</p>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{question.reference_answer}</p>
                  </div>
                ) : null}
              </div>
            </section>
          ))}
        </div>

        {questions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">这个测试集还没有解析出测试题。</p>
          </div>
        ) : null}

        <p className="mt-8 text-center text-xs text-slate-400">由硅星人 PM Board 生成 · 对外公开</p>
      </div>
    </main>
  );
}
