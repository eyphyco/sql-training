import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { EASE_OUT, SLIDE } from './motion';
import { IconChevronDown } from './icons';

/*
  脇に置く目次の共通部分。

  問題ページの目次（章 → 問題）と教材の目次（章 → 節）は、
  見出しの進捗バーも章の行も同じ形をしている。動きの合わせ方まで含めて
  二度書いていたので、見た目を持つところだけここに集めた。
  「押したらどうなるか」は同じではないので、行の中身と子の並びは各画面に残す。
*/

/** 進捗つきの見出し。目次を送っても残るように貼り付ける */
export function NavHeader({
  label,
  solved,
  total,
}: {
  label: string;
  solved: number;
  total: number;
}) {
  return (
    <div className="glass-sticky sticky top-0 z-20 border-b border-line px-3 py-2.5">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-tiny font-medium tracking-tight text-muted">{label}</span>
        <span className="tnum ml-auto text-tiny text-fg">
          <span className="font-semibold">{solved}</span>
          <span className="text-subtle"> / {total}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
        <motion.div
          className="h-full origin-left bg-accent"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: total === 0 ? 0 : solved / total }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
        />
      </div>
    </div>
  );
}

/** 章の行の中身。開いていれば矢印は下、閉じていれば横を向く */
export function NavChapterRow({
  number,
  title,
  solved,
  total,
  open,
  current = false,
  children,
}: {
  number: number;
  title: string;
  solved: number;
  total: number;
  open: boolean;
  /** いま見ている章。名前を強め、下地を敷く */
  current?: boolean;
  /** 下地など、行に重ねるもの */
  children?: ReactNode;
}) {
  const done = total > 0 && solved === total;
  return (
    <>
      {children}
      <motion.span
        animate={{ rotate: open ? 0 : -90 }}
        transition={SLIDE}
        className={`relative flex shrink-0 ${current ? 'text-accent' : 'text-subtle'}`}
      >
        <IconChevronDown size={12} />
      </motion.span>
      <span
        className={`tnum relative shrink-0 font-mono text-micro ${
          current ? 'text-accent' : 'text-subtle'
        }`}
      >
        {String(number).padStart(2, '0')}
      </span>
      <span
        className={`relative min-w-0 truncate text-small ${
          current ? 'font-semibold text-accent' : 'text-muted'
        }`}
      >
        {title}
      </span>
      <span
        className={`tnum relative ml-auto shrink-0 text-micro ${
          done ? 'text-success' : 'text-subtle'
        }`}
      >
        {solved}/{total}
      </span>
    </>
  );
}

/** 章の行の枠。ボタンにもリンクにも使えるよう、クラスだけ配る */
export const NAV_ROW_CLASS =
  'relative flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left';
