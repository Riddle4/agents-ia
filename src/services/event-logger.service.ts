import { prisma } from "../lib/prisma"

type LogEventInput = {
  eventType: string
  entityType?: string
  entityId?: string
  payload?: Record<string, any>
  status?: "PENDING" | "PROCESSED" | "ERROR"
}

export async function logEvent(input: LogEventInput) {
  console.log(`[${new Date().toISOString()}] ${input.eventType}`)

  if (input.payload) {
    console.log(input.payload)
  }

  return prisma.event.create({
    data: {
      eventType: input.eventType,
      entityType: input.entityType ?? "SYSTEM",
      entityId: input.entityId ?? "SYSTEM",
      payload: input.payload ?? {},
      status: input.status ?? "PROCESSED",
      processedAt: new Date(),
    },
  })
}