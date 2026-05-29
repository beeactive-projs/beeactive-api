export interface ReviewAuthorDto {
  id: string | null;
  name: string;
  initials: string;
  avatarId: number | null;
  avatarUrl: string | null;
}

export interface ReviewDto {
  id: string;
  rating: number;
  body: string;
  monthsIn: number | null;
  createdAt: string;
  author: ReviewAuthorDto;
}

export interface ReviewBreakdownDistributionDto {
  star: 1 | 2 | 3 | 4 | 5;
  count: number;
  percent: number;
}

export interface ReviewBreakdownDto {
  average: number;
  total: number;
  distribution: ReviewBreakdownDistributionDto[];
}

export interface PaginatedReviewsDto {
  items: ReviewDto[];
  nextCursor: string | null;
  breakdown?: ReviewBreakdownDto;
}

export interface ReviewSummary {
  average: number;
  total: number;
}
