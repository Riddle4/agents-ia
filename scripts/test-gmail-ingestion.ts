import "dotenv/config"
import { ingestGmailInboxes } from "../src/ingestion/gmail.ingestion"
import { prisma } from "../src/lib/prisma"

async function main() {
  console.log("\n=== TEST GMAIL INGESTION ===")

  await ingestGmailInboxes()

  console.log("\n=== TEST TERMINÉ ===")
}

main()
  .catch((error) => {
    console.error("Erreur test Gmail ingestion:", error)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })