import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * Pagination for the read-only DB browser. No sort/filter in V1 — keeping
 * the only user-controlled value the (whitelisted) table key keeps the
 * injection surface at zero. Ordering is fixed (createdAt DESC when the
 * model has it) in the service.
 */
export class ListDbRowsDto extends PaginationDto {}
