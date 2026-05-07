import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ClientProxy,
  ClientProxyFactory,
  Transport,
} from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ConfirmBookingDto } from './dto/confirm-booking.dto';
import { BookingStatus } from '@prisma/client-bookings';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import * as QRCode from 'qrcode';

@Injectable()
export class BookingsService implements OnModuleInit {
  private readonly logger = new Logger(BookingsService.name);
  private eventsClient: ClientProxy;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private configService: ConfigService,
  ) {}

  // Create the TCP client connection to events-service on module init
  onModuleInit() {
    this.eventsClient = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: {
        host: this.configService.get('services.events.host'),
        port: this.configService.get('services.events.port'),
      },
    });
  }

  // ─── Helper: call events-service via TCP ─────────────────────

  private async callEventsService<T>(pattern: string, data: any): Promise<T> {
    const result = await firstValueFrom(
      this.eventsClient.send<T>(pattern, data).pipe(
        timeout(5000),
        catchError((err) => {
          this.logger.error(
            `TCP call to events-service failed: ${err.message}`,
          );
          throw new BadRequestException('Events service unavailable');
        }),
      ),
    );
    return result;
  }

  // ─── Create booking ──────────────────────────────────────────
  // 1. Check availability with events-service
  // 2. Reserve seats atomically
  // 3. Create PENDING booking with expiry

  async create(userId: string, dto: CreateBookingDto) {
    // Step 1 — check if seats are available
    const availability = await this.callEventsService<{
      available: boolean;
      reason?: string;
      price: number;
      currency: string;
    }>('check_availability', { tierId: dto.tierId, quantity: dto.quantity });

    if (!availability.available) {
      throw new BadRequestException(
        availability.reason ?? 'Seats not available',
      );
    }

    // Step 2 — reserve the seats in events-service
    // This increments the booked count so no one else can take these seats
    // while the user completes payment
    await this.callEventsService('reserve_seats', {
      tierId: dto.tierId,
      quantity: dto.quantity,
    });

    // Step 3 — create the booking record
    const expiryMinutes = this.configService.get<number>(
      'booking.expiryMinutes',
    )!;
    const totalAmount = Number(availability.price) * dto.quantity;

    try {
      const booking = await this.prisma.booking.create({
        data: {
          userId,
          eventId: dto.eventId,
          tierId: dto.tierId,
          quantity: dto.quantity,
          unitPrice: availability.price,
          totalAmount,
          currency: availability.currency,
          expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
        },
      });

      // Cache the expiry so our cleanup job knows when to check
      await this.redis.set(
        `booking:expiry:${booking.id}`,
        booking.id,
        expiryMinutes * 60,
      );

      this.logger.log(`Booking ${booking.id} created for user ${userId}`);
      return booking;
    } catch (error) {
      // If DB write fails, release the reserved seats so they don't get stuck
      this.logger.error('Booking creation failed, releasing reserved seats');
      await this.callEventsService('release_seats', {
        tierId: dto.tierId,
        quantity: dto.quantity,
      }).catch(() => {});
      throw error;
    }
  }

  // ─── Confirm booking ─────────────────────────────────────────
  // Called by payments-service via TCP after successful payment.
  // Generates the QR code and marks booking as CONFIRMED.

  async confirm(dto: ConfirmBookingDto) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException(`Booking is already ${booking.status}`);
    }

    // Generate QR code containing the booking ID
    // The event staff app scans this to validate entry
    const qrCode = await QRCode.toDataURL(
      JSON.stringify({
        bookingId: booking.id,
        eventId: booking.eventId,
        userId: booking.userId,
        quantity: booking.quantity,
      }),
    );

    const confirmed = await this.prisma.booking.update({
      where: { id: dto.bookingId },
      data: {
        status: BookingStatus.CONFIRMED,
        paymentId: dto.paymentId,
        qrCode,
      },
    });

    // Remove the expiry cache key — booking is confirmed, no need to expire it
    await this.redis.del(`booking:expiry:${booking.id}`);

    this.logger.log(`Booking ${booking.id} confirmed`);
    return confirmed;
  }

  // ─── Cancel booking ──────────────────────────────────────────
  // Can be called by the user (before event) or automatically on expiry.
  // Always releases the reserved seats back to events-service.

  async cancel(bookingId: string, userId?: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    // If userId provided, verify ownership
    if (userId && booking.userId !== userId) {
      throw new ForbiddenException('You do not own this booking');
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking is already cancelled');
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CANCELLED },
    });

    // Release seats back to events-service
    await this.callEventsService('release_seats', {
      tierId: booking.tierId,
      quantity: booking.quantity,
    });

    await this.redis.del(`booking:expiry:${bookingId}`);
    this.logger.log(`Booking ${bookingId} cancelled`);

    return { message: 'Booking cancelled successfully' };
  }

  // ─── Refund booking ──────────────────────────────────────────
  // Called by payments-service via TCP after a refund is processed.

  async refund(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed bookings can be refunded');
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.REFUNDED },
    });

    // Release seats so they can be resold
    await this.callEventsService('release_seats', {
      tierId: booking.tierId,
      quantity: booking.quantity,
    });

    this.logger.log(`Booking ${bookingId} refunded`);
    return { message: 'Booking refunded successfully' };
  }

  // ─── Find user bookings ──────────────────────────────────────

  async findByUser(userId: string) {
    return this.prisma.booking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Find single booking ─────────────────────────────────────

  async findOne(bookingId: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== userId) {
      throw new ForbiddenException('You do not own this booking');
    }

    return booking;
  }

  // ─── Expire stale pending bookings ───────────────────────────
  // Called periodically to clean up bookings that never got paid.
  // In production this would be a cron job or BullMQ worker.

  async expireStaleBookings() {
    const stale = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
    });

    for (const booking of stale) {
      await this.cancel(booking.id);
      this.logger.log(`Expired stale booking ${booking.id}`);
    }

    return { expired: stale.length };
  }
}
