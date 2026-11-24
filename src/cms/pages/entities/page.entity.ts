import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity.js';

export enum PageStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

@Entity('cms_pages')
export class Page extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 160 })
  slug: string;

  @Column({ length: 200 })
  title: string;

  /** Markdown / HTML body. */
  @Column({ type: 'text', default: '' })
  content: string;

  /** Structured content blocks for page-builder style layouts. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  blocks: Record<string, unknown>[];

  @Column({ type: 'varchar', length: 200, nullable: true })
  seoTitle: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  seoDescription: string | null;

  @Index()
  @Column({ type: 'enum', enum: PageStatus, default: PageStatus.DRAFT })
  status: PageStatus;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;
}
