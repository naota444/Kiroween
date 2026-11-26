/** 全接続共通の FIFO キュー。1つ終わってから次を始める。 */
export type SerialQueue = {
  /** 処理を末尾に積む。結果(または例外)は返す Promise で受け取れる。 */
  push<T>(job: () => T | Promise<T>): Promise<T>;
  /** いま積まれている処理がすべて終わるまで待つ。 */
  idle(): Promise<void>;
};

export function createSerialQueue(): SerialQueue {
  // tail は常に解決する(失敗しても次の処理を続けるため)
  let tail: Promise<void> = Promise.resolve();

  return {
    push<T>(job: () => T | Promise<T>): Promise<T> {
      const result = tail.then(job);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    idle(): Promise<void> {
      return tail;
    },
  };
}
