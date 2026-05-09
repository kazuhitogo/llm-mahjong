import type { Seat, Wind } from './seat.js';
import type { Tile, TileId } from './tile.js';
import type { Meld } from './meld.js';
import type { Action } from './action.js';

/** ルール設定（天鳳鳳凰卓ルールがデフォルト。SPEC.md §2 参照） */
export interface RuleConfig {
  gameLength: 'hanchan' | 'tonpu';
  startingPoints: number;       // デフォルト 25000
  returnPoints: number;         // デフォルト 30000
  uma: [number, number, number, number]; // 1位〜4位順、デフォルト [+10,+5,-5,-10]
  redDora: boolean;             // 赤5
  openTanyao: boolean;          // 喰い断
  ippatsuUradora: boolean;      // 一発・裏ドラ
  nagashiMangan: boolean;
  doubleHanRequirement: boolean; // 二翻縛り（false でなし）
  abortiveDraws: {
    kyushuKyuhai: boolean;
    suufonRenda: boolean;
    suuchaRiichi: boolean;
    suukaikan: boolean;
    sanchaHou: boolean;
  };
  noChoice: 'tobi-end' | 'continue';  // 飛び終了
  kuikaeBan: boolean;           // 喰い替え禁止
}

/** デフォルト = 天鳳鳳凰卓ルール */
export const DEFAULT_RULES: RuleConfig = {
  gameLength: 'hanchan',
  startingPoints: 25000,
  returnPoints: 30000,
  uma: [10, 5, -5, -10],
  redDora: true,
  openTanyao: true,
  ippatsuUradora: true,
  nagashiMangan: true,
  doubleHanRequirement: false,
  abortiveDraws: {
    kyushuKyuhai: true,
    suufonRenda: true,
    suuchaRiichi: true,
    suukaikan: true,
    sanchaHou: true,
  },
  noChoice: 'tobi-end',
  kuikaeBan: true,
};

/** 河（捨て牌列）のエントリ */
export interface DiscardEntry {
  tile: Tile;
  /** 何巡目に切られたか（1 始まり） */
  junme: number;
  /** ツモ切りか手出しか */
  tsumogiri: boolean;
  /** リーチ宣言牌（横向きに置く牌） */
  isRiichiDeclaration: boolean;
  /** 鳴かれて場から消えたか（鳴かれた場合 true） */
  calledBy: Seat | null;
}

export interface PlayerState {
  seat: Seat;
  /** 手牌（13 or 14 枚、ソート済み）。副露分は含まない */
  hand: Tile[];
  /** 副露 */
  melds: Meld[];
  /** 河 */
  discards: DiscardEntry[];
  /** 現在の点数 */
  score: number;
  /** リーチ状態 */
  riichi: {
    declared: boolean;
    /** 宣言した巡目 */
    junme: number;
    /** ダブルリーチか */
    isDouble: boolean;
    /** 一発有効か（次の自分のツモまで、誰も鳴かなければ） */
    ippatsu: boolean;
  } | null;
  /** フリテン状態 */
  isFuriten: boolean;
}

/** 山と王牌の状態
 *
 * 物理的な「積み」を再現するため、136 牌のレイアウトとサイコロ出目から
 * 計算された割れ目インデックスをすべて構造として持つ。
 * 山積み（dealWall）の時点で全ツモ順が確定する。詳細は src/wall/wall.ts のコメント参照。
 */
export interface WallState {
  /** 物理的な 136 牌の配置（layout[i] が席 floor(i/34) の壁の i%34 番目） */
  layout: readonly TileId[];
  /** 親が振った 2 つのサイコロ（各 1〜6） */
  dice: readonly [number, number];
  /** layout 上の開門位置（次に取られる牌のインデックス） */
  breakIndex: number;
  /** 配牌＋ツモで消費した枚数。122 で荒牌流局 */
  drawnCount: number;
  /** 公開済みドラ表示牌の枚数（カンで増える、最大 5） */
  doraIndicatorCount: number;
}

/** 局の進行 phase */
export type GamePhase =
  | 'deal'         // 配牌中
  | 'draw'         // ツモ待ち
  | 'discard'      // 打牌待ち（手牌 14 枚）
  | 'call'         // 他家の打牌に対する鳴き宣言受付
  | 'agari'        // 和了確定
  | 'ryukyoku'     // 流局確定
  | 'end';         // 局終了

/** 局全体の状態 */
export interface GameState {
  config: RuleConfig;
  /** 場 */
  round: {
    wind: Wind;       // 場風（E or S）
    kyoku: 1 | 2 | 3 | 4;
    honba: number;
    riichiSticks: number; // 供託
  };
  dealerSeat: Seat;
  turn: {
    seat: Seat;
    phase: GamePhase;
    /** 巡目（自分の打牌が河に並んだ回数）。配牌直後は 0 */
    junme: number;
  };
  wall: WallState;
  players: [PlayerState, PlayerState, PlayerState, PlayerState];
  /** イベントログ */
  history: GameEvent[];
  /** 山生成に使った乱数 seed */
  rngSeed: number;
}

/** ゲームイベント（ログとリプレイ用） */
export type GameEvent =
  | { kind: 'init'; rngSeed: number; round: GameState['round']; dealerSeat: Seat }
  | { kind: 'dice'; dice: [number, number]; breakSeat: Seat; breakIndex: number }
  | { kind: 'deal'; hands: [Tile[], Tile[], Tile[], Tile[]] }
  | { kind: 'draw'; seat: Seat; tile: Tile }
  | { kind: 'action'; seat: Seat; action: Action }
  | { kind: 'violation'; seat: Seat; attempted: Action; reason: string; replacement: Action }
  | { kind: 'ryukyoku'; reason: string }
  | { kind: 'agari'; winner: Seat; from: Seat | 'tsumo' };
