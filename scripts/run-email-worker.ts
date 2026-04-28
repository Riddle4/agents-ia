import "dotenv/config"
import { ingestGmailInboxes } from "../src/ingestion/gmail.ingestion"
import { prisma } from "../src/lib/prisma"

const INTERVAL_MS = 2 * 60 * 1000 // toutes les 2 minutes

let isRunning = false

async function runWorker() {
  if (isRunning) {
    console.log("⏳ Un traitement est déjà en cours, on attend le prochain cycle.")
    return
  }

  isRunning = true

  try {
    console.log(`\n=== CHECK EMAILS ${new Date().toISOString()} ===`)
    await ingestGmailInboxes()
    console.log("✅ Check terminé")
  } catch (error) {
    console.error("❌ Erreur worker:", error)
  } finally {
    isRunning = false
  }
}

async function main() {
  console.log("🚀 Email Worker démarré")
  console.log("Le système vérifie les emails toutes les 2 minutes.")

  await runWorker()

  setInterval(runWorker, INTERVAL_MS)
}

process.on("SIGINT", async () => {
  console.log("\n🛑 Arrêt du worker...")
  await prisma.$disconnect()
  process.exit(0)
})

main()