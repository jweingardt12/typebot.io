import { isWriteWorkspaceForbidden } from "@/features/workspace/helpers/isWriteWorkspaceForbidden";
import { authenticatedProcedure } from "@/helpers/server/trpc";
import { TRPCError } from "@trpc/server";
import { encrypt } from "@typebot.io/credentials/encrypt";
import {
  googleSheetsCredentialsSchema,
  smtpCredentialsSchema,
  stripeCredentialsSchema,
  whatsAppCredentialsSchema,
} from "@typebot.io/credentials/schemas";
import { forgedCredentialsSchemas } from "@typebot.io/forge-repository/credentials";
import prisma from "@typebot.io/prisma";
import { z } from "@typebot.io/zod";

const inputShape = {
  name: true,
  data: true,
  type: true,
  workspaceId: true,
} as const;

export const updateCredentials = authenticatedProcedure
  .meta({
    openapi: {
      method: "PATCH",
      path: "/v1/credentials/{credentialsId}",
      protect: true,
      summary: "Create credentials",
      tags: ["Credentials"],
    },
  })
  .input(
    z.object({
      credentialsId: z.string(),
      credentials: z.discriminatedUnion("type", [
        stripeCredentialsSchema.pick(inputShape),
        smtpCredentialsSchema.pick(inputShape),
        googleSheetsCredentialsSchema.pick(inputShape),
        whatsAppCredentialsSchema.pick(inputShape),
        ...Object.values(forgedCredentialsSchemas).map((i) =>
          i.pick(inputShape),
        ),
      ]),
    }),
  )
  .output(
    z.object({
      credentialsId: z.string(),
    }),
  )
  .mutation(
    async ({ input: { credentialsId, credentials }, ctx: { user } }) => {
      const workspace = await prisma.workspace.findFirst({
        where: {
          id: credentials.workspaceId,
        },
        select: {
          id: true,
          members: true,
        },
      });
      if (!workspace || isWriteWorkspaceForbidden(workspace, user))
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workspace not found",
        });

      const { encryptedData, iv } = await encrypt(credentials.data);
      const updatedCredentials = await prisma.credentials.update({
        where: {
          id: credentialsId,
        },
        data: {
          name: credentials.name,
          data: encryptedData,
          iv,
        },
      });
      return { credentialsId: updatedCredentials.id };
    },
  );
