// API configuration
// In production, this points to the API Gateway endpoint (injected via window.__API_BASE_URL__)
// In development, it uses relative paths (proxied by Vite)
export const API_BASE_URL = typeof window !== 'undefined' && (window as any).__API_BASE_URL__ 
  ? (window as any).__API_BASE_URL__ 
  : (import.meta.env.VITE_API_URL || '');

// Helper to build full API URLs
export function apiUrl(path: string): string {
  // Remove leading slash if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return API_BASE_URL ? `${API_BASE_URL}${cleanPath}` : path;
}
