import "dotenv/config"
import { getAvailableSlots } from "../src/services/availability.service"

async function main() {
  const slots = await getAvailableSlots(
    "2026-05-01T00:00:00+02:00",
    "2026-05-31T23:59:59+02:00"
  )

  console.log(slots)
}

main()