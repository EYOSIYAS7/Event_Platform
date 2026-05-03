import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { QueryEventDto } from './dto/query-event.dto';
import { EventStatus, Prisma } from '@prisma/client-events';
import slugify from 'slugify';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // ─── Create ──────────────────────────────────────────────────

  async create(organizerId: string, dto: CreateEventDto) {
    // Generate a unique slug from the title
    // e.g. "My Concert" → "my-concert-1234567890"
    const slug = slugify(`${dto.title}-${Date.now()}`, {
      lower: true,
      strict: true,
    });

    // Calculate total capacity from all tiers
    const totalCapacity = dto.ticketTiers.reduce(
      (sum, tier) => sum + tier.capacity,
      0,
    );

    const event = await this.prisma.event.create({
      data: {
        title: dto.title,
        slug,
        description: dto.description,
        organizerId,
        categoryId: dto.categoryId,
        venueName: dto.venueName,
        address: dto.address,
        city: dto.city,
        country: dto.country,
        latitude: dto.latitude,
        longitude: dto.longitude,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        timezone: dto.timezone ?? 'UTC',
        visibility: dto.visibility,
        coverImage: dto.coverImage,
        totalCapacity,
        // Create all ticket tiers in the same transaction
        ticketTiers: {
          create: dto.ticketTiers.map((tier) => ({
            name: tier.name,
            description: tier.description,
            price: tier.price,
            currency: tier.currency ?? 'USD',
            capacity: tier.capacity,
            maxPerOrder: tier.maxPerOrder ?? 10,
            saleStart: tier.saleStart ? new Date(tier.saleStart) : null,
            saleEnd: tier.saleEnd ? new Date(tier.saleEnd) : null,
          })),
        },
      },
      include: { ticketTiers: true, category: true },
    });

    // Invalidate listings cache since a new event was created
    await this.redis.delByPattern('events:list:*');

    return event;
  }

  // ─── Find many (with filters + pagination) ───────────────────

  async findAll(query: QueryEventDto) {
    // Build a cache key from the query params so different
    // filter combinations each get their own cached result
    const cacheKey = `events:list:${JSON.stringify(query)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.debug('Cache hit for events listing');
      return JSON.parse(cached);
    }

    const {
      page = 1,
      limit = 20,
      search,
      city,
      country,
      categoryId,
      startFrom,
      startTo,
      status,
      organizerId,
    } = query;

    const where: Prisma.EventWhereInput = {
      // Only return published public events by default
      // unless a specific status or organizerId is requested
      ...(organizerId
        ? { organizerId }
        : { status: status ?? EventStatus.PUBLISHED, visibility: 'PUBLIC' }),
      ...(city && { city: { contains: city, mode: 'insensitive' } }),
      ...(country && { country: { contains: country, mode: 'insensitive' } }),
      ...(categoryId && { categoryId }),
      ...(startFrom && { startDate: { gte: new Date(startFrom) } }),
      ...(startTo && { startDate: { lte: new Date(startTo) } }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { city: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [events, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        include: { ticketTiers: true, category: true },
        orderBy: { startDate: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);

    const result = {
      data: events,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    // Cache the result
    await this.redis.set(cacheKey, JSON.stringify(result), this.CACHE_TTL);
    return result;
  }

  // ─── Find one ────────────────────────────────────────────────

  async findOne(id: string) {
    const cacheKey = `events:single:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const event = await this.prisma.event.findUnique({
      where: { id },
      include: { ticketTiers: true, category: true, images: true },
    });

    if (!event) throw new NotFoundException(`Event ${id} not found`);

    await this.redis.set(cacheKey, JSON.stringify(event), this.CACHE_TTL);
    return event;
  }

  async getCategories() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  // ─── Find by slug ────────────────────────────────────────────

  async findBySlug(slug: string) {
    const cacheKey = `events:slug:${slug}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const event = await this.prisma.event.findUnique({
      where: { slug },
      include: { ticketTiers: true, category: true, images: true },
    });

    if (!event) throw new NotFoundException(`Event ${slug} not found`);

    await this.redis.set(cacheKey, JSON.stringify(event), this.CACHE_TTL);
    return event;
  }

  // ─── Update ──────────────────────────────────────────────────

  async update(id: string, organizerId: string, dto: UpdateEventDto) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException(`Event ${id} not found`);

    // Only the organizer who created the event can update it
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('You do not own this event');
    }

    const updated = await this.prisma.event.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description && { description: dto.description }),
        ...(dto.status && { status: dto.status }),
        ...(dto.visibility && { visibility: dto.visibility }),
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
        ...(dto.coverImage && { coverImage: dto.coverImage }),
        ...(dto.city && { city: dto.city }),
        ...(dto.country && { country: dto.country }),
        ...(dto.venueName && { venueName: dto.venueName }),
        ...(dto.address && { address: dto.address }),
      },
      include: { ticketTiers: true, category: true },
    });

    // Invalidate all related cache entries
    await Promise.all([
      this.redis.del(`events:single:${id}`),
      this.redis.del(`events:slug:${event.slug}`),
      this.redis.delByPattern('events:list:*'),
    ]);

    return updated;
  }

  // ─── Delete ──────────────────────────────────────────────────

  async remove(id: string, organizerId: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException(`Event ${id} not found`);

    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('You do not own this event');
    }

    // Soft delete — set status to CANCELLED rather than deleting the row
    // This preserves existing bookings referencing this event
    const cancelled = await this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.CANCELLED },
    });

    await Promise.all([
      this.redis.del(`events:single:${id}`),
      this.redis.del(`events:slug:${event.slug}`),
      this.redis.delByPattern('events:list:*'),
    ]);

    return cancelled;
  }

  // ─── TCP: Check availability ─────────────────────────────────
  // Called by bookings-service before creating a booking.
  // Returns whether the requested quantity is available for a given tier.

  async checkAvailability(tierId: string, quantity: number) {
    const tier = await this.prisma.ticketTier.findUnique({
      where: { id: tierId },
      include: { event: true },
    });

    if (!tier) return { available: false, reason: 'Ticket tier not found' };
    if (!tier.isActive)
      return { available: false, reason: 'Ticket tier is not active' };
    if (tier.event.status !== EventStatus.PUBLISHED) {
      return { available: false, reason: 'Event is not available for booking' };
    }

    const remaining = tier.capacity - tier.booked;
    if (remaining < quantity) {
      return {
        available: false,
        reason: `Only ${remaining} tickets remaining`,
        remaining,
      };
    }

    // Check sale window
    const now = new Date();
    if (tier.saleStart && now < tier.saleStart) {
      return { available: false, reason: 'Ticket sales have not started yet' };
    }
    if (tier.saleEnd && now > tier.saleEnd) {
      return { available: false, reason: 'Ticket sales have ended' };
    }

    return {
      available: true,
      remaining,
      price: tier.price,
      currency: tier.currency,
    };
  }

  // ─── TCP: Reserve seats ──────────────────────────────────────
  // Called by bookings-service when a booking is confirmed.
  // Updates both the tier and event capacity atomically.

  async reserveSeats(tierId: string, quantity: number) {
    const tier = await this.prisma.ticketTier.findUnique({
      where: { id: tierId },
    });

    if (!tier) throw new NotFoundException('Ticket tier not found');

    const remaining = tier.capacity - tier.booked;
    if (remaining < quantity) {
      throw new BadRequestException(
        `Cannot reserve ${quantity} seats — only ${remaining} remaining`,
      );
    }

    // Update tier booked count AND event totalBooked atomically
    // If either update fails, both are rolled back
    const [updatedTier] = await this.prisma.$transaction([
      this.prisma.ticketTier.update({
        where: { id: tierId },
        data: { booked: { increment: quantity } },
      }),
      this.prisma.event.update({
        where: { id: tier.eventId },
        data: { totalBooked: { increment: quantity } },
      }),
    ]);

    // Check if event is now sold out and update status
    const event = await this.prisma.event.findUnique({
      where: { id: tier.eventId },
    });

    if (event && event.totalBooked >= event.totalCapacity) {
      await this.prisma.event.update({
        where: { id: tier.eventId },
        data: { status: EventStatus.SOLDOUT },
      });
    }

    // Invalidate cache for this event
    await Promise.all([
      this.redis.del(`events:single:${tier.eventId}`),
      this.redis.delByPattern('events:list:*'),
    ]);

    return { success: true, booked: updatedTier.booked };
  }

  // ─── TCP: Release seats ──────────────────────────────────────
  // Called by bookings-service when a booking is cancelled.
  // Reverses the seat reservation.

  async releaseSeats(tierId: string, quantity: number) {
    const tier = await this.prisma.ticketTier.findUnique({
      where: { id: tierId },
    });

    if (!tier) throw new NotFoundException('Ticket tier not found');

    await this.prisma.$transaction([
      this.prisma.ticketTier.update({
        where: { id: tierId },
        data: { booked: { decrement: quantity } },
      }),
      this.prisma.event.update({
        where: { id: tier.eventId },
        data: {
          totalBooked: { decrement: quantity },
          // Restore to PUBLISHED if it was SOLDOUT
          status: EventStatus.PUBLISHED,
        },
      }),
    ]);

    await Promise.all([
      this.redis.del(`events:single:${tier.eventId}`),
      this.redis.delByPattern('events:list:*'),
    ]);

    return { success: true };
  }
}
