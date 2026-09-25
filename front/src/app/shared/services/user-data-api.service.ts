import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';
import { UserCollectionResponse } from '../models/state';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public body: any = null) {
    super(message);
    this.name = 'ApiError';
  }
}

export function describeError(e: unknown): string {
  return e instanceof ApiError ? e.message : String(e);
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

@Injectable({
  providedIn: 'root'
})
export class UserDataApiService {

  constructor(private afAuth: AngularFireAuth) { }

  // uid of the live Firebase user, not the localStorage 'user' snapshot
  private async uid(): Promise<string> {
    const user = await firstValueFrom(this.afAuth.authState);
    if (!user) throw new ApiError(401, 'not_signed_in', 'You are not signed in.');
    return user.uid;
  }

  async request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const uid = await this.uid();
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await fetch(`${environment.apiUrl}/api/users/${encodeURIComponent(uid)}${path}`, init);
    } catch {
      throw new ApiError(0, 'network', 'The Reveal backend (port 8001) is not reachable.');
    }
    if (res.status === 204) return undefined as unknown as T;

    let text: string;
    try {
      text = await res.text();
    } catch {
      throw new ApiError(0, 'network', 'The connection to the Reveal backend was interrupted.');
    }
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }

    if (!res.ok) {
      throw new ApiError(res.status, data?.error ?? 'http_error', data?.message ?? `HTTP ${res.status}`, data);
    }
    if (data === null) {
      throw new ApiError(res.status, 'invalid_response', 'The Reveal backend returned an invalid response.');
    }
    return data as T;
  }

  getCollection(): Promise<UserCollectionResponse> {
    return this.request<UserCollectionResponse>('GET', '/collection');
  }
}
