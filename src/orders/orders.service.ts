import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  Not,
  Repository,
} from 'typeorm';
import { StockService } from '../catalog/stock/stock.service.js';
import { OffersService } from '../offers/offers.service.js';
import {
  PAYMENT_SUCCEEDED,
  type PaymentEvent,
} from '../payment/payment-provider.js';
import { PaymentService } from '../payment/payment.service.js';
import {
  REFUND_SUCCEEDED,
  type RefundSucceededEvent,
} from '../refunds/refunds.events.js';
import {
  SHIPMENT_UPDATED,
  type ShipmentUpdatedEvent,
} from '../shipping/shipping.events.js';
import type { User } from '../users/entities/user.entity.js';
import { can } from '../roles/permissions.js';
import type { AdminListOrdersQuery, ListOrdersQuery } from './dto/order.dto.js';
import { OrderEvent } from './entities/order-event.entity.js';
import { likeOf, paginateQb, type Paginated } from '../common/pagination.js';
import { OrderItem } from './entities/order-item.entity.js';
import { Order, OrderStatus, PaymentState } from './entities/order.entity.js';
import {
  ORDER_CANCELLED,
  ORDER_STATUS_CHANGED,
  type OrderCancelledEvent,
  type OrderStatusChangedEvent,
} from './orders.events.js';

const FULL_ORDER_NUMBER = /^DIA-[A-Z0-9]{8,}$/i;
const FULL_EMAIL = /^[^\s@%_]+@[^\s@%_]+\.[a-z]{2,}$/i;

const lines = (order: Order) =>
  order.items.map((i) => ({ productId: i.productId, quantity: i.quantity }));

type NewOrder = Omit<
  Order,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'items'
  | 'status'
  | 'paymentStatus'
  | 'paidAt'
  | 'deliveredAt'
  | 'cancelledAt'
  | 'cancelReason'
> & { items: Omit<OrderItem, 'id' | 'orderId' | 'order'>[] };

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderEvent)
    private readonly timeline: Repository<OrderEvent>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stock: StockService,
    private readonly offers: OffersService,
    private readonly payments: PaymentService,
    private readonly events: EventEmitter2,
  ) {}

  // --- creation (called by checkout, inside its transaction) ---

  async create(data: NewOrder, manager: EntityManager): Promise<Order> {
    const { items, ...fields } = data;
    const order = await manager.save(
      manager.create(Order, {
        ...fields,
        items: items.map((i) => Object.assign(new OrderItem(), i)),
      }),
    );
    await this.addEvent(order.id, 'placed', {
      message: `Order ${order.number} placed`,
      manager,
    });
    return order;
  }

  // --- reading ---

  async findOne(id: string): Promise<Order> {
    const order = await this.orders.findOne({
      where: { id },
      relations: { items: true },
    });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }

  /**
   * Owner or admin. Orders placed as a guest have no owner and are addressed by their
   * unguessable id alone. Anyone else gets a 404, so ids cannot be probed.
   */
  async findForUser(id: string, user: User | null) {
    const order = await this.findOne(id);
    this.assertCanView(order, user);
    return order;
  }

  /** Order with payments and timeline, for the detail screen. */
  async detail(id: string, user: User | null) {
    const order = await this.findForUser(id, user);
    const [payments, history] = await Promise.all([
      this.payments.findByOrder(id),
      this.timeline.find({
        where: { orderId: id },
        order: { createdAt: 'ASC' },
      }),
    ]);
    return Object.assign(order, { payments, timeline: history });
  }

  async listForUser(
    userId: string,
    query: ListOrdersQuery,
  ): Promise<Paginated<Order>> {
    const [items, total] = await this.orders.findAndCount({
      where: { customerId: userId },
      relations: { items: true },
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    return { items, total, page: query.page, size: query.size };
  }

  async listAll(query: AdminListOrdersQuery): Promise<Paginated<Order>> {
    const qb = this.orders.createQueryBuilder('o');
    if (query.status) qb.andWhere('o.status = :status', { status: query.status });
    if (query.paymentStatus) qb.andWhere('o."paymentStatus" = :ps', { ps: query.paymentStatus });
    if (query.from) qb.andWhere('o."createdAt" >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('o."createdAt" <= :to', { to: new Date(query.to) });
    if (query.q) {
      if (FULL_ORDER_NUMBER.test(query.q)) {
        // A whole order number is one unique-index lookup.
        qb.andWhere('o.number = :number', { number: query.q.toUpperCase() });
      } else if (FULL_EMAIL.test(query.q)) {
        // A whole email is one btree range scan.
        qb.andWhere('o.email IN (:...emails)', { emails: [...new Set([query.q, query.q.toLowerCase()])] });
      } else {
        // Substring search runs on trigram indexes (see the PerformanceIndexes migration).
        qb.andWhere('(o.number ILIKE :like OR o.email ILIKE :like)', { like: likeOf(query.q) });
      }
    }
    const page = await paginateQb(qb.clone().orderBy('o."createdAt"', 'DESC'), qb, query);
    await this.attachItems(page.items);
    return page;
  }

  /** One query for the items of a whole page, instead of a join that multiplies the page query. */
  private async attachItems(orders: Order[]): Promise<void> {
    if (orders.length === 0) return;
    const items = await this.dataSource.getRepository(OrderItem).find({
      where: { orderId: In(orders.map((o) => o.id)) },
    });
    const byOrder = new Map<string, OrderItem[]>();
    for (const i of items) byOrder.set(i.orderId, [...(byOrder.get(i.orderId) ?? []), i]);
    for (const o of orders) o.items = byOrder.get(o.id) ?? [];
  }

  /** Orders already placed by this customer (not cancelled). For first-order-only offers. */
  countPlaced(who: { userId?: string; email?: string }): Promise<number> {
    if (!who.userId && !who.email) return Promise.resolve(0);
    return this.orders.countBy({
      ...(who.userId ? { customerId: who.userId } : { email: who.email }),
      status: Not(OrderStatus.CANCELLED),
    });
  }

  // --- payment ---

  /** Start (another) payment for an unpaid order. */
  async pay(id: string, providerName: string, user: User | null) {
    const order = await this.findForUser(id, user);
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new ConflictException(`Order is ${order.status}`);
    }
    const payment = await this.payments.initiate(order, providerName);
    if (payment.mode === 'offline') await this.confirmOffline(order.id);
    return { order: await this.findOne(id), payment };
  }

  /** Cash on delivery: the sale is certain, so commit the reserved stock now. */
  async confirmOffline(id: string): Promise<void> {
    const confirmed = await this.dataSource.transaction(async (m) => {
      const { affected } = await m.update(
        Order,
        { id, status: OrderStatus.PENDING_PAYMENT },
        { status: OrderStatus.CONFIRMED },
      );
      if (!affected) return false;
      const order = await this.load(m, id);
      await this.stock.commit(
        { reference: order.number, items: lines(order) },
        m,
      );
      await this.addEvent(id, 'confirmed', {
        message: 'Placed with cash on delivery',
        manager: m,
      });
      return true;
    });
    if (confirmed) await this.notify(id, 'confirmed');
  }

  // --- cancellation ---

  /** pending_payment -> cancelled: release the reserved stock and the offer use, atomically. */
  async cancelPending(
    id: string,
    reason: string,
    actorId: string | null = null,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (m) => {
      const { affected } = await m.update(
        Order,
        { id, status: OrderStatus.PENDING_PAYMENT },
        {
          status: OrderStatus.CANCELLED,
          cancelReason: reason,
          cancelledAt: new Date(),
        },
      );
      if (!affected) return false;
      const order = await this.load(m, id);
      await this.stock.release(
        { reference: order.number, items: lines(order) },
        m,
      );
      await this.offers.release(id, m);
      await this.addEvent(id, 'cancelled', {
        message: `Cancelled: ${reason}`,
        actorId,
        manager: m,
      });
      return true;
    });
  }

  /**
   * Cancel by the customer or an admin. Before payment: release the reservation.
   * After payment but before shipping: put the stock back and ask for a refund.
   */
  async cancel(id: string, user: User, reason: string): Promise<Order> {
    const order = await this.findForUser(id, user);
    if (order.status === OrderStatus.PENDING_PAYMENT) {
      if (!(await this.cancelPending(id, reason, user.id))) {
        throw new ConflictException('Order changed meanwhile, try again');
      }
      return this.findOne(id);
    }
    if (
      order.status !== OrderStatus.CONFIRMED &&
      order.status !== OrderStatus.PROCESSING
    ) {
      throw new ConflictException(
        `A ${order.status} order cannot be cancelled`,
      );
    }

    const refundDue = await this.dataSource.transaction(async (m) => {
      const { affected } = await m.update(
        Order,
        { id, status: In([OrderStatus.CONFIRMED, OrderStatus.PROCESSING]) },
        {
          status: OrderStatus.CANCELLED,
          cancelReason: reason,
          cancelledAt: new Date(),
        },
      );
      if (!affected)
        throw new ConflictException('Order changed meanwhile, try again');
      const fresh = await this.load(m, id);
      await this.stock.restock(
        { reference: fresh.number, items: lines(fresh) },
        m,
      );
      await this.offers.release(id, m);
      await this.addEvent(id, 'cancelled', {
        message: `Cancelled: ${reason}`,
        actorId: user.id,
        manager: m,
      });
      return fresh.paymentStatus === PaymentState.PAID;
    });

    const event: OrderCancelledEvent = {
      orderId: id,
      refundDue,
      actorId: user.id,
    };
    await this.events.emitAsync(ORDER_CANCELLED, event);
    return this.findOne(id);
  }

  // --- admin ---

  async startProcessing(id: string, actorId: string): Promise<Order> {
    const { affected } = await this.orders.update(
      { id, status: OrderStatus.CONFIRMED },
      { status: OrderStatus.PROCESSING },
    );
    if (!affected) {
      await this.findOne(id);
      throw new ConflictException('Only confirmed orders can start processing');
    }
    await this.addEvent(id, 'processing', {
      message: 'Order is being prepared',
      actorId,
    });
    return this.findOne(id);
  }

  async addNote(id: string, note: string, actorId: string) {
    await this.findOne(id);
    return this.addEvent(id, 'note', { message: note, actorId });
  }

  // --- reactions to other modules ---

  /** Idempotent: a redelivered webhook finds the order already moved on. */
  @OnEvent(PAYMENT_SUCCEEDED, { suppressErrors: false })
  async onPaymentSucceeded({
    orderId,
    paymentId,
  }: PaymentEvent): Promise<void> {
    const confirmed = await this.dataSource.transaction(async (m) => {
      const paidAt = new Date();
      const online = await m.update(
        Order,
        { id: orderId, status: OrderStatus.PENDING_PAYMENT },
        {
          status: OrderStatus.CONFIRMED,
          paymentStatus: PaymentState.PAID,
          paidAt,
        },
      );
      if (online.affected) {
        const order = await this.load(m, orderId);
        await this.stock.commit(
          { reference: order.number, items: lines(order) },
          m,
        );
        await this.addEvent(orderId, 'payment_succeeded', {
          message: 'Payment received',
          data: { paymentId },
          manager: m,
        });
        return true;
      }
      // Cash on delivery: collected later, stock was committed at placement.
      const cod = await m.update(
        Order,
        {
          id: orderId,
          paymentStatus: PaymentState.UNPAID,
          status: Not(In([OrderStatus.CANCELLED, OrderStatus.PENDING_PAYMENT])),
        },
        { paymentStatus: PaymentState.PAID, paidAt },
      );
      if (cod.affected) {
        await this.addEvent(orderId, 'payment_succeeded', {
          message: 'Cash collected',
          data: { paymentId },
          manager: m,
        });
        return false;
      }
      const order = await m.findOneBy(Order, { id: orderId });
      if (order?.status === OrderStatus.CANCELLED) {
        // Customer paid after the stock was released. Needs a refund, not a silent drop.
        this.logger.error(
          `Order ${order.number} was paid after cancellation: refund required`,
        );
        await this.addEvent(orderId, 'paid_after_cancel', {
          message: 'Paid after cancellation: refund required',
          data: { paymentId },
          manager: m,
        });
      }
      return false;
    });
    if (confirmed) await this.notify(orderId, 'confirmed');
  }

  @OnEvent(SHIPMENT_UPDATED, { suppressErrors: false })
  async onShipmentUpdated(e: ShipmentUpdatedEvent): Promise<void> {
    const open = In([
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
    ]);
    if (e.allDelivered) {
      const { affected } = await this.orders.update(
        { id: e.orderId, status: open },
        { status: OrderStatus.DELIVERED, deliveredAt: new Date() },
      );
      if (affected) {
        await this.addEvent(e.orderId, 'delivered', { message: 'Delivered' });
        await this.notify(e.orderId, 'delivered');
      }
      return;
    }
    const next = e.fullyShipped ? OrderStatus.SHIPPED : OrderStatus.PROCESSING;
    const { affected } = await this.orders.update(
      { id: e.orderId, status: open },
      { status: next },
    );
    if (affected) {
      await this.addEvent(
        e.orderId,
        next === OrderStatus.SHIPPED ? 'shipped' : 'partially_shipped',
        {
          message:
            next === OrderStatus.SHIPPED
              ? 'Shipped'
              : 'Part of the order shipped',
          data: { shipmentId: e.shipmentId },
        },
      );
      if (next === OrderStatus.SHIPPED) await this.notify(e.orderId, 'shipped');
    }
  }

  @OnEvent(REFUND_SUCCEEDED, { suppressErrors: false })
  async onRefundSucceeded(e: RefundSucceededEvent): Promise<void> {
    const state =
      e.refundedMinor >= e.paidMinor
        ? PaymentState.REFUNDED
        : PaymentState.PARTIALLY_REFUNDED;
    await this.orders.update({ id: e.orderId }, { paymentStatus: state });
    await this.addEvent(e.orderId, 'refunded', {
      message: `Refunded ${e.refundedMinor / 100} of ${e.paidMinor / 100}`,
      data: { refundedMinor: e.refundedMinor },
    });
  }

  // --- internals ---

  private notify(orderId: string, status: OrderStatusChangedEvent['status']) {
    return this.events.emitAsync(ORDER_STATUS_CHANGED, { orderId, status });
  }

  async addEvent(
    orderId: string,
    type: string,
    opts: {
      message?: string;
      data?: Record<string, unknown>;
      actorId?: string | null;
      manager?: EntityManager;
    } = {},
  ): Promise<OrderEvent> {
    const repo = opts.manager
      ? opts.manager.getRepository(OrderEvent)
      : this.timeline;
    return repo.save(
      repo.create({
        orderId,
        type,
        message: opts.message ?? null,
        data: opts.data ?? null,
        actorId: opts.actorId ?? null,
      }),
    );
  }

  private assertCanView(order: Order, user: User | null): void {
    if (can(user, 'orders')) return;
    if (order.customerId === null) return; // guest order: the id is the capability
    if (user && order.customerId === user.id) return;
    throw new NotFoundException(`Order ${order.id} not found`);
  }

  private load(m: EntityManager, id: string): Promise<Order> {
    return m.findOneOrFail(Order, {
      where: { id },
      relations: { items: true },
    });
  }
}
