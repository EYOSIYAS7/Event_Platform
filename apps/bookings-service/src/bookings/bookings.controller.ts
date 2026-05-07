import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ConfirmBookingDto } from './dto/confirm-booking.dto';

@Controller('bookings')
export class BookingsController {
  constructor(private bookingsService: BookingsService) {}

  private getUserId(headers: Record<string, string>): string {
    const userId = headers['x-user-id'];
    if (!userId) throw new UnauthorizedException('Missing user context');
    return userId;
  }

  // ─── HTTP endpoints ───────────────────────────────────────────

  @Post()
  create(
    @Body() dto: CreateBookingDto,
    @Headers() headers: Record<string, string>,
  ) {
    const userId = this.getUserId(headers);
    return this.bookingsService.create(userId, dto);
  }

  @Get()
  findMyBookings(@Headers() headers: Record<string, string>) {
    const userId = this.getUserId(headers);
    return this.bookingsService.findByUser(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Headers() headers: Record<string, string>) {
    const userId = this.getUserId(headers);
    return this.bookingsService.findOne(id, userId);
  }

  @Delete(':id')
  cancel(@Param('id') id: string, @Headers() headers: Record<string, string>) {
    const userId = this.getUserId(headers);
    return this.bookingsService.cancel(id, userId);
  }

  // ─── TCP handlers ─────────────────────────────────────────────

  // Called by payments-service after payment success
  @MessagePattern('confirm_booking')
  tcpConfirm(@Payload() data: ConfirmBookingDto) {
    return this.bookingsService.confirm(data);
  }

  // Called by payments-service after refund processed
  @MessagePattern('refund_booking')
  tcpRefund(@Payload() data: { bookingId: string }) {
    return this.bookingsService.refund(data.bookingId);
  }

  // Called by events-service when an event is cancelled
  @MessagePattern('cancel_event_bookings')
  async tcpCancelEventBookings(@Payload() data: { eventId: string }) {
    const bookings = await this.bookingsService['prisma'].booking.findMany({
      where: { eventId: data.eventId, status: 'CONFIRMED' },
    });
    for (const b of bookings) {
      await this.bookingsService.cancel(b.id);
    }
    return { cancelled: bookings.length };
  }
}
