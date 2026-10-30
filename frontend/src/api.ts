const API_BASE = '/api';

export interface ApiError {
  error: string;
  status?: number;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = sessionStorage.getItem('festtoken_auth_token') || localStorage.getItem('festtoken_auth_token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // If unauthorized, clear token if expired or revoked
      sessionStorage.removeItem('festtoken_auth_token');
      sessionStorage.removeItem('festtoken_user');
      localStorage.removeItem('festtoken_auth_token');
      localStorage.removeItem('festtoken_user');
      if (!window.location.pathname.includes('/login')) {
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
    }

    // Check if CSV or binary response
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/csv')) {
      const blob = await response.blob();
      return blob as any;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw {
        error: data.error || `Request failed with status ${response.status}`,
        status: response.status,
      } as ApiError;
    }

    return data as T;
  } catch (err: any) {
    if (err.name === 'TypeError' || err.message?.includes('Failed to fetch')) {
      window.dispatchEvent(new CustomEvent('network:offline'));
      throw {
        error: 'Cannot connect to FestToken server. Check local WiFi or tunnel status.',
        status: 0,
      } as ApiError;
    }
    throw err;
  }
}
