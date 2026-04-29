import { DateTime } from "luxon"
import { getBusySlots } from "./calendar.service"

type BusySlot = {
  start: string
  end: string
}

type Slot = {
  start: DateTime
  end: DateTime
}

const SLOT_DEFINITIONS_BY_DAY: Record<number, { start: string; end: string }[]> = {
  // mercredi
  3: [{ start: "16:00", end: "18:00" }],

  // samedi
  6: [
    { start: "10:00", end: "12:00" },
    { start: "13:15", end: "15:15" },
    { start: "15:45", end: "17:45" },
  ],

  // dimanche
  7: [
    { start: "10:00", end: "12:00" },
    { start: "13:15", end: "15:15" },
    { start: "15:45", end: "17:45" },
  ],
}

export async function getAvailableSlots(start: string, end: string) {
  const busy = await getBusySlots(start, end)

  const busySlots: Slot[] = (busy as BusySlot[]).map((b) => ({
    start: DateTime.fromISO(b.start).setZone("Europe/Zurich"),
    end: DateTime.fromISO(b.end).setZone("Europe/Zurich"),
  }))

  const results: {
    date: string
    weekday: string
    start: string
    end: string
  }[] = []

  let current = DateTime.fromISO(start).setZone("Europe/Zurich").startOf("day")
  const endDate = DateTime.fromISO(end).setZone("Europe/Zurich").endOf("day")

  while (current <= endDate) {
    const daySlots = SLOT_DEFINITIONS_BY_DAY[current.weekday] ?? []

    for (const def of daySlots) {
      const [startHour, startMinute] = def.start.split(":").map(Number)
      const [endHour, endMinute] = def.end.split(":").map(Number)

      const slotStart = current.set({
        hour: startHour,
        minute: startMinute,
        second: 0,
        millisecond: 0,
      })

      const slotEnd = current.set({
        hour: endHour,
        minute: endMinute,
        second: 0,
        millisecond: 0,
      })

      const isBusy = busySlots.some((busySlot) => {
        return slotStart < busySlot.end && slotEnd > busySlot.start
      })

      if (!isBusy) {
        results.push({
          date: current.toFormat("yyyy-LL-dd"),
          weekday: current.setLocale("fr").toFormat("cccc"),
          start: slotStart.toFormat("HH:mm"),
          end: slotEnd.toFormat("HH:mm"),
        })
      }
    }

    current = current.plus({ days: 1 })
  }

  return results
}