import { z } from 'zod';
import { insertComplaintSchema, complaints, payments } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  paymentFailed: z.object({
    message: z.string(),
    code: z.string(),
  })
};

export const api = {
  complaints: {
    create: {
      method: 'POST' as const,
      path: '/api/complaints',
      input: insertComplaintSchema,
      responses: {
        201: z.custom<typeof complaints.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/complaints/:id',
      responses: {
        200: z.custom<typeof complaints.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  payments: {
    process: {
      method: 'POST' as const,
      path: '/api/payments',
      input: z.object({
        complaintId: z.coerce.number(),
        paymentMethodId: z.string(), // Mock: "pm_success", "pm_fail"
        cardLast4: z.string().length(4),
      }),
      responses: {
        200: z.custom<typeof payments.$inferSelect>(),
        400: errorSchemas.paymentFailed,
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
