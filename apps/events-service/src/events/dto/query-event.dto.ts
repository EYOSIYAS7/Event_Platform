import {
  IsOptional,
  IsString,
  IsDateString,
  IsInt,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EventStatus } from '@prisma/client-events';

export class QueryEventDto {
  @IsOptional()
  @IsString()
  search?: string; // full-text search on title/description

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsDateString()
  startFrom?: string; // events starting after this date

  @IsOptional()
  @IsDateString()
  startTo?: string; // events starting before this date

  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @IsOptional()
  @IsString()
  organizerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
