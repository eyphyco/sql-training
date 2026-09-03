import { HashRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import { ProgressProvider } from './storage/ProgressProvider';
import ThemeToggle from './components/ThemeToggle';
import { IconDatabase } from './components/icons';
import Home from './pages/Home';
import ProblemList from './pages/ProblemList';
import ProblemDetail from './pages/ProblemDetail';
import Settings from './pages/Settings';

const NAV = [
  { to: '/', label: 'ホーム', end: true },
  { to: '/problems', label: '問題', end: false },
  { to: '/settings', label: '進捗データ', end: false },
];

function Header() {
  return (
    <header className="glass-chrome sticky top-0 z-20 border-b border-line">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-5">
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
                  isActive
                    ? 'text-fg after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-accent'
                    : 'text-muted hover:text-fg'
                }`
              }
            >
              {item.label}
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

export default function App() {
  return (
    <ProgressProvider>
      {/* GitHub Pages でリロードしても 404 にならないよう HashRouter を使う */}
      <HashRouter>
        <div className="min-h-full">
          <Header />
          <main className="mx-auto max-w-5xl px-5 py-8">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/problems" element={<ProblemList />} />
              <Route path="/problems/:id" element={<ProblemDetail />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </main>
        </div>
      </HashRouter>
    </ProgressProvider>
  );
}
