import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { OffersService } from '../offers/offers.service.js';
import { OrdersService } from '../orders/orders.service.js';
import type { User } from '../users/entities/user.entity.js';
import { ProductsService } from '../catalog/products/products.service.js';
import { ProductStatus } from '../catalog/products/entities/product.entity.js';
import { fromMinor, toMinor } from '../common/money.js';
import type { AddItemDto } from './dto/create-cart.dto.js';
import { Cart, CartStatus } from './entities/cart.entity.js';
import { CartItem } from './entities/cart-item.entity.js';

export interface CartLine {
  productId: string;
  sku: string;
  name: string;
  image: string | null;
  quantity: number;
  unitPrice: number;
  unitPriceMinor: number;
  weightGrams: number;
  categoryId: string | null;
  lineTotal: number;
  available: number;
  /** Set when the line can no longer be bought as-is. */
  issue: 'unavailable' | 'insufficient_stock' | null;
}

export interface CartView {
  id: string;
  customerId: string | null;
  couponCode: string | null;
  status: CartStatus;
  currency: string;
  items: CartLine[];
  subtotal: number;
}

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart) private readonly carts: Repository<Cart>,
    @InjectRepository(CartItem) private readonly items: Repository<CartItem>,
    private readonly products: ProductsService,
    private readonly offers: OffersService,
    private readonly orders: OrdersService,
  ) {}

  /** Signed-in users get their one active cart back instead of piling up new ones. */
  async create(user: User | null): Promise<CartView> {
    if (user) {
      const existing = await this.carts.findOne({
        where: { customerId: user.id, status: CartStatus.ACTIVE },
        order: { createdAt: 'DESC' },
      });
      if (existing) return this.view(existing.id, user);
    }
    const cart = await this.carts.save(
      this.carts.create({ customerId: user?.id ?? null }),
    );
    return this.view(cart.id, user);
  }

  /** Attach a guest cart to the user who just signed in. */
  async claim(id: string, user: User): Promise<CartView> {
    const cart = await this.activeCart(id, user);
    if (cart.customerId === null)
      await this.carts.update(
        { id, customerId: IsNull() },
        { customerId: user.id },
      );
    return this.view(id, user);
  }

  async applyCoupon(
    id: string,
    code: string,
    user: User | null,
  ): Promise<CartView> {
    await this.activeCart(id, user);
    const view = await this.view(id, user);
    if (view.items.length === 0)
      throw new BadRequestException('Add items before applying a coupon');
    // Throws 400 with the reason when the coupon cannot apply to this cart.
    await this.offers.evaluate(
      {
        lines: view.items.map((l) => ({
          productId: l.productId,
          categoryId: l.categoryId,
          quantity: l.quantity,
          unitPriceMinor: l.unitPriceMinor,
        })),
        subtotalMinor: toMinor(view.subtotal),
        shippingMinor: 0,
        customerKey: user?.id ?? null,
        priorOrders: user
          ? await this.orders.countPlaced({ userId: user.id })
          : 0,
      },
      code,
    );
    await this.carts.update(id, { couponCode: code.trim().toUpperCase() });
    return this.view(id, user);
  }

  async removeCoupon(id: string, user: User | null): Promise<CartView> {
    await this.activeCart(id, user);
    await this.carts.update(id, { couponCode: null });
    return this.view(id, user);
  }

  async view(id: string, user: User | null): Promise<CartView> {
    const cart = await this.carts.findOne({
      where: { id },
      relations: { items: true },
    });
    if (!cart) throw new NotFoundException(`Cart ${id} not found`);
    this.assertAccess(cart, user);

    const lines: CartLine[] = [];
    let currency = 'INR';
    for (const item of cart.items) {
      // Prices are always read live; the cart stores only quantities.
      const product = await this.products
        .findOne(item.productId)
        .catch(() => null);
      if (!product) {
        await this.items.delete({ cartId: id, productId: item.productId });
        continue;
      }
      currency = product.currency;
      const available = product.stock
        ? product.stock.onHand - product.stock.reserved
        : 0;
      // A product that went price-on-request after being added can no longer be bought.
      const price = product.price ?? 0;
      const sellable =
        product.status === ProductStatus.ACTIVE && product.price !== null;
      lines.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        image: product.images[0] ?? null,
        quantity: item.quantity,
        unitPrice: price,
        unitPriceMinor: toMinor(price),
        weightGrams: product.weightGrams,
        categoryId: product.categoryId,
        lineTotal: fromMinor(toMinor(price) * item.quantity),
        available,
        issue: !sellable
          ? 'unavailable'
          : available < item.quantity
            ? 'insufficient_stock'
            : null,
      });
    }
    lines.sort((a, b) => a.name.localeCompare(b.name));
    return {
      id: cart.id,
      customerId: cart.customerId,
      couponCode: cart.couponCode,
      status: cart.status,
      currency,
      items: lines,
      subtotal: fromMinor(
        lines.reduce((sum, l) => sum + toMinor(l.unitPrice) * l.quantity, 0),
      ),
    };
  }

  async addItem(
    cartId: string,
    dto: AddItemDto,
    user: User | null,
  ): Promise<CartView> {
    await this.activeCart(cartId, user);
    const product = await this.products.findOne(dto.productId);
    if (product.status !== ProductStatus.ACTIVE) {
      throw new BadRequestException('Product is not available');
    }
    if (product.price === null) {
      throw new BadRequestException(
        'This product is price on request: contact the store',
      );
    }
    const existing = await this.items.findOneBy({
      cartId,
      productId: dto.productId,
    });
    const quantity = (existing?.quantity ?? 0) + dto.quantity;
    this.assertStock(product.stock, quantity);
    await this.items.save({ cartId, productId: dto.productId, quantity });
    return this.view(cartId, user);
  }

  async setQuantity(
    cartId: string,
    productId: string,
    quantity: number,
    user: User | null,
  ): Promise<CartView> {
    await this.activeCart(cartId, user);
    if (quantity === 0) return this.removeItem(cartId, productId, user);
    const existing = await this.items.findOneBy({ cartId, productId });
    if (!existing) throw new NotFoundException('Item not in cart');
    const product = await this.products.findOne(productId);
    this.assertStock(product.stock, quantity);
    await this.items.update({ cartId, productId }, { quantity });
    return this.view(cartId, user);
  }

  async removeItem(
    cartId: string,
    productId: string,
    user: User | null,
  ): Promise<CartView> {
    await this.activeCart(cartId, user);
    await this.items.delete({ cartId, productId });
    return this.view(cartId, user);
  }

  async clear(cartId: string, user: User | null): Promise<CartView> {
    await this.activeCart(cartId, user);
    await this.items.delete({ cartId });
    return this.view(cartId, user);
  }

  /** Called by checkout once the order exists. Atomic: only one caller wins. */
  async markConverted(cartId: string): Promise<boolean> {
    const result = await this.carts.update(
      { id: cartId, status: CartStatus.ACTIVE },
      { status: CartStatus.CONVERTED },
    );
    return (result.affected ?? 0) > 0;
  }

  /** Undo markConverted when checkout fails after claiming the cart. */
  async reopen(cartId: string): Promise<void> {
    await this.carts.update({ id: cartId }, { status: CartStatus.ACTIVE });
  }

  /** A cart that belongs to a user is only visible to that user; guest carts are addressed by their id. */
  private assertAccess(cart: Cart, user: User | null): void {
    if (cart.customerId && cart.customerId !== user?.id) {
      throw new NotFoundException(`Cart ${cart.id} not found`);
    }
  }

  private async activeCart(id: string, user: User | null): Promise<Cart> {
    const cart = await this.carts.findOneBy({ id });
    if (!cart) throw new NotFoundException(`Cart ${id} not found`);
    this.assertAccess(cart, user);
    if (cart.status !== CartStatus.ACTIVE) {
      throw new ConflictException('Cart has already been checked out');
    }
    return cart;
  }

  private assertStock(
    stock: { onHand: number; reserved: number } | null,
    wanted: number,
  ): void {
    const available = stock ? stock.onHand - stock.reserved : 0;
    if (wanted > available) {
      throw new ConflictException(`Only ${available} left in stock`);
    }
  }
}
