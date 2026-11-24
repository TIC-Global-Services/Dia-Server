import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { rethrowDbError } from '../common/db-errors.js';
import type {
  CreateRateDto,
  CreateZoneDto,
  UpdateRateDto,
  UpdateZoneDto,
} from './dto/shipping.dto.js';
import { ShippingRate, ShippingZone } from './entities/shipping.entity.js';

export interface ShipToAddress {
  country: string;
  state: string;
  postalCode: string;
}

export interface ShippingOption {
  rateId: string;
  code: string;
  name: string;
  carrier: string | null;
  priceMinor: number;
  minDays: number;
  maxDays: number;
}

const norm = (s: string) => s.trim().toLowerCase();

@Injectable()
export class ShippingService {
  constructor(
    @InjectRepository(ShippingZone)
    private readonly zones: Repository<ShippingZone>,
    @InjectRepository(ShippingRate)
    private readonly rates: Repository<ShippingRate>,
  ) {}

  // --- quoting ---

  /** Options for an address, cheapest first. Throws 422 when the address is not served. */
  async quote(input: {
    address: ShipToAddress;
    weightGrams: number;
    subtotalMinor: number;
  }): Promise<ShippingOption[]> {
    const zone = await this.matchZone(input.address);
    if (!zone)
      throw new UnprocessableEntityException(
        'We do not ship to this address yet',
      );

    const options = zone.rates
      .filter(
        (r) =>
          r.isActive &&
          (r.maxWeightGrams === null || input.weightGrams <= r.maxWeightGrams),
      )
      .map((r) => ({
        rateId: r.id,
        code: r.code,
        name: r.name,
        carrier: r.carrier,
        priceMinor: this.price(r, input.weightGrams, input.subtotalMinor),
        minDays: r.minDays,
        maxDays: r.maxDays,
      }))
      .sort((a, b) => a.priceMinor - b.priceMinor || a.minDays - b.minDays);

    if (options.length === 0) {
      throw new UnprocessableEntityException(
        'No shipping option available for this order',
      );
    }
    return options;
  }

  private price(
    rate: ShippingRate,
    weightGrams: number,
    subtotalMinor: number,
  ): number {
    if (rate.freeOverMinor !== null && subtotalMinor >= rate.freeOverMinor)
      return 0;
    const extraKg = Math.max(0, Math.ceil(weightGrams / 1000) - 1);
    return rate.baseMinor + rate.perKgMinor * extraKg;
  }

  private async matchZone(a: ShipToAddress): Promise<ShippingZone | null> {
    const zones = await this.zones.find({
      where: { isActive: true },
      relations: { rates: true },
      order: { priority: 'DESC', createdAt: 'ASC' },
    });
    const country = a.country.toUpperCase();
    return (
      zones.find((z) => {
        if (!z.countries.includes('*') && !z.countries.includes(country))
          return false;
        if (z.states.length && !z.states.some((s) => norm(s) === norm(a.state)))
          return false;
        if (z.postalPrefixes.length) {
          const postal = a.postalCode.replace(/\s/g, '').toUpperCase();
          if (
            !z.postalPrefixes.some((p) =>
              postal.startsWith(p.replace(/\s/g, '').toUpperCase()),
            )
          )
            return false;
        }
        return true;
      }) ?? null
    );
  }

  /** Same maths as checkout, for the back office to try an address. */
  async estimate(input: { address: ShipToAddress; weightGrams: number; subtotalMinor: number }) {
    const zone = await this.matchZone(input.address);
    if (!zone) return { zone: null, options: [] as ShippingOption[] };
    const options = await this.quote(input).catch(() => [] as ShippingOption[]);
    return { zone: zone.name, options };
  }

  // --- admin: zones and rates ---

  createZone(dto: CreateZoneDto) {
    return this.zones.save(this.zones.create(dto));
  }

  listZones() {
    return this.zones.find({
      relations: { rates: true },
      order: { priority: 'DESC', createdAt: 'ASC' },
    });
  }

  async updateZone(id: string, dto: UpdateZoneDto) {
    const zone = await this.findZone(id);
    return this.zones.save(this.zones.merge(zone, dto));
  }

  async removeZone(id: string): Promise<void> {
    const { affected } = await this.zones.delete({ id });
    if (!affected) throw new NotFoundException(`Zone ${id} not found`);
  }

  async createRate(zoneId: string, dto: CreateRateDto) {
    await this.findZone(zoneId);
    try {
      return await this.rates.save(this.rates.create({ ...dto, zoneId }));
    } catch (err) {
      rethrowDbError(err, 'A rate with this code already exists in the zone');
    }
  }

  async updateRate(id: string, dto: UpdateRateDto) {
    const rate = await this.rates.findOneBy({ id });
    if (!rate) throw new NotFoundException(`Rate ${id} not found`);
    return this.rates.save(this.rates.merge(rate, dto));
  }

  async removeRate(id: string): Promise<void> {
    const { affected } = await this.rates.delete({ id });
    if (!affected) throw new NotFoundException(`Rate ${id} not found`);
  }

  private async findZone(id: string): Promise<ShippingZone> {
    const zone = await this.zones.findOneBy({ id });
    if (!zone) throw new NotFoundException(`Zone ${id} not found`);
    return zone;
  }
}
