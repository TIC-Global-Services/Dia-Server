import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import type { Paginated } from '../../common/pagination.js';
import {
  STOCK_CHANGED,
  type StockChangedEvent,
} from '../../search/product-document.js';
import type {
  AdjustStockDto,
  StockLinesDto,
  UpdateThresholdDto,
} from './dto/create-stock.dto.js';
import type { ListMovementsQuery } from './dto/update-stock.dto.js';
import { Stock } from './entities/stock.entity.js';
import {
  StockMovement,
  StockMovementReason,
} from './entities/stock-movement.entity.js';

type Line = { productId: string; quantity: number };

export interface StockView extends Stock {
  available: number;
}

const view = (stock: Stock): StockView =>
  Object.assign(stock, { available: stock.onHand - stock.reserved });

/**
 * Every mutation is one guarded UPDATE: the WHERE clause refuses a change that
 * would oversell, so concurrent requests can never push counters out of range.
 * Multi-line operations lock rows in productId order to avoid deadlocks.
 */
@Injectable()
export class StockService {
  constructor(
    @InjectRepository(Stock) private readonly repo: Repository<Stock>,
    private readonly events: EventEmitter2,
  ) {}

  async findOne(productId: string): Promise<StockView> {
    const stock = await this.repo.findOneBy({ productId });
    if (!stock) throw new NotFoundException(`No stock for ${productId}`);
    return view(stock);
  }

  async findLow(): Promise<StockView[]> {
    const rows = await this.repo
      .createQueryBuilder('s')
      // Same test as "available <= threshold", written so one expression index can answer it.
      .where('(s."onHand" - s."reserved" - s."lowStockThreshold") <= 0')
      .orderBy('(s."onHand" - s."reserved" - s."lowStockThreshold")', 'ASC')
      .limit(500)
      .getMany();
    return rows.map(view);
  }

  async movements(
    productId: string,
    query: ListMovementsQuery,
  ): Promise<Paginated<StockMovement>> {
    const [items, total] = await this.repo.manager.findAndCount(StockMovement, {
      where: { productId },
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    return { items, total, page: query.page, size: query.size };
  }

  async setThreshold(
    productId: string,
    dto: UpdateThresholdDto,
  ): Promise<StockView> {
    const { affected } = await this.repo.update({ productId }, dto);
    if (!affected) throw new NotFoundException(`No stock for ${productId}`);
    return this.findOne(productId);
  }

  async adjust(productId: string, dto: AdjustStockDto): Promise<StockView> {
    await this.repo.manager.transaction(async (manager) => {
      const result = await manager.query(
        `UPDATE stock SET "onHand" = "onHand" + $2, "updatedAt" = now()
         WHERE "productId" = $1 AND "onHand" + $2 >= "reserved"
         RETURNING "productId"`,
        [productId, dto.delta],
      );
      await this.assertUpdated(manager, result, [productId], 'adjust');
      await this.record(manager, [{ productId, quantity: dto.delta }], {
        reason: dto.reason,
        reference: dto.reference,
        note: dto.note,
        onHand: (q) => q,
      });
    });
    const [row] = await this.afterChange([productId]);
    return row;
  }

  /** Hold stock for a pending order. Fails the whole call if any line is short. */
  async reserve(
    dto: StockLinesDto,
    manager?: EntityManager,
  ): Promise<StockView[]> {
    return this.applyLines(dto, manager, {
      sql: `UPDATE stock SET "reserved" = "reserved" + $2, "updatedAt" = now()
            WHERE "productId" = $1 AND "onHand" - "reserved" >= $2
            RETURNING "productId"`,
      reason: StockMovementReason.RESERVE,
      reserved: (q) => q,
    });
  }

  /** Give held stock back (order cancelled / cart expired). */
  async release(
    dto: StockLinesDto,
    manager?: EntityManager,
  ): Promise<StockView[]> {
    return this.applyLines(dto, manager, {
      sql: `UPDATE stock SET "reserved" = "reserved" - $2, "updatedAt" = now()
            WHERE "productId" = $1 AND "reserved" >= $2
            RETURNING "productId"`,
      reason: StockMovementReason.RELEASE,
      reserved: (q) => -q,
    });
  }

  /** Put sold units back on the shelf (order cancelled after the stock was committed). */
  async restock(
    dto: StockLinesDto,
    manager?: EntityManager,
  ): Promise<StockView[]> {
    return this.applyLines(dto, manager, {
      sql: `UPDATE stock SET "onHand" = "onHand" + $2, "updatedAt" = now()
            WHERE "productId" = $1
            RETURNING "productId"`,
      reason: StockMovementReason.RETURN,
      onHand: (q) => q,
    });
  }

  /** Turn a reservation into a sale (order paid / shipped). */
  async commit(
    dto: StockLinesDto,
    manager?: EntityManager,
  ): Promise<StockView[]> {
    return this.applyLines(dto, manager, {
      sql: `UPDATE stock SET "reserved" = "reserved" - $2, "onHand" = "onHand" - $2, "updatedAt" = now()
            WHERE "productId" = $1 AND "reserved" >= $2
            RETURNING "productId"`,
      reason: StockMovementReason.SALE,
      reserved: (q) => -q,
      onHand: (q) => -q,
    });
  }

  /**
   * Pass `manager` to run inside the caller's transaction (e.g. order status +
   * stock commit must succeed or fail together).
   */
  private async applyLines(
    dto: StockLinesDto,
    manager: EntityManager | undefined,
    op: {
      sql: string;
      reason: StockMovementReason;
      onHand?: (q: number) => number;
      reserved?: (q: number) => number;
    },
  ): Promise<StockView[]> {
    const lines = [...dto.items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    );
    const ids = lines.map((l) => l.productId);

    const work = async (m: EntityManager) => {
      for (const line of lines) {
        const result = await m.query(op.sql, [line.productId, line.quantity]);
        await this.assertUpdated(m, result, [line.productId], op.reason);
      }
      await this.record(m, lines, {
        reason: op.reason,
        reference: dto.reference,
        onHand: op.onHand,
        reserved: op.reserved,
      });
      // Read inside the transaction so callers see their own writes.
      return this.afterChange(ids, m);
    };
    return manager ? work(manager) : this.repo.manager.transaction(work);
  }

  /** Distinguishes "no such product" (404) from "not enough stock" (409). */
  private async assertUpdated(
    manager: EntityManager,
    result: unknown,
    ids: string[],
    action: string,
  ): Promise<void> {
    // pg returns [rows, rowCount] for UPDATE ... RETURNING via manager.query
    const rows = Array.isArray(result) ? (result[0] as unknown[]) : [];
    if (Array.isArray(rows) && rows.length > 0) return;
    const exists = await manager.existsBy(Stock, { productId: ids[0] });
    if (!exists) throw new NotFoundException(`No stock for ${ids[0]}`);
    throw new ConflictException(
      `Insufficient stock to ${action} product ${ids[0]}`,
    );
  }

  private async record(
    manager: EntityManager,
    lines: Line[],
    opts: {
      reason: StockMovementReason;
      reference?: string | null;
      note?: string | null;
      onHand?: (q: number) => number;
      reserved?: (q: number) => number;
    },
  ): Promise<void> {
    await manager.insert(
      StockMovement,
      lines.map((l) => ({
        productId: l.productId,
        onHandDelta: opts.onHand?.(l.quantity) ?? 0,
        reservedDelta: opts.reserved?.(l.quantity) ?? 0,
        reason: opts.reason,
        reference: opts.reference ?? null,
        note: opts.note ?? null,
      })),
    );
  }

  /** Reload, notify the search index, return fresh state. */
  private async afterChange(
    ids: string[],
    manager: EntityManager = this.repo.manager,
  ): Promise<StockView[]> {
    const rows = (
      await manager.findBy(
        Stock,
        ids.map((productId) => ({ productId })),
      )
    ).map(view);
    for (const row of rows) {
      const event: StockChangedEvent = {
        productId: row.productId,
        available: row.available,
      };
      await this.events.emitAsync(STOCK_CHANGED, event);
    }
    return rows;
  }
}
