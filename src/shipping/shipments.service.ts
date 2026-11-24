import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderStatus } from '../orders/entities/order.entity.js';
import { OrdersService } from '../orders/orders.service.js';
import type {
  CreateShipmentDto,
  UpdateShipmentStatusDto,
} from './dto/shipping.dto.js';
import {
  Shipment,
  ShipmentStatus,
  type ShipmentItem,
} from './entities/shipping.entity.js';
import {
  SHIPMENT_UPDATED,
  type ShipmentUpdatedEvent,
} from './shipping.events.js';

// Forward-only, so a late carrier update cannot undo a delivery.
const NEXT: Record<ShipmentStatus, ShipmentStatus[]> = {
  [ShipmentStatus.LABEL_CREATED]: [
    ShipmentStatus.IN_TRANSIT,
    ShipmentStatus.CANCELLED,
  ],
  [ShipmentStatus.IN_TRANSIT]: [
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.DELIVERED,
    ShipmentStatus.FAILED_ATTEMPT,
    ShipmentStatus.RETURNED,
    ShipmentStatus.CANCELLED,
  ],
  [ShipmentStatus.OUT_FOR_DELIVERY]: [
    ShipmentStatus.DELIVERED,
    ShipmentStatus.FAILED_ATTEMPT,
    ShipmentStatus.RETURNED,
  ],
  [ShipmentStatus.FAILED_ATTEMPT]: [
    ShipmentStatus.IN_TRANSIT,
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.RETURNED,
  ],
  [ShipmentStatus.DELIVERED]: [],
  [ShipmentStatus.RETURNED]: [],
  [ShipmentStatus.CANCELLED]: [],
};

const SHIPPABLE = [
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
];

@Injectable()
export class ShipmentsService {
  constructor(
    @InjectRepository(Shipment) private readonly repo: Repository<Shipment>,
    private readonly orders: OrdersService,
    private readonly events: EventEmitter2,
  ) {}

  async create(orderId: string, dto: CreateShipmentDto): Promise<Shipment> {
    const order = await this.orders.findOne(orderId);
    if (!SHIPPABLE.includes(order.status)) {
      throw new ConflictException(
        `Cannot ship an order that is ${order.status}`,
      );
    }

    const remaining = await this.remaining(orderId, order.items);
    const items: ShipmentItem[] =
      dto.items ??
      [...remaining.entries()]
        .filter(([, q]) => q > 0)
        .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    if (items.length === 0)
      throw new ConflictException(
        'Everything in this order is already shipped',
      );
    for (const item of items) {
      const left = remaining.get(item.orderItemId);
      if (left === undefined)
        throw new BadRequestException(
          `Item ${item.orderItemId} is not in this order`,
        );
      if (item.quantity > left) {
        throw new BadRequestException(
          `Only ${left} of item ${item.orderItemId} left to ship`,
        );
      }
    }

    const now = new Date();
    const shipment = await this.repo.save(
      this.repo.create({
        orderId,
        carrier: dto.carrier,
        trackingNumber: dto.trackingNumber,
        trackingUrl: dto.trackingUrl ?? null,
        status: ShipmentStatus.IN_TRANSIT,
        items,
        shippedAt: now,
        events: [
          {
            status: ShipmentStatus.IN_TRANSIT,
            at: now.toISOString(),
            note: 'Handed to carrier',
          },
        ],
      }),
    );
    await this.emit(shipment);
    return shipment;
  }

  async updateStatus(
    id: string,
    dto: UpdateShipmentStatusDto,
  ): Promise<Shipment> {
    const shipment = await this.findOne(id);
    if (!NEXT[shipment.status].includes(dto.status)) {
      throw new ConflictException(
        `Shipment cannot go from ${shipment.status} to ${dto.status}`,
      );
    }
    const now = new Date();
    // Conditional on the old status, so two carrier updates cannot both apply.
    const { affected } = await this.repo.update(
      { id, status: shipment.status },
      {
        status: dto.status,
        deliveredAt:
          dto.status === ShipmentStatus.DELIVERED ? now : shipment.deliveredAt,
        events: [
          ...shipment.events,
          { status: dto.status, at: now.toISOString(), note: dto.note },
        ],
      },
    );
    if (!affected)
      throw new ConflictException('Shipment changed meanwhile, try again');
    const updated = await this.findOne(id);
    await this.emit(updated);
    return updated;
  }

  async findOne(id: string): Promise<Shipment> {
    const shipment = await this.repo.findOneBy({ id });
    if (!shipment) throw new NotFoundException(`Shipment ${id} not found`);
    return shipment;
  }

  listForOrder(orderId: string): Promise<Shipment[]> {
    return this.repo.find({ where: { orderId }, order: { createdAt: 'ASC' } });
  }

  /** Units of each order line not yet on an active shipment. */
  private async remaining(
    orderId: string,
    items: { id: string; quantity: number }[],
  ): Promise<Map<string, number>> {
    const left = new Map(items.map((i) => [i.id, i.quantity]));
    for (const s of await this.listForOrder(orderId)) {
      if (
        s.status === ShipmentStatus.CANCELLED ||
        s.status === ShipmentStatus.RETURNED
      )
        continue;
      for (const i of s.items)
        left.set(i.orderItemId, (left.get(i.orderItemId) ?? 0) - i.quantity);
    }
    return left;
  }

  private async emit(shipment: Shipment): Promise<void> {
    const order = await this.orders.findOne(shipment.orderId);
    const remaining = await this.remaining(order.id, order.items);
    const fullyShipped = [...remaining.values()].every((q) => q <= 0);
    const active = (await this.listForOrder(order.id)).filter(
      (s) =>
        s.status !== ShipmentStatus.CANCELLED &&
        s.status !== ShipmentStatus.RETURNED,
    );
    const event: ShipmentUpdatedEvent = {
      orderId: order.id,
      shipmentId: shipment.id,
      fullyShipped,
      allDelivered:
        fullyShipped &&
        active.length > 0 &&
        active.every((s) => s.status === ShipmentStatus.DELIVERED),
    };
    await this.events.emitAsync(SHIPMENT_UPDATED, event);
  }
}
