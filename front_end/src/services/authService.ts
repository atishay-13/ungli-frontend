// src/services/authService.ts

const API_BASE_URL = import.meta.env.PROD
    ? "" // For Vercel/production, assuming same-origin proxy or Vercel config
    : "http://127.0.0.1:8006"; // <--- THIS IS YOUR FASTAPI BACKEND PORT

export interface SignupData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface LoginData {
  email: string;
  password: string;
  captchaToken?: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    // Add other user properties that your backend might return
    profile?: { // Assuming 'profile' might be a nested object
        name?: string;
        // ... other profile details
    };
  };
  message?: string;
}

// ⭐ NEW: List of endpoints that are bypassed in the backend
// Ensure these match your FastAPI backend's bypassed routes
const BYPASSED_CHAT_ENDPOINTS_PREFIXES = [
    `${API_BASE_URL}/api/chats`,
    `${API_BASE_URL}/api/chat/init`,
    `${API_BASE_URL}/api/trigger_search_pipeline`,
];

class AuthService {
  // ⭐ NEW HELPER: Handles unauthorized responses and redirects to login
  private async handleUnauthorizedResponse(response: Response): Promise<void> {
    if (response.status === 401) {
      try {
        const errorBody = await response.json(); // Attempt to parse JSON error
        if (errorBody && errorBody.detail === "Token has expired.") {
          console.warn("Authentication token expired. Redirecting to login.");
          this.logout(); // Use the centralized logout method
          window.location.href = '/login'; // Redirect to login page
          // Throwing an error here stops further execution in the calling async function
          throw new Error("TokenExpired");
        } else {
          // Generic 401, re-throw with detail if available
          throw new Error(`Unauthorized: ${errorBody.detail || response.statusText}`);
        }
      } catch (e) {
        // If JSON parsing fails, or other error during handling, treat as generic 401
        console.error("Error parsing 401 response body:", e);
        throw new Error(`Unauthorized: ${response.statusText}`);
      }
    }
    // If response is not ok (but not 401), throw a generic error for the calling method to catch
    if (!response.ok) {
        const errorBody = await response.text(); // Get raw text if JSON parsing fails or isn't expected
        console.error('API Error (non-401):', response.status, response.statusText, errorBody);
        throw new Error(`API Error: ${response.statusText}. Details: ${errorBody}`);
    }
  }

  // ⭐ MODIFIED: Generic fetch wrapper with authentication and error handling
  // This will be used by other services (like chatService) for authenticated requests.
  async fetchWithAuth(url: string, options?: RequestInit): Promise<Response> {
    // Check if the current URL matches any of the bypassed chat endpoints
    const isBypassedChatEndpoint = BYPASSED_CHAT_ENDPOINTS_PREFIXES.some(prefix => url.startsWith(prefix));

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(options?.headers || {}), // Merge any custom headers provided in options
    };

    const token = this.getToken();

    // Only add Authorization header if a token exists AND the endpoint is NOT bypassed
    if (token && !isBypassedChatEndpoint) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (!token && !isBypassedChatEndpoint) {
      // If no token exists AND it's NOT a bypassed endpoint, then redirect to login
      console.warn(`Attempted to call authenticated endpoint ${url} without a token. Redirecting.`);
      this.logout();
      window.location.href = '/login';
      throw new Error("TokenExpired"); // Stop execution
    }
    // If it's a bypassed endpoint (isBypassedChatEndpoint is true), we proceed without a token,
    // regardless of whether `token` exists or not.

    const response = await fetch(url, {
      ...options,
      headers: headers,
    });

    // Handle 401s and other non-OK responses centrally
    // Note: For bypassed endpoints, the backend should not return 401s due to missing auth.
    // However, if it returns 401 for other reasons (e.g., chat not found), this will still catch it.
    await this.handleUnauthorizedResponse(response);

    return response;
  }

  async signup(data: SignupData): Promise<AuthResponse> {
    try {
      // Signup doesn't require an auth token, so use plain fetch
      const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      // Still check for any unexpected 401s or other non-OK responses
      // even for public endpoints, though less likely.
      await this.handleUnauthorizedResponse(response);


      const result: AuthResponse = await response.json(); // Explicitly type result

      if (response.ok && result.token && result.user) { // Ensure token and user exist on success
          localStorage.setItem('authToken', result.token);
          localStorage.setItem('user', JSON.stringify(result.user));
      } else if (!response.ok) {
          // If response was not ok but handleUnauthorizedResponse didn't throw (e.g., 400 Bad Request)
          throw new Error(result.message || `Signup failed: ${response.statusText}`);
      }

      return result;
    } catch (error) {
      console.error('Signup error:', error);
      // Re-throw "TokenExpired" error to stop further execution if it originated from handleUnauthorizedResponse
      if (error instanceof Error && error.message === "TokenExpired") {
        throw error;
      }
      return {
        success: false,
        message: (error instanceof Error) ? error.message : 'Network error. Please try again.',
      };
    }
  }

  async login(data: LoginData): Promise<AuthResponse> {
    try {
      // Login doesn't require an auth token, so use plain fetch
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      // Still check for any unexpected 401s or other non-OK responses
      await this.handleUnauthorizedResponse(response);

      const result: AuthResponse = await response.json();

      if (response.ok && result.token && result.user) {
          localStorage.setItem('authToken', result.token);
          localStorage.setItem('user', JSON.stringify(result.user));
      } else if (!response.ok) {
          throw new Error(result.message || `Login failed: ${response.statusText}`);
      }

      return result;
    } catch (error) {
      console.error('Login error:', error);
      if (error instanceof Error && error.message === "TokenExpired") {
        throw error;
      }
      return {
        success: false,
        message: (error instanceof Error) ? error.message : 'Network error. Please try again.',
      };
    }
  }

  async googleAuth(googleToken: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: googleToken }),
      });

      await this.handleUnauthorizedResponse(response);

      const result: AuthResponse = await response.json();

      if (response.ok && result.token && result.user) {
        localStorage.setItem('authToken', result.token);
        localStorage.setItem('user', JSON.stringify(result.user));
      } else if (!response.ok) {
          throw new Error(result.message || `Google authentication failed: ${response.statusText}`);
      }

      return result;
    } catch (error) {
      console.error('Google auth error:', error);
      if (error instanceof Error && error.message === "TokenExpired") {
        throw error;
      }
      return {
        success: false,
        message: (error instanceof Error) ? error.message : 'Google authentication failed. Please try again.',
      };
    }
  }

  async facebookAuth(facebookCode: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/facebook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: facebookCode }), // Sending the OAuth code
      });

      await this.handleUnauthorizedResponse(response);

      const result: AuthResponse = await response.json();

      if (response.ok && result.token && result.user) {
        localStorage.setItem('authToken', result.token);
        localStorage.setItem('user', JSON.stringify(result.user));
      } else if (!response.ok) {
          throw new Error(result.message || `Facebook authentication failed: ${response.statusText}`);
      }

      return result;
    } catch (error) {
      console.error('Facebook auth error:', error);
      if (error instanceof Error && error.message === "TokenExpired") {
        throw error;
      }
      return {
        success: false,
        message: (error instanceof Error) ? error.message : 'Facebook authentication failed. Please try again.',
      };
    }
  }

  logout() {
    console.log("Logging out: Clearing authToken and user from localStorage.");
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    // Consider also clearing any other user-specific data from localStorage/session storage
  }

  isAuthenticated(): boolean {
    // ⭐ MODIFIED: TEMPORARY BYPASS - ALWAYS RETURN TRUE FOR TESTING
    // This allows the frontend to proceed as if authenticated.
    // Original: return !!localStorage.getItem('authToken');
    return true; 
  }

  getUser(): { username?: string; email?: string; profile?: any; [key: string]: any } | null {
    const userStr = localStorage.getItem('user');
    try {
      // If we are bypassing auth, we might want to return a dummy user for UI consistency
      if (this.isAuthenticated() && !userStr) {
          return {
              id: "test_user_for_bypass", // Matches backend's hardcoded ID
              firstName: "Test",
              lastName: "User",
              email: "test@example.com",
              profile: { name: "Test User" }
          };
      }
      return userStr ? JSON.parse(userStr) : null;
    } catch (e) {
      console.error("Failed to parse user from localStorage", e);
      localStorage.removeItem('user'); // Clear potentially corrupted user data
      return null;
    }
  }

  getToken(): string | null {
    // ⭐ MODIFIED: For bypassed endpoints, we don't need a real token.
    // Returning null for bypassed endpoints will prevent the header from being sent.
    // For non-bypassed endpoints, we still need the real token from local storage.
    // This logic relies on the `fetchWithAuth` method's `isBypassedChatEndpoint` check.
    return localStorage.getItem('authToken');
  }
}

export const authService = new AuthService();