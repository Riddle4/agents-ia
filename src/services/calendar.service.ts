import { google } from "googleapis"

const SCOPES = ["https://www.googleapis.com/auth/calendar"]

function getGoogleErrorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return "Erreur Google Calendar inconnue"
  }

  const response = (error as any).response
  const status = response?.status
  const apiError = response?.data?.error
  const apiDescription = response?.data?.error_description
  const apiMessage = response?.data?.message

  const parts = [
    status ? `status ${status}` : null,
    typeof apiError === "string" ? apiError : apiError ? JSON.stringify(apiError) : null,
    apiDescription,
    apiMessage,
    error.message,
  ].filter(Boolean)

  return [...new Set(parts)].join(" - ")
}

function withGoogleCalendarContext(error: unknown) {
  return new Error(`Google Calendar inaccessible : ${getGoogleErrorDetails(error)}`)
}

export function getGoogleAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "http://localhost"
  )
}

export async function getBusySlots(start: string, end: string) {
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

  try {
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: start,
        timeMax: end,
        timeZone: "Europe/Zurich",
        items: [
          {
            id: process.env.GOOGLE_CALENDAR_ID,
          },
        ],
      },
    })

    return response.data.calendars?.[process.env.GOOGLE_CALENDAR_ID]?.busy ?? []
  } catch (error) {
    throw withGoogleCalendarContext(error)
  }
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

  try {
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
  } catch (error) {
    throw withGoogleCalendarContext(error)
  }
}
