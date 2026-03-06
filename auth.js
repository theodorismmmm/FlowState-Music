// auth.js — Account system integration with accounts.xmenu.dev

const AUTH_BASE_URL = 'https://accounts.xmenu.dev';
const TOKEN_KEY = 'flowstate_token';
const TOKEN_EXPIRES_KEY = 'flowstate_token_expires';
const REFRESH_TOKEN_KEY = 'flowstate_refresh_token';
const USER_KEY = 'flowstate_user';

/**
 * Store auth data in localStorage
 */
function storeAuth(data) {
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(TOKEN_EXPIRES_KEY, data.expires_at);
  if (data.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
  }
}

/**
 * Clear all auth data from localStorage
 */
function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRES_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * Get the stored token
 */
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Check if the stored token is valid (exists and not expired)
 */
function isTokenValid() {
  const token = getToken();
  if (!token) return false;

  const expiresAt = localStorage.getItem(TOKEN_EXPIRES_KEY);
  if (!expiresAt) return false;

  const expiresDate = new Date(expiresAt);
  const now = new Date();
  // Allow a 60-second buffer
  return expiresDate.getTime() > now.getTime() + 60000;
}

/**
 * Get the stored user object (or null)
 */
function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Login with email and password
 * Returns { success: true, user } or { success: false, error }
 */
async function login(email, password) {
  try {
    const response = await fetch(`${AUTH_BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      let errorMessage = 'Login failed. Please check your credentials.';
      try {
        const errorData = await response.json();
        if (errorData.message || errorData.error) {
          errorMessage = errorData.message || errorData.error;
        }
      } catch {
        // ignore parse errors
      }
      return { success: false, error: errorMessage };
    }

    const data = await response.json();
    storeAuth(data);

    // Fetch user info
    const user = await fetchMe(data.token);
    if (!user) {
      return { success: false, error: 'Failed to fetch user info after login.' };
    }

    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return { success: true, user };
  } catch (err) {
    return { success: false, error: 'Network error. Please try again.' };
  }
}

/**
 * Fetch current user from /api/me using the given token
 */
async function fetchMe(token) {
  try {
    const response = await fetch(`${AUTH_BASE_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Logout — clears auth and triggers UI update
 */
function logout() {
  clearAuth();
  window.dispatchEvent(new CustomEvent('auth:logout'));
}

/**
 * Initialize auth — checks token validity on page load
 * Returns the user object if valid, null otherwise
 */
async function initAuth() {
  if (!isTokenValid()) {
    clearAuth();
    return null;
  }

  // Try to get user from cache first
  const cachedUser = getStoredUser();
  if (cachedUser) return cachedUser;

  // Otherwise fetch fresh from API
  const token = getToken();
  const user = await fetchMe(token);
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  }

  // Token rejected by server — clear it
  clearAuth();
  return null;
}

export { initAuth, login, logout, getToken, isTokenValid, getStoredUser };
