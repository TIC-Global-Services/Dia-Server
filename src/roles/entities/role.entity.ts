import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('roles')
export class Role {
  /** Lowercase slug, stored on the user. "customer" is reserved for shoppers and is not a row. */
  @PrimaryColumn({ length: 40 })
  key: string;

  @Column({ length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  description: string | null;

  /** Permission keys, or ["*"] for everything. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  permissions: string[];

  /** Ships with the app. Can be edited (except Admin) but not deleted. */
  @Column({ default: false })
  builtIn: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
