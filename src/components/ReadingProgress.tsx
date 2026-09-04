import { motion, useScroll, useSpring } from 'motion/react';

/**
 * 読み進み具合を示す線。ヘッダーの下に固定する。
 * 章は長いので「あとどれくらいか」が分かるようにする。
 *
 * スクロール量に直結した動きなので、視差効果を減らす設定でも止めない
 * （時間で勝手に動くのではなく、利用者の操作をそのまま映しているため）。
 */
export default function ReadingProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 190,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden
      data-testid="reading-progress"
      style={{ scaleX }}
      className="fixed inset-x-0 top-14 z-30 h-0.5 origin-left bg-accent"
    />
  );
}
