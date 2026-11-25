import { MAX_ROOMS, type RoomSummary } from './messages.js';

/** 自分のマスからのマス単位の距離を、計算済みの値として持つ候補。 */
export type RoomCandidate = { summary: RoomSummary; distance: number };

/**
 * 部屋一覧を並べ替える。sameHash: true を先に、それぞれの中で distance の昇順
 * (同じ distance では入力順)。先頭 MAX_ROOMS 件を返す。入力は書き換えない。
 */
export function orderRoomSummaries(candidates: RoomCandidate[]): RoomSummary[] {
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => {
      if (a.candidate.summary.sameHash !== b.candidate.summary.sameHash) {
        return a.candidate.summary.sameHash ? -1 : 1;
      }
      return a.candidate.distance - b.candidate.distance || a.index - b.index;
    })
    .slice(0, MAX_ROOMS)
    .map(({ candidate }) => candidate.summary);
}
