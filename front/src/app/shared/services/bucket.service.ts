import { Injectable } from '@angular/core';
import { Bucket, BucketPatch } from '../models/bucket';
import { UserDataApiService } from './user-data-api.service';

@Injectable({
  providedIn: 'root'
})
export class BucketService {

  constructor(private api: UserDataApiService) { }

  list(): Promise<Bucket[]> {
    return this.api.request<{ buckets: Bucket[] }>('GET', '/buckets').then(r => r.buckets);
  }

  create(name: string): Promise<Bucket> {
    return this.api.request<Bucket>('POST', '/buckets', { name });
  }

  update(id: number, patch: BucketPatch): Promise<Bucket> {
    return this.api.request<Bucket>('PATCH', `/buckets/${id}`, patch);
  }

  remove(id: number): Promise<void> {
    return this.api.request<void>('DELETE', `/buckets/${id}`);
  }

  // images are dataset filenames (e.g. "123.jpg"); the server dedupes
  addImages(id: number, images: string[]): Promise<Bucket> {
    return this.api.request<Bucket>('POST', `/buckets/${id}/images`, { images });
  }
}
