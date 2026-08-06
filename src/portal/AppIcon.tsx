import {
  BarChart3,
  Bell,
  BookOpenText,
  CircleDollarSign,
  Coffee,
  CookingPot,
  Gift,
  House,
  Images,
  LayoutDashboard,
  ListChecks,
  LucideIcon,
  PackageCheck,
  ReceiptText,
  Settings,
  ShoppingCart,
  Store,
  Tag,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";

export type AppIconName =
  | "analytics"
  | "cart"
  | "cashier"
  | "customers"
  | "end-day"
  | "home"
  | "kitchen"
  | "menu"
  | "menu-images"
  | "notifications"
  | "orders"
  | "overview"
  | "profile"
  | "receipts"
  | "rewards"
  | "system"
  | "unpaid"
  | "voucher-requests"
  | "vouchers";

const icons: Record<AppIconName, LucideIcon> = {
  analytics: BarChart3,
  cart: ShoppingCart,
  cashier: WalletCards,
  customers: UsersRound,
  "end-day": PackageCheck,
  home: House,
  kitchen: CookingPot,
  menu: Coffee,
  "menu-images": Images,
  notifications: Bell,
  orders: ListChecks,
  overview: LayoutDashboard,
  profile: UserRound,
  receipts: ReceiptText,
  rewards: Gift,
  system: Settings,
  unpaid: CircleDollarSign,
  "voucher-requests": BookOpenText,
  vouchers: Tag,
};

export function AppIcon({ name }: { name: AppIconName }) {
  const Icon = icons[name] || Store;
  return <Icon aria-hidden="true" focusable="false" strokeWidth={1.8} />;
}
