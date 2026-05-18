import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://localhost:3000',
});

const refreshClient = axios.create({
  baseURL: 'http://localhost:3000',
});

let refreshPromise: Promise<string | null> | null = null;
let keepAliveStarted = false;

function logoutAndRedirect() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  if (window.location.pathname !== '/') {
    window.location.href = '/';
  }
}

async function refreshToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('token');
  if (!token) return null;

  try {
    const response = await refreshClient.post(
      '/auth/refresh',
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    const novoToken = response?.data?.token;
    if (!novoToken) return null;
    localStorage.setItem('token', novoToken);
    return novoToken;
  } catch {
    return null;
  }
}

export function startSessionKeepAlive() {
  if (typeof window === 'undefined' || keepAliveStarted) return;
  keepAliveStarted = true;

  const renovarSessao = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    await refreshToken();
  };

  // Mantém a sessão ativa mesmo com longos períodos de uso.
  window.setInterval(() => {
    void renovarSessao();
  }, 10 * 60 * 1000);

  window.addEventListener('focus', () => {
    void renovarSessao();
  });
}

api.interceptors.request.use((config) => {

  const token = localStorage.getItem('token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;

});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config as any;

    if (error?.response?.status === 401 && !originalRequest?._retry) {
      originalRequest._retry = true;

      if (!refreshPromise) {
        refreshPromise = refreshToken().finally(() => {
          refreshPromise = null;
        });
      }

      const novoToken = await refreshPromise;
      if (novoToken) {
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${novoToken}`;
        return api(originalRequest);
      }

      logoutAndRedirect();
    }

    return Promise.reject(error);
  },
);
