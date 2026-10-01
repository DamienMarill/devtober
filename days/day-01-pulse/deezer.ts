export interface DeezerTrack {
  id: number;
  title: string;
  /** URL du MP3 d'extrait (30 s). Vide quand Deezer n'en fournit pas. */
  preview: string;
  /** Durée du titre complet, en secondes. */
  duration: number;
  artist: { name: string };
  album: { title: string; cover_small: string; cover_medium: string; cover_xl: string };
}

const API_BASE_URL = 'https://api.deezer.com';
const TIMEOUT_MS = 10_000;

let counter = 0;

/**
 * L'API Deezer n'envoie pas d'en-têtes CORS : on l'appelle en JSONP,
 * avec un <script> qui rappelle une fonction globale à usage unique.
 */
function jsonp<T>(path: string, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const callback = `deezerJsonp_${Date.now()}_${counter++}`;
    const scope = window as unknown as Record<string, unknown>;
    const script = document.createElement('script');

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      script.remove();
      // Si la réponse arrive après un abandon, la fonction doit rester appelable.
      scope[callback] = () => delete scope[callback];
    };
    const onAbort = () => {
      cleanup();
      reject(signal?.reason ?? new DOMException('Requête annulée', 'AbortError'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Deezer ne répond pas.'));
    }, TIMEOUT_MS);

    scope[callback] = (payload: T | { error: { message?: string } }) => {
      cleanup();
      delete scope[callback];
      if (payload && typeof payload === 'object' && 'error' in payload) {
        reject(new Error(payload.error?.message ?? 'Erreur Deezer.'));
        return;
      }
      resolve(payload as T);
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort);

    script.onerror = () => {
      cleanup();
      delete scope[callback];
      reject(new Error('Impossible de joindre Deezer.'));
    };
    script.async = true;
    script.src = `${API_BASE_URL}${path}${path.includes('?') ? '&' : '?'}output=jsonp&callback=${callback}`;
    document.head.appendChild(script);
  });
}

export async function searchTracks(query: string, signal?: AbortSignal): Promise<DeezerTrack[]> {
  const q = query.trim();
  if (!q) return [];
  const res = await jsonp<{ data?: DeezerTrack[] }>(
    `/search?q=${encodeURIComponent(q)}&limit=8`,
    signal,
  );
  return res.data ?? [];
}
