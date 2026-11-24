import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductsService } from '../catalog/products/products.service.js';
import { WishlistItem } from './entities/wishlist.entity.js';

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(WishlistItem)
    private readonly repo: Repository<WishlistItem>,
    private readonly products: ProductsService,
  ) {}

  list(customerId: string) {
    return this.repo.find({
      where: { customerId },
      relations: { product: true },
      order: { createdAt: 'DESC' },
    });
  }

  /** Idempotent: adding twice keeps one row. */
  async add(customerId: string, productId: string) {
    await this.products.findOne(productId); // 404 for unknown products
    await this.repo
      .createQueryBuilder()
      .insert()
      .values({ customerId, productId })
      .orIgnore()
      .execute();
    return this.list(customerId);
  }

  async remove(customerId: string, productId: string): Promise<void> {
    const { affected } = await this.repo.delete({ customerId, productId });
    if (!affected) throw new NotFoundException('Item not in wishlist');
  }
}
