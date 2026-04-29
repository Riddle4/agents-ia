import "dotenv/config"
import { getBusySlots } from "../src/services/calendar.service"

async function main() {
  const busy = await getBusySlots(
    "2026-05-01T00:00:00+02:00",
    "2026-05-31T23:59:59+02:00"
  )

  console.log("Créneaux occupés :")
  console.log(JSON.stringify(busy, null, 2))
}

main().catch((error) => {
  console.error("Erreur test calendar :", error)
})