import { useRef, useState } from 'react';
import { useProgress } from '../storage/progressContext';
import { useTheme } from '../theme/themeContext';
import { AnimatedNumber, Button, Card, SectionTitle } from '../components/ui';
import { IconDownload, IconTrash, IconUpload } from '../components/icons';
import type { ThemeChoice } from '../theme/theme';
import { PROBLEM_METAS } from '../data/problems';

const THEME_LABEL: Record<ThemeChoice, string> = {
  light: 'ライト',
  dark: 'ダーク',
  system: 'システム設定に従う',
};

export default function Settings() {
  const { exportJson, importJson, reset, progress } = useProgress();
  const { choice, resolved, setChoice } = useTheme();
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
    setMessage({ tone: 'ok', text: '進捗ファイルをダウンロードしました。' });
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
    <div className="max-w-2xl space-y-8">
      <h1 className="text-lg font-semibold tracking-tight text-fg">設定</h1>

      <section>
        <SectionTitle>表示</SectionTitle>
        <Card className="divide-y divide-line">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <p className="text-[13.5px] text-fg">配色テーマ</p>
              <p className="mt-0.5 text-[12px] text-muted">
                現在は{THEME_LABEL[choice]}
                {choice === 'system' && `（${resolved === 'dark' ? 'ダーク' : 'ライト'}で表示中）`}
              </p>
            </div>
            <div className="flex gap-1.5">
              {(['light', 'dark', 'system'] as ThemeChoice[]).map((v) => (
                <Button
                  key={v}
                  onClick={() => setChoice(v)}
                  className={choice === v ? 'border-accent-line bg-accent-soft text-accent' : ''}
                >
                  {THEME_LABEL[v]}
                </Button>
              ))}
            </div>
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>進捗データ</SectionTitle>
        <Card className="divide-y divide-line">
          <div className="grid grid-cols-3 divide-x divide-line">
            {/* 取り込みや消去で数が変わるので、書き換えず数えて動かす */}
            {[
              ['着手', attempted],
              ['正解', solved],
              ['全問', PROBLEM_METAS.length],
            ].map(([label, value]) => (
              <div key={label} className="px-4 py-3">
                <p className="text-[11px] text-muted">{label}</p>
                <p className="mt-0.5 text-[17px] font-medium text-fg">
                  <AnimatedNumber value={Number(value)} />
                </p>
              </div>
            ))}
          </div>
          <div className="p-4">
            <p className="text-[12.5px] leading-relaxed text-muted">
              進捗はこのブラウザにのみ保存されます（サーバーには送信されません）。
              ブラウザのデータを消すと失われるため、定期的にエクスポートしておくと安全です。
              端末をまたいで引き継ぐときもこのファイルを使います。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={download}>
                <IconDownload size={14} />
                エクスポート
              </Button>
              <Button onClick={() => fileRef.current?.click()}>
                <IconUpload size={14} />
                インポート
              </Button>
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
              <Button
                variant="danger"
                className="ml-auto"
                onClick={() => {
                  if (confirm('進捗をすべて削除します。よろしいですか？')) {
                    reset();
                    setMessage({ tone: 'ok', text: '進捗をリセットしました。' });
                  }
                }}
              >
                <IconTrash size={14} />
                リセット
              </Button>
            </div>
            {message && (
              <p
                className={`mt-3 text-[12.5px] ${message.tone === 'ok' ? 'text-success' : 'text-danger'}`}
              >
                {message.text}
              </p>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
