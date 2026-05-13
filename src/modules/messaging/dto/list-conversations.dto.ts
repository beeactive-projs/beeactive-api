import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * Inbox list query. Inherits page/limit from PaginationDto; no
 * filter params in v1.
 */
export class ListConversationsDto extends PaginationDto {}
