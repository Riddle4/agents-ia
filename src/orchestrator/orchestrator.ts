import { runEmailAgent } from "../agents/email.agent"
import { runFormAgent } from "../agents/form.agent"
import { logEvent } from "../services/event-logger.service"

type OrchestratorInputType = "EMAIL" | "FORM"

type OrchestratorInput = {
  type: OrchestratorInputType
  payload: any
}

type OrchestratorResult = {
  success: boolean
  inputType: OrchestratorInputType
  agent: string
  result?: any
  error?: string
}

export class Orchestrator {
  async run(input: OrchestratorInput): Promise<OrchestratorResult> {
    await logEvent({
      eventType: "ORCHESTRATOR_STARTED",
      entityType: "ORCHESTRATOR",
      payload: {
        inputType: input.type,
      },
    })

    try {
      switch (input.type) {
        case "EMAIL": {
          await logEvent({
            eventType: "EMAIL_AGENT_STARTED",
            entityType: "AGENT",
            payload: {
              agent: "EmailAgent",
              subject: input.payload.subject,
              fromEmail: input.payload.fromEmail,
            },
          })

          const result = await runEmailAgent(input.payload)

          await logEvent({
            eventType: "EMAIL_AGENT_COMPLETED",
            entityType: "AGENT",
            entityId: result.messageId,
            payload: result,
          })

          return {
            success: true,
            inputType: input.type,
            agent: "EmailAgent",
            result,
          }
        }

        case "FORM": {
          await logEvent({
            eventType: "FORM_AGENT_STARTED",
            entityType: "AGENT",
            payload: {
              agent: "FormAgent",
              formType: input.payload.formType,
              fromEmail: input.payload.fromEmail,
            },
          })

          const result = await runFormAgent(input.payload)

          await logEvent({
            eventType: "FORM_AGENT_COMPLETED",
            entityType: "AGENT",
            entityId: result.messageId,
            payload: result,
          })

          return {
            success: true,
            inputType: input.type,
            agent: "FormAgent",
            result,
          }
        }

        default:
          throw new Error(`Unsupported input type: ${input.type}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"

      await logEvent({
        eventType: "ORCHESTRATOR_ERROR",
        entityType: "ORCHESTRATOR",
        payload: {
          inputType: input.type,
          error: message,
        },
        status: "ERROR",
      })

      return {
        success: false,
        inputType: input.type,
        agent: "Unknown",
        error: message,
      }
    }
  }
}