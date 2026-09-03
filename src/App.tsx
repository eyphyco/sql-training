import { HashRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import { ProgressProvider } from './storage/ProgressProvider';
import Home from './pages/Home';
import ProblemList from './pages/ProblemList';
import ProblemDetail from './pages/ProblemDetail';
import Settings from './pages/Settings';

function Nav() {
  const cls = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 text-sm transition ${
      isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-100'
    }`;
  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
        <Link to="/" className="mr-3 flex items-center gap-2 font-bold text-white">
          <span className="text-sky-400">◆</span> SQL Training
        </Link>
        <NavLink to="/" end className={cls}>
          ホーム
        </NavLink>
        <NavLink to="/problems" className={cls}>
          問題一覧
        </NavLink>
        <NavLink to="/settings" className={cls}>
          進捗データ
        </NavLink>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <ProgressProvider>
      {/* GitHub Pages でリロードしても 404 にならないよう HashRouter を使う */}
      <HashRouter>
        <div className="min-h-full bg-slate-950">
          <Nav />
          <main className="mx-auto max-w-6xl px-4 py-6">
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
