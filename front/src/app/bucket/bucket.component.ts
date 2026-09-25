import { Component, HostListener, OnInit } from '@angular/core';
import { BucketService } from '../shared/services/bucket.service';
import { ApiError, describeError } from '../shared/services/user-data-api.service';
import { Bucket } from '../shared/models/bucket';
import { thumbnailUrl } from '../shared/image-ref';
import { NgxSpinnerService } from "ngx-spinner";

@Component({
  selector: 'app-bucket',
  templateUrl: './bucket.component.html',
  styleUrls: ['./bucket.component.css']
})
export class BucketComponent implements OnInit {

  // both lists are derived from byId, so they always share the same objects
  public bucketsInUse: Bucket[] = [];
  public savedBuckets: Bucket[] = [];
  public lastRightClick: number = -1;
  public bucketToDrop: number = -1;
  public busy = false;
  private byId = new Map<number, Bucket>();

  constructor(public bucketService: BucketService, private spinner: NgxSpinnerService) { }

  ngOnInit(): void { }

  trackById = (_: number, bucket: Bucket) => bucket.id;

  setAll(list: Bucket[]) {
    this.byId = new Map(list.map(b => [b.id, b]));
    this.refresh();
  }

  addBucket(bucketName: string): Promise<boolean> {
    const name = bucketName.trim();
    if (!name) {
      alert('Please enter a name.');
      return Promise.resolve(false);
    }
    return this.run('Creating the bucket failed', async () => {
      this.upsert(await this.bucketService.create(name));
    });
  }

  saveBucket(bucketId: number): Promise<boolean> {
    return this.run('Saving the bucket failed', async () => {
      this.upsert(await this.bucketService.update(bucketId, { isSaved: true }));
    });
  }

  closeBucket(bucketId: number): Promise<boolean> {
    const bucket = this.byId.get(bucketId);
    if (!bucket) return Promise.resolve(false);
    if (!bucket.isSaved) {
      // an unsaved bucket that is closed could never be reached again
      if (!confirm("This bucket is not saved. Closing it will delete it. Continue?")) return Promise.resolve(false);
      return this.run('Closing the bucket failed', () => this.removeBucket(bucketId));
    }
    return this.run('Closing the bucket failed', async () => {
      this.upsert(await this.bucketService.update(bucketId, { inUse: false }));
    });
  }

  destroyBucket(bucketId: number): Promise<boolean> {
    if (!confirm("Would you like to exclude this bucket?")) return Promise.resolve(false);
    return this.run('Deleting the bucket failed', () => this.removeBucket(bucketId));
  }

  openUserBucket(bucketId: number): Promise<boolean> {
    if (this.byId.get(bucketId)?.inUse) {
      console.log("bucket already opened");
      return Promise.resolve(false);
    }
    return this.run('Opening the bucket failed', async () => {
      this.upsert(await this.bucketService.update(bucketId, { inUse: true }));
    });
  }

  // one request per drop, whatever the number of images
  addImages(bucketId: number, files: string[]): Promise<boolean> {
    const bucket = this.byId.get(bucketId);
    if (!bucket) return Promise.resolve(false);
    const present = new Set(bucket.images);
    const fresh = [...new Set(files.filter(f => !!f && !present.has(f)))];
    if (!fresh.length) return Promise.resolve(true);
    return this.run('Adding the images to the bucket failed', async () => {
      this.upsert(await this.bucketService.addImages(bucketId, fresh));
    });
  }

  getImageUrls(bucketId: number): string[] {
    return (this.byId.get(bucketId)?.images ?? []).map(f => thumbnailUrl(f));
  }

  allowDrop(event: DragEvent) {
    event.preventDefault();
  }

  // drop fires before the dragend of the dragged image, and only on a real drop
  onDrop(event: DragEvent, bucketId: number) {
    event.preventDefault();
    this.bucketToDrop = bucketId;
  }

  // a drop with no gallery dragend after it (a desktop file, a link) must not leak into the next drag
  @HostListener('document:dragstart')
  resetDropTarget() {
    this.bucketToDrop = -1;
  }

  private async removeBucket(bucketId: number): Promise<void> {
    try {
      await this.bucketService.remove(bucketId);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    }
    this.forget(bucketId);
  }

  private upsert(bucket: Bucket) {
    this.byId.set(bucket.id, bucket);
    this.refresh();
  }

  private forget(bucketId: number) {
    this.byId.delete(bucketId);
    this.refresh();
  }

  private refresh() {
    const all = [...this.byId.values()].sort((a, b) => a.id - b.id);
    this.bucketsInUse = all.filter(b => b.inUse);
    this.savedBuckets = all.filter(b => b.isSaved);
  }

  private async run(message: string, op: () => Promise<void>): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.spinner.show();
    try {
      await op();
      return true;
    } catch (e) {
      alert(`${message}: ${describeError(e)}`);
      return false;
    } finally {
      this.busy = false;
      this.spinner.hide();
    }
  }
}
