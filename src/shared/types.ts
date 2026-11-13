export type CardActionType = "Gửi thẻ" | "Lấy thẻ";
export type BallActionType = "Gửi bi" | "Lấy bi";
export type DepositStatus = "Đang gửi" | "Đã nhận lại" | "Đã đổi quà" | "Đã hủy";
export type HistoryAction = "CREATE" | "UPDATE" | "SYSTEM";

export interface DepositHistorySnapshot {
  fullName?: string;
  phone?: string;
  cards?: number;
  balls?: number;
  remainingCards?: number;
  remainingBalls?: number;
  status?: DepositStatus;
  depositDate?: string;
  depositTime?: string;
}

export interface DepositHistoryItem {
  id: string;
  at: string;
  actorName: string;
  action: HistoryAction;
  content: string;
  before?: DepositHistorySnapshot;
  after?: DepositHistorySnapshot;
}

export interface DepositDTO {
  id: string;
  fullName: string;
  phone: string;
  depositDate: string;
  depositTime: string;
  cardAction: CardActionType;
  ballAction: BallActionType;
  cards: number;
  balls: number;
  remainingCards: number;
  remainingBalls: number;
  totalText: string;
  status: DepositStatus;
  createdBy: { displayName: string } | null;
  updatedBy: { displayName: string } | null;
  createdByName: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
  latestUpdate: DepositHistoryItem | null;
  updates: DepositHistoryItem[];
  history: DepositHistoryItem[];
}
