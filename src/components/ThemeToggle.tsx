import { motion } from 'motion/react';
import { useTheme } from '../theme/themeContext';
import { SLIDE } from './motion';
import type { ThemeChoice } from '../theme/theme';
import { IconMonitor, IconMoon, IconSun } from './icons';

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof IconSun }[] = [
  { value: 'light', label: 'ライト', Icon: IconSun },
  { value: 'dark', label: 'ダーク', Icon: IconMoon },
  { value: 'system', label: 'システム設定に従う', Icon: IconMonitor },
];

/** セグメンテッドコントロール。3状態（ライト / ダーク / システム）を1つの操作子にまとめる */
export default function ThemeToggle() {
  const { choice, setChoice } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="配色テーマ"
      className="inline-flex items-center gap-0.5 rounded-full border border-line bg-sunken p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = choice === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setChoice(value)}
            // 選択中だけ不透明なつまみを乗せる（溝の上を滑る物理的な操作子に見せる）
            className={`relative flex h-6 w-7 items-center justify-center rounded-full transition-colors ${
              active ? 'text-fg' : 'text-subtle hover:text-muted'
            }`}
          >
            {active && (
              <motion.span
                layoutId="theme-thumb"
                transition={SLIDE}
                className="glass-edge absolute inset-0 rounded-full bg-solid shadow-card"
              />
            )}
            <Icon size={14} className="relative" />
          </button>
        );
      })}
    </div>
  );
}
