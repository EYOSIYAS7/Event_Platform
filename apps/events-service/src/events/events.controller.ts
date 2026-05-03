import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { QueryEventDto } from './dto/query-event.dto';

@Controller('events')
export class EventsController {
  constructor(private eventsService: EventsService) {}

  private getOrganizerId(headers: Record<string, string>): string {
    const organizerId = headers['x-user-id'];
    if (!organizerId) {
      throw new UnauthorizedException('Missing user context');
    }
    return organizerId;
  }

  // ─── Static routes first ─────────────────────────────────────
  // IMPORTANT: these must come before /:id routes otherwise
  // 'categories' and 'slug' get matched as an id param

  @Get('categories')
  getCategories() {
    return this.eventsService.getCategories();
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.eventsService.findBySlug(slug);
  }

  // ─── CRUD routes ─────────────────────────────────────────────

  @Post()
  create(
    @Body() dto: CreateEventDto,
    @Headers() headers: Record<string, string>,
  ) {
    const organizerId = this.getOrganizerId(headers);
    return this.eventsService.create(organizerId, dto);
  }

  @Get()
  findAll(@Query() query: QueryEventDto) {
    return this.eventsService.findAll(query);
  }

  // Parameterized routes always go last
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
    @Headers() headers: Record<string, string>,
  ) {
    const organizerId = this.getOrganizerId(headers);
    return this.eventsService.update(id, organizerId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Headers() headers: Record<string, string>) {
    const organizerId = this.getOrganizerId(headers);
    return this.eventsService.remove(id, organizerId);
  }

  // ─── TCP handlers ─────────────────────────────────────────────

  @MessagePattern('get_event')
  tcpGetEvent(@Payload() data: { eventId: string }) {
    return this.eventsService.findOne(data.eventId);
  }

  @MessagePattern('check_availability')
  tcpCheckAvailability(@Payload() data: { tierId: string; quantity: number }) {
    return this.eventsService.checkAvailability(data.tierId, data.quantity);
  }

  @MessagePattern('reserve_seats')
  tcpReserveSeats(@Payload() data: { tierId: string; quantity: number }) {
    return this.eventsService.reserveSeats(data.tierId, data.quantity);
  }

  @MessagePattern('release_seats')
  tcpReleaseSeats(@Payload() data: { tierId: string; quantity: number }) {
    return this.eventsService.releaseSeats(data.tierId, data.quantity);
  }
}
