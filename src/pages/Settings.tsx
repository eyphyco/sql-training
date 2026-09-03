import { useRef, useState } from 'react';
import { useProgress } from '../storage/progressContext';

export default function Settings() {
  const { exportJson, importJson, reset, progress } = useProgress();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'ng'; text: string } | null>(null);

  const download = () => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sql-training-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File) => {
    try {
      importJson(await file.text());
      setMessage({ tone: 'ok', text: '進捗を読み込みました。' });
    } catch (e) {
      setMessage({ tone: 'ng', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const attempted = Object.keys(progress.solvedProblems).length;
  const solved = Object.values(progress.solvedProblems).filter((r) => r.solved).length;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-white">進捗データの管理</h1>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-300">
        <p>
          進捗はこのブラウザの localStorage に保存されています（着手 {attempted} 問 / 正解 {solved} 問）。
          ブラウザのデータを消すと失われるため、定期的にエクスポートしておくと安全です。
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={download}
          className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
        >
          エクスポート（JSON をダウンロード）
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-slate-600 px-5 py-2.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          インポート（JSON を読み込む）
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => {
            if (confirm('進捗をすべて削除します。よろしいですか？')) {
              reset();
              setMessage({ tone: 'ok', text: '進捗をリセットしました。' });
            }
          }}
          className="rounded-lg border border-rose-500/40 px-5 py-2.5 text-sm text-rose-300 hover:bg-rose-500/10"
        >
          進捗をリセット
        </button>
      </div>

      {message && (
        <p className={`text-sm ${message.tone === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>{message.text}</p>
      )}
    </div>
  );
}
