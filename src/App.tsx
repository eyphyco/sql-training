import { lazy, Suspense } from 'react';
import { HashRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { MotionConfig, motion } from 'motion/react';
import { PAGE, SLIDE } from './components/motion';
import { ProgressProvider } from './storage/ProgressProvider';
import ThemeToggle from './components/ThemeToggle';
import { IconDatabase } from './components/icons';
import Home from './pages/Home';

/*
  ホーム以外は開いたときに読み込む。まとめて 1 つに詰めると、
  ホームでも CodeMirror・DuckDB・Arrow まで読むことになり、
  初回に 477KB（gzip）掛かっていた。分けると 193KB で始められる。
*/
const Learn = lazy(() => import('./pages/Learn'));
const LearnChapter = lazy(() => import('./pages/LearnChapter'));
const ProblemList = lazy(() => import('./pages/ProblemList'));
const ProblemDetail = lazy(() => import('./pages/ProblemDetail'));
const Settings = lazy(() => import('./pages/Settings'));

const NAV = [
  { to: '/', label: 'ホーム', end: true },
  { to: '/learn', label: '教材', end: false },
  { to: '/problems', label: '問題', end: false },
  { to: '/settings', label: '進捗データ', end: false },
];

function Header() {
  return (
    <header className="glass-chrome sticky top-0 z-20 border-b border-line">
      {/*
        狭い画面ではロゴの文字とナビの余白を落として 1 行に収める。
        折り返させると項目が縦に割れて読めなくなる（実測 390px で
        「進捗データ」が「捗データ」に切れていた）。
      */}
      <div className="mx-auto flex h-14 w-full max-w-page items-center gap-2 px-3 sm:gap-6 sm:px-5 lg:px-8">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 text-[13.5px] font-semibold tracking-tight text-fg"
        >
          <IconDatabase size={17} className="text-accent" />
          <span className="hidden sm:inline">SQL Training</span>
          <span className="sr-only sm:hidden">SQL Training</span>
        </Link>
        <nav className="flex h-full items-stretch gap-3 sm:gap-5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative flex items-center whitespace-nowrap text-[12px] transition-colors sm:text-[13px] ${
                  isActive ? 'text-fg' : 'text-muted hover:text-fg'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {item.label}
                  {/* 下線は 1 つを使い回して滑らせる（layoutId が同じものは繋がって動く） */}
                  {isActive && (
                    <motion.span
                      layoutId="nav-underline"
                      transition={SLIDE}
                      className="absolute inset-x-0 -bottom-px h-0.5 bg-accent"
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/**
 * 画面の中身。遷移時に不透明度だけ戻す。
 * 位置を動かさないのは、DuckDB の初期化中でも画面が跳ねないようにするため。
 * 退場は入れていない（待ち時間が増えて操作が重く感じるので）。
 *
 * key はパス全体ではなく先頭の区画（problems / learn / settings）にしている。
 * 同じ区画の中を移動するとき（問題 A → 問題 B）は作り直さないので、
 * サイドバーの現在位置がその場で滑って移動できる。
 */
function Pages() {
  const location = useLocation();
  const section = location.pathname.split('/')[1] ?? '';
  return (
    <motion.div key={section} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={PAGE}>
      {/* 読み込み中に高さを保って、着いたときに画面が飛び跳ねないようにする */}
      <Suspense fallback={<div className="min-h-[60vh]" />}>
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/learn/:phaseId" element={<LearnChapter />} />
          <Route path="/problems" element={<ProblemList />} />
          <Route path="/problems/:id" element={<ProblemDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
    </motion.div>
  );
}

export default function App() {
  return (
    <ProgressProvider>
      {/* reducedMotion="user" で OS の「視差効果を減らす」に従う */}
      <MotionConfig reducedMotion="user">
        {/* GitHub Pages でリロードしても 404 にならないよう HashRouter を使う */}
        <HashRouter>
          <div className="min-h-full">
            <Header />
            <main className="mx-auto w-full max-w-page px-5 py-8 lg:px-8">
              <Pages />
            </main>
          </div>
        </HashRouter>
      </MotionConfig>
    </ProgressProvider>
  );
}
