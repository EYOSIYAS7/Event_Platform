import { PartialType } from '@nestjs/mapped-types';
import { CreateEventDto } from './create-event.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { EventStatus } from '@prisma/client-events';

// PartialType makes every field from CreateEventDto optional
// so PATCH requests only need to include changed fields
export class UpdateEventDto extends PartialType(CreateEventDto) {
  @IsEnum(EventStatus)
  @IsOptional()
  status?: EventStatus;
}
