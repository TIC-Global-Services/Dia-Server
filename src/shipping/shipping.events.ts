export const SHIPMENT_UPDATED = 'shipment.updated';

export interface ShipmentUpdatedEvent {
  orderId: string;
  shipmentId: string;
  /** Every unit of the order is on a shipment that is not cancelled. */
  fullyShipped: boolean;
  /** Fully shipped and every active shipment delivered. */
  allDelivered: boolean;
}
