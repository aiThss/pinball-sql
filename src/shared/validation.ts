import { z } from "zod";

export const CARD_ACTIONS = ["Gửi thẻ", "Lấy thẻ"] as const;
export const BALL_ACTIONS = ["Gửi bi", "Lấy bi"] as const;
export const STATUS_VALUES = ["Đang gửi", "Đã nhận lại", "Đã đổi quà", "Đã hủy"] as const;

export function normalizePhone(raw: string): string {
  const cleaned = raw.trim().replace(/[\s().-]+/g, "");
  if (cleaned.startsWith("+84")) {
    return `0${cleaned.slice(3)}`;
  }
  return cleaned;
}

export function normalizeSearchText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim();
}

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const createDepositSchema = z
  .object({
    fullName: z.string().trim().min(1, "Vui lòng nhập họ tên").max(100, "Họ tên tối đa 100 ký tự"),
    phone: z
      .string()
      .trim()
      .min(1, "Vui lòng nhập số điện thoại")
      .transform(normalizePhone)
      .refine((val) => /^0\d{8,10}$/.test(val), {
        message: "Số điện thoại không hợp lệ (cần 9-11 chữ số, bắt đầu bằng 0)",
      }),
    actorName: z.string().trim().min(1, "Vui lòng nhập tên nhân viên").max(60, "Tên nhân viên tối đa 60 ký tự"),
    cardAction: z.enum(CARD_ACTIONS).default("Gửi thẻ"),
    ballAction: z.enum(BALL_ACTIONS).default("Gửi bi"),
    cards: z.coerce.number().int("Số thẻ phải là số nguyên").min(0, "Số thẻ không được âm").max(100000, "Số thẻ quá lớn"),
    balls: z.coerce.number().int("Số bi phải là số nguyên").min(0, "Số bi không được âm").max(100000, "Số bi quá lớn"),
    depositDate: z.string().regex(dateRegex, "Ngày không hợp lệ (YYYY-MM-DD)").optional(),
    depositTime: z.string().regex(timeRegex, "Giờ không hợp lệ (HH:mm)").optional(),
  })
  .refine((data) => data.cards > 0 || data.balls > 0, {
    message: "Vui lòng nhập số thẻ hoặc số bi lớn hơn 0",
    path: ["cards"],
  });

export const updateDepositSchema = z
  .object({
    actorName: z.string().trim().min(1, "Vui lòng nhập tên người sửa").max(60, "Tên tối đa 60 ký tự"),
    fullName: z.string().trim().min(1, "Họ tên không được để trống").max(100).optional(),
    phone: z
      .string()
      .trim()
      .transform(normalizePhone)
      .refine((val) => /^0\d{8,10}$/.test(val), {
        message: "Số điện thoại không hợp lệ (cần 9-11 chữ số, bắt đầu bằng 0)",
      })
      .optional(),
    cards: z.coerce.number().int().min(0).max(100000).optional(),
    balls: z.coerce.number().int().min(0).max(100000).optional(),
    status: z.enum(STATUS_VALUES).optional(),
    depositDate: z.string().regex(dateRegex, "Ngày không hợp lệ (YYYY-MM-DD)").optional(),
    depositTime: z.string().regex(timeRegex, "Giờ không hợp lệ (HH:mm)").optional(),
  })
  .refine(
    (data) =>
      data.fullName !== undefined ||
      data.phone !== undefined ||
      data.cards !== undefined ||
      data.balls !== undefined ||
      data.status !== undefined ||
      data.depositDate !== undefined ||
      data.depositTime !== undefined,
    { message: "Không có thông tin cần cập nhật" }
  );

export type CreateDepositInput = z.infer<typeof createDepositSchema>;
export type UpdateDepositInput = z.infer<typeof updateDepositSchema>;
