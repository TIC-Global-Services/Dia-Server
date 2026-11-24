import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AddressesService } from '../addresses/addresses.service.js';
import { CartService, type CartView } from '../cart/cart.service.js';
import { StockService } from '../catalog/stock/stock.service.js';
import {
  OffersService,
  type AppliedOffer,
  type PricingLine,
} from '../offers/offers.service.js';
import type { ShippingAddress } from '../orders/entities/order.entity.js';
import { OrdersService } from '../orders/orders.service.js';
import { PaymentService } from '../payment/payment.service.js';
import {
  ShippingService,
  type ShipToAddress,
  type ShippingOption,
} from '../shipping/shipping.service.js';
import type { User } from '../users/entities/user.entity.js';
import type { CheckoutDto, QuoteDto } from './dto/create-checkout.dto.js';

const orderNumber = () =>
  `DIA-${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString('hex').toUpperCase()}`;

export interface Quote {
  currency: string;
  subtotalMinor: number;
  shippingOptions: ShippingOption[];
  /** The option the totals use: the one asked for, else the cheapest. */
  shipping: ShippingOption;
  offer: AppliedOffer | null;
  discountMinor: number;
  shippingMinor: number;
  shippingDiscountMinor: number;
  totalMinor: number;
}

@Injectable()
export class CheckoutService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly carts: CartService,
    private readonly stock: StockService,
    private readonly payments: PaymentService,
    private readonly orders: OrdersService,
    private readonly offers: OffersService,
    private readonly shipping: ShippingService,
    private readonly addresses: AddressesService,
  ) {}

  /** Full price breakdown the customer will be charged. Nothing is reserved or saved. */
  async quote(dto: QuoteDto, user: User | null) {
    const cart = await this.carts.view(dto.cartId, user);
    this.assertBuyable(cart);
    const ship = dto.addressId
      ? this.toShipTo(
          await this.requireUser(user, () =>
            this.addresses.findOne(user!.id, dto.addressId!),
          ),
        )
      : dto.address!;
    const quote = await this.price(
      cart,
      ship,
      dto.shippingRate,
      dto.couponCode ?? cart.couponCode,
      user,
      dto.email,
    );
    return { cartId: cart.id, lines: cart.items, ...quote };
  }

  /**
   * cart -> order: price, claim the cart, reserve stock, create the order (and use up the
   * offer), start the payment. A failure after a step undoes the steps before it.
   */
  async checkout(dto: CheckoutDto, user: User | null) {
    this.payments.assertEnabled(dto.paymentProvider);

    const email = (dto.email ?? user?.email)?.toLowerCase() || undefined;
    if (!email) throw new BadRequestException('email is required');

    const cart = await this.carts.view(dto.cartId, user);
    this.assertBuyable(cart);

    const address: ShippingAddress = dto.addressId
      ? this.toOrderAddress(
          await this.requireUser(user, () =>
            this.addresses.findOne(user!.id, dto.addressId!),
          ),
        )
      : {
          name: dto.shippingAddress!.fullName,
          phone: dto.shippingAddress!.phone,
          line1: dto.shippingAddress!.line1,
          line2: dto.shippingAddress!.line2,
          landmark: dto.shippingAddress!.landmark,
          city: dto.shippingAddress!.city,
          state: dto.shippingAddress!.state,
          postalCode: dto.shippingAddress!.postalCode,
          country: dto.shippingAddress!.country,
        };

    const quote = await this.price(
      cart,
      address,
      dto.shippingRate,
      dto.couponCode ?? cart.couponCode,
      user,
      email,
      true,
    );
    if (!(await this.carts.markConverted(cart.id))) {
      throw new ConflictException('Cart has already been checked out');
    }

    const number = orderNumber();
    const stockLines = cart.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
    }));
    try {
      await this.stock.reserve({ reference: number, items: stockLines });
    } catch (err) {
      await this.carts.reopen(cart.id);
      throw err;
    }

    let order;
    try {
      order = await this.dataSource.transaction(async (m) => {
        const created = await this.orders.create(
          {
            number,
            customerId: user?.id ?? null,
            email,
            phone: address.phone ?? null,
            shippingAddress: address,
            currency: quote.currency,
            subtotalMinor: quote.subtotalMinor,
            discountMinor: quote.discountMinor,
            shippingMinor: quote.shippingMinor,
            shippingDiscountMinor: quote.shippingDiscountMinor,
            totalMinor: quote.totalMinor,
            couponCode: quote.offer?.code ?? null,
            appliedOffer: quote.offer,
            shippingMethod: quote.shipping.name,
            items: cart.items.map((i) => ({
              productId: i.productId,
              sku: i.sku,
              name: i.name,
              image: i.image,
              unitPriceMinor: i.unitPriceMinor,
              quantity: i.quantity,
              lineTotalMinor: i.unitPriceMinor * i.quantity,
            })),
          },
          m,
        );
        // Taking the offer's last use and creating the order succeed or fail together.
        if (quote.offer)
          await this.offers.redeem(
            quote.offer,
            user?.id ?? email.toLowerCase(),
            created.id,
            m,
          );
        return created;
      });
    } catch (err) {
      await this.stock.release({ reference: number, items: stockLines });
      await this.carts.reopen(cart.id);
      throw err;
    }

    let payment;
    try {
      payment = await this.payments.initiate(order, dto.paymentProvider);
    } catch (err) {
      await this.orders.cancelPending(order.id, 'payment_init_failed');
      await this.carts.reopen(cart.id);
      throw err;
    }

    if (payment.mode === 'offline') await this.orders.confirmOffline(order.id);
    return { order: await this.orders.findOne(order.id), payment };
  }

  // --- internals ---

  private assertBuyable(cart: CartView): void {
    if (cart.items.length === 0) throw new BadRequestException('Cart is empty');
    const problems = cart.items.filter((i) => i.issue);
    if (problems.length) {
      throw new ConflictException({
        message: 'Some items cannot be purchased as they are',
        items: problems.map((i) => ({
          productId: i.productId,
          issue: i.issue,
          available: i.available,
        })),
      });
    }
  }

  private async price(
    cart: CartView,
    address: ShipToAddress,
    rateCode: string | undefined,
    couponCode: string | null | undefined,
    user: User | null,
    email: string | undefined,
    requireRate = false,
  ): Promise<Quote> {
    const subtotalMinor = cart.items.reduce(
      (sum, i) => sum + i.unitPriceMinor * i.quantity,
      0,
    );
    const weightGrams = cart.items.reduce(
      (sum, i) => sum + i.weightGrams * i.quantity,
      0,
    );

    const shippingOptions = await this.shipping.quote({
      address,
      weightGrams,
      subtotalMinor,
    });
    let shipping = shippingOptions[0]!;
    if (rateCode) {
      const chosen = shippingOptions.find((o) => o.code === rateCode);
      if (!chosen)
        throw new BadRequestException(
          `Shipping option "${rateCode}" is not available for this address`,
        );
      shipping = chosen;
    } else if (requireRate) {
      throw new BadRequestException('Choose a shipping option');
    }

    const lines: PricingLine[] = cart.items.map((i) => ({
      productId: i.productId,
      categoryId: i.categoryId,
      quantity: i.quantity,
      unitPriceMinor: i.unitPriceMinor,
    }));
    const customerKey = user?.id ?? email?.toLowerCase() ?? null;
    const offer = await this.offers.evaluate(
      {
        lines,
        subtotalMinor,
        shippingMinor: shipping.priceMinor,
        customerKey,
        priorOrders: await this.orders.countPlaced(
          user ? { userId: user.id } : { email },
        ),
      },
      couponCode,
    );

    const discountMinor = Math.min(offer?.discountMinor ?? 0, subtotalMinor);
    const shippingDiscountMinor = Math.min(
      offer?.shippingDiscountMinor ?? 0,
      shipping.priceMinor,
    );
    return {
      currency: cart.currency,
      subtotalMinor,
      shippingOptions,
      shipping,
      offer,
      discountMinor,
      shippingMinor: shipping.priceMinor,
      shippingDiscountMinor,
      totalMinor:
        subtotalMinor -
        discountMinor +
        shipping.priceMinor -
        shippingDiscountMinor,
    };
  }

  private async requireUser<T>(
    user: User | null,
    load: () => Promise<T>,
  ): Promise<T> {
    if (!user) throw new BadRequestException('Sign in to use a saved address');
    return load();
  }

  private toShipTo(a: {
    country: string;
    state: string;
    postalCode: string;
  }): ShipToAddress {
    return { country: a.country, state: a.state, postalCode: a.postalCode };
  }

  private toOrderAddress(a: {
    fullName: string;
    phone: string;
    line1: string;
    line2: string | null;
    landmark: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }): ShippingAddress {
    return {
      name: a.fullName,
      phone: a.phone,
      line1: a.line1,
      line2: a.line2,
      landmark: a.landmark,
      city: a.city,
      state: a.state,
      postalCode: a.postalCode,
      country: a.country,
    };
  }
}
