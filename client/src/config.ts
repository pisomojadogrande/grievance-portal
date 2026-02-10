// API configuration
// In production, this points to the API Gateway endpoint (injected via meta tag)
// In development, it uses relative paths (proxied by Vite)
export const API_BASE_URL = typeof document !== 'undefined' 
  ? document.querySelector('meta[name="api-base-url"]')?.getAttribute('content') || ''
  : '';

// Helper to build full API URLs
export function apiUrl(path: string): string {
  // Remove leading slash if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  // Remove trailing slash from API_BASE_URL if present
  const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  return baseUrl ? `${baseUrl}/${cleanPath}` : path;
}
