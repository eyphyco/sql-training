import { HashRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { MotionConfig, motion } from 'motion/react';
import { PAGE, SLIDE } from './components/motion';
import { ProgressProvider } from './storage/ProgressProvider';
import ThemeToggle from './components/ThemeToggle';
import { IconDatabase } from './components/icons';
import Home from './pages/Home';
import Learn from './pages/Learn';
import LearnChapter from './pages/LearnChapter';
import ProblemList from './pages/ProblemList';
import ProblemDetail from './pages/ProblemDetail';
import Settings from './pages/Settings';

const NAV = [
  { to: '/', label: 'ホーム', end: true },
  { to: '/learn', label: '教材', end: false },
  { to: '/problems', label: '問題', end: false },
  { to: '/settings', label: '進捗データ', end: false },
];

function Header() {
  return (
    <header className="glass-chrome sticky top-0 z-20 border-b border-line">
      <div className="mx-auto flex h-14 w-full max-w-page items-center gap-6 px-5 lg:px-8">
        <Link
          to="/"
          className="flex items-center gap-2 text-[13.5px] font-semibold tracking-tight text-fg"
        >
          <IconDatabase size={17} className="text-accent" />
          SQL Training
        </Link>
        <nav className="flex h-full items-stretch gap-5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative flex items-center text-[13px] transition-colors ${
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
 */
function Pages() {
  const location = useLocation();
  return (
    <motion.div key={location.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={PAGE}>
      <Routes location={location}>
        <Route path="/" element={<Home />} />
        <Route path="/learn" element={<Learn />} />
        <Route path="/learn/:phaseId" element={<LearnChapter />} />
        <Route path="/problems" element={<ProblemList />} />
        <Route path="/problems/:id" element={<ProblemDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Home />} />
      </Routes>
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
