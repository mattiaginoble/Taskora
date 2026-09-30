import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

/** Errore dell'API con il messaggio già pronto da mostrare. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Indirizzo dell'API PHP: la cartella api/ sta accanto a index.html. */
export const apiUrl = (file: string): string => new URL(`api/${file}`, document.baseURI).toString();

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  get<T>(file: string, params?: Record<string, string>): Observable<T> {
    return this.http
      .get<T>(apiUrl(file), { params: new HttpParams({ fromObject: params ?? {} }) })
      .pipe(catchError(toApiError));
  }

  post<T>(file: string, body: unknown): Observable<T> {
    return this.http.post<T>(apiUrl(file), body).pipe(catchError(toApiError));
  }

  put<T>(file: string, body: unknown): Observable<T> {
    return this.http.put<T>(apiUrl(file), body).pipe(catchError(toApiError));
  }

  delete<T>(file: string, params?: Record<string, string>): Observable<T> {
    return this.http
      .delete<T>(apiUrl(file), { params: new HttpParams({ fromObject: params ?? {} }) })
      .pipe(catchError(toApiError));
  }
}

const toApiError = (error: HttpErrorResponse): Observable<never> => {
  // Sessione scaduta durante l'uso: si torna al login (auth.php risponde 401
  // anche al primo controllo della sessione, che gestisce da sé).
  if (error.status === 401 && !error.url?.includes('/api/auth.php')) {
    window.location.hash = '/login';
    window.location.reload();
  }
  const message =
    (typeof error.error === 'object' && error.error?.error) ||
    (error.status === 0 ? 'Impossibile contattare il server' : `Errore ${error.status}`);
  return throwError(() => new ApiError(message, error.status));
};
