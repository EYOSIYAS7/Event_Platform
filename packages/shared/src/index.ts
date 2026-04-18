// Message patterns for inter-service TCP communication
export const USER_PATTERNS = {
  GET_USER: "get_user",
  VALIDATE_TOKEN: "validate_token",
  CREATE_USER: "create_user",
};

export const EVENT_PATTERNS = {
  GET_EVENT: "get_event",
  CHECK_CAPACITY: "check_capacity",
};

// Shared enums
export enum BookingStatus {
  PENDING = "PENDING",
  AWAITING_PAYMENT = "AWAITING_PAYMENT",
  CONFIRMED = "CONFIRMED",
  USED = "USED",
  CANCELLED = "CANCELLED",
  REFUNDED = "REFUNDED",
}

export enum EventStatus {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
  ONGOING = "ONGOING",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}
