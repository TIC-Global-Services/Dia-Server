import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity.js';

@Entity('cms_banners')
export class Banner extends BaseEntity {
  @Column({ length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  subtitle: string | null;

  /** The picture; for a video banner it is the poster shown until the video plays (and when it cannot). */
  @Column({ length: 500 })
  imageUrl: string;

  /** "image" or "video". */
  @Column({ length: 10, default: 'image' })
  mediaType: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  videoUrl: string | null;

  /** Text on the call-to-action button; it goes to linkUrl. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  buttonLabel: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  linkUrl: string | null;

  /** Where the storefront renders it, e.g. "home-hero", "category-top". */
  @Index()
  @Column({ length: 60 })
  placement: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endsAt: Date | null;
}
