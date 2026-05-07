import { IsString, IsUUID } from 'class-validator';

export class ConfirmBookingDto {
  @IsUUID()
  bookingId: string;

  @IsString()
  paymentId: string;
}
