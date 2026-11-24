import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** One override of an environment value. Secrets are stored encrypted. */
@Entity('settings')
export class Setting {
  @PrimaryColumn({ length: 80 })
  key: string;

  @Column({ type: 'text' })
  value: string;

  @Column({ default: false })
  secret: boolean;

  @Column({ type: 'uuid', nullable: true })
  updatedBy: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
