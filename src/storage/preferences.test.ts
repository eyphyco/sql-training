import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readLessonOpen, writeLessonOpen } from './preferences';

beforeEach(() => localStorage.clear());

describe('教材を開いた状態にするか', () => {
  it('未設定なら開く（読んでから解く想定）', () => {
    expect(readLessonOpen()).toBe(true);
  });

  it('閉じた状態を覚える', () => {
    writeLessonOpen(false);
    expect(readLessonOpen()).toBe(false);
  });

  it('開き直したら戻る', () => {
    writeLessonOpen(false);
    writeLessonOpen(true);
    expect(readLessonOpen()).toBe(true);
  });

  it('知らない値が入っていても開く側に倒す', () => {
    localStorage.setItem('sql-training:lesson-open', 'maybe');
    expect(readLessonOpen()).toBe(true);
  });

  it('進捗とは別のキーに置く', () => {
    writeLessonOpen(false);
    expect(localStorage.getItem('sql-training:progress:v1')).toBeNull();
  });

  it('localStorage が使えなくても落ちない', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readLessonOpen()).toBe(true);
    expect(() => writeLessonOpen(false)).not.toThrow();
  });
});
