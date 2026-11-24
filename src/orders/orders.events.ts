export const ORDER_CANCELLED = 'order.cancelled';

export interface OrderCancelledEvent {
  orderId: string;
  /** The order had been paid online: it needs a refund. */
  refundDue: boolean;
  actorId: string | null;
}

/** The customer should hear about this step: order confirmed, shipped or delivered. */
export const ORDER_STATUS_CHANGED = 'order.status_changed';

export interface OrderStatusChangedEvent {
  orderId: string;
  status: 'confirmed' | 'shipped' | 'delivered';
}
