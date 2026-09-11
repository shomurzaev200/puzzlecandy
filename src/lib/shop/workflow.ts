export const ORDER_FLOW: Record<string, string[]> = {
  NEW: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "CANCELLED", "REFUNDED"],
  PROCESSING: ["PREPARING", "CANCELLED"],
  PREPARING: ["COURIER_ASSIGNED", "CANCELLED"],
  COURIER_ASSIGNED: ["IN_DELIVERY", "CANCELLED"],
  IN_DELIVERY: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["COMPLETED"],
  COMPLETED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(from: string, to: string): boolean {
  return (ORDER_FLOW[from] ?? []).includes(to);
}
