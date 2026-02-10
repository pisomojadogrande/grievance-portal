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

// API base URL - set via VITE_API_URL environment variable
// In production: points to API Gateway (injected via meta tag)
// In development: empty string (uses relative paths proxied by Vite)
const API_BASE_URL = typeof document !== 'undefined' 
  ? document.querySelector('meta[name="api-base-url"]')?.getAttribute('content') || ''
  : '';

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  // Remove leading slash from path if API_BASE_URL ends with slash
  const cleanPath = API_BASE_URL.endsWith('/') && url.startsWith('/') ? url.slice(1) : url;
  const fullUrl = API_BASE_URL + cleanPath;
  console.log('[buildUrl]', { path, API_BASE_URL, fullUrl, metaTag: typeof document !== 'undefined' ? document.querySelector('meta[name="api-base-url"]')?.getAttribute('content') : 'N/A' });
  return fullUrl;
}
