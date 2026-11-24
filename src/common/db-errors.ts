import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

const UNIQUE_VIOLATION = '23505';

/** Maps a Postgres unique violation to HTTP 409, rethrows everything else. */
export function rethrowDbError(err: unknown, message: string): never {
  if (
    err instanceof QueryFailedError &&
    (err.driverError as { code?: string } | undefined)?.code ===
      UNIQUE_VIOLATION
  ) {
    throw new ConflictException(message);
  }
  throw err;
}
