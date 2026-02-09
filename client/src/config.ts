// API configuration
// In production, this points to the API Gateway endpoint
// In development, it uses relative paths (proxied by Vite)
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';
