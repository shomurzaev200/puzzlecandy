export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type Row = { [key: string]: Json };

export type Lang = "ru" | "uz" | "en";

export const LANGS: Lang[] = ["ru", "uz", "en"];

export type I18nMap = Partial<Record<Lang, string>>;

export type AdminRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "MODERATOR"
  | "SUPPORT"
  | "FINANCE"
  | "COURIER_MANAGER"
  | "FINANCE_ADMIN"
  | "ORDER_OPERATOR"
  | "COURIER_DISPATCHER"
  | "SUPPORT_AGENT"
  | "KYC_REVIEWER"
  | "MANAGER";

export type Permission =
  | "dashboard"
  | "users.read"
  | "users.write"
  | "users.block"
  | "users.balance"
  | "users.message"
  | "products.read"
  | "products.write"
  | "products.delete"
  | "categories.write"
  | "orders.read"
  | "orders.write"
  | "payments.read"
  | "payments.review"
  | "kyc.read"
  | "kyc.write"
  | "transactions.read"
  | "couriers.read"
  | "couriers.write"
  | "map.read"
  | "reviews.moderate"
  | "support.read"
  | "support.write"
  | "jobs.write"
  | "analytics.read"
  | "notifications.read"
  | "bots.manage"
  | "settings.read"
  | "settings.write"
  | "settings.secrets"
  | "audit.read"
  | "errors.read"
  | "roles.write"
  | "export";

export type ShopEventType =
  | "PAYMENT_PENDING"
  | "PAYMENT_SUBMITTED"
  | "KYC_PENDING"
  | "NEW_ORDER"
  | "COURIER_REPORT"
  | "NEW_SUPPORT"
  | "NEW_USER"
  | "SYSTEM_ERROR"
  | "COURIER_LOCATION"
  | "JOB_APPLICATION"
  | "PRODUCT_SUBMISSION";

export type BotKind = "main" | "payment" | "courier" | "support" | "other";

export type KeyboardButton = {
  text: string;
  requestLocation?: boolean;
};

export type InlineButton = {
  text: string;
  data: string;
};

export type BotMessageOut = {
  text: string;
  html?: boolean;
  photoUrl?: string | null;
  inline?: InlineButton[][];
};

export type BotReply = {
  messages: BotMessageOut[];
  keyboard?: KeyboardButton[][];
  requestPhoto?: boolean;
  requestLocation?: boolean;
  removeKeyboard?: boolean;
};

export type BotIncoming = {
  bot: BotKind;
  telegramId: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  languageCode?: string | null;
  text?: string | null;
  callbackData?: string | null;
  photoDataUrl?: string | null;
  telegramFileId?: string | null;
  location?: { lat: number; lng: number } | null;
  startPayload?: string | null;
};

export type ShopUserRow = {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language: Lang;
  balance_cents: number;
  purchases_count: number;
  discount_percent: number;
  referral_code: string;
  referred_by: string | null;
  referrals_count: number;
  referral_earned_cents: number;
  status: "ACTIVE" | "BLOCKED" | "VIP";
  public_code?: string | null;
  kyc_status?: string;
  registered_at: string;
  last_activity_at: string;
};
