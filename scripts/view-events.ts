import "dotenv/config"
import { prisma } from "../src/lib/prisma"

async function main() {
  const events = await prisma.event.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
  })

  console.log("\n=== DERNIERS ÉVÉNEMENTS ===\n")

  for (const event of events) {
    console.log(`🧠 ${event.eventType}`)
    console.log(`ID        : ${event.id}`)
    console.log(`Entity    : ${event.entityType} (${event.entityId})`)
    console.log(`Status    : ${event.status}`)
    console.log(`Date      : ${event.createdAt.toISOString()}`)

    if (event.payload) {
      console.log(`Payload   :`)
      console.log(event.payload)
    }

    console.log("--------------------------------------------------\n")
  }
}

main()
  .catch((error) => {
    console.error("Erreur:", error)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })