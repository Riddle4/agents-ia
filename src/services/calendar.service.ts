import { google } from "googleapis"

const SCOPES = ["https://www.googleapis.com/auth/calendar"]

export function getGoogleAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "http://localhost"
  )
}

export async function getBusySlots(start: string, end: string) {
  const auth = getGoogleAuthClient()

  // Temporaire : on ajoutera le token juste après
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error("GOOGLE_REFRESH_TOKEN manquant")
  }

  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  })

  const calendar = google.calendar({ version: "v3", auth })

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: start,
      timeMax: end,
      timeZone: "Europe/Zurich",
      items: [
        {
          id: process.env.GOOGLE_CALENDAR_ID!,
        },
      ],
    },
  })

  return response.data.calendars?.[process.env.GOOGLE_CALENDAR_ID!]?.busy ?? []
}

type CreateCalendarEventInput = {
  summary: string
  description: string
  start: string
  end: string
}

export async function createCalendarEvent(input: CreateCalendarEventInput) {
  const auth = getGoogleAuthClient()

  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error("GOOGLE_REFRESH_TOKEN manquant")
  }

  if (!process.env.GOOGLE_CALENDAR_ID) {
    throw new Error("GOOGLE_CALENDAR_ID manquant")
  }

  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  })

  const calendar = google.calendar({ version: "v3", auth })

  const response = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    requestBody: {
      summary: input.summary,
      description: input.description,
      start: {
        dateTime: input.start,
        timeZone: "Europe/Zurich",
      },
      end: {
        dateTime: input.end,
        timeZone: "Europe/Zurich",
      },
    },
  })

  return response.data
}
