import { z } from 'zod';
import { paginationSchema } from '../../../common/pagination.js';

export const listMovementsSchema = paginationSchema;
export type ListMovementsQuery = z.infer<typeof listMovementsSchema>;
