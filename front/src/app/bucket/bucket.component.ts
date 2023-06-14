import { Component, OnInit, EventEmitter, Output } from '@angular/core';
import { AuthService } from '../shared/services/auth.service';
import { BucketService } from '../shared/services/bucket.service';
import { NgxSpinnerService } from "ngx-spinner";

@Component({
  selector: 'app-bucket',
  templateUrl: './bucket.component.html',
  styleUrls: ['./bucket.component.css']
})
export class BucketComponent implements OnInit {
  
  @Output() bucketSaved = new EventEmitter<any>();
  @Output() bucketAdded = new EventEmitter<any>();

  public userBuckets: any = [];
  public savedBuckets: any = [];
  public bucketsInUse: any = [];
  public lastRightClick: number = 0;
  public bucketToDrop: number =  -1;
  constructor(public authService: AuthService, public bucketService: BucketService, private spinner: NgxSpinnerService) { }

  ngOnInit(): void { }

  addBucket(bucketName: string) {
    this.spinner.show();
    
    const query = this.bucketService.updateUserBuckets(bucketName);
    query.then((data:any) => {
      this.userBuckets = data;
      this.bucketsInUse.push(this.userBuckets[this.userBuckets.length - 1]);
      setTimeout(() => {
        this.bucketAdded.emit(this.bucketsInUse[this.bucketsInUse.length - 1].id);
        this.spinner.hide();
      },
      1000);
    });
  }

  saveBucket(bucketId: number) {
    this.spinner.show();
    console.log('start saving')
    const query = this.bucketService.saveUserBucket(bucketId);
    query.then((data:any) => {
      this.userBuckets = data;
      this.displaySavedBucket();
      setTimeout(() => {  
        this.bucketSaved.emit("saving"); 
        this.spinner.hide();
      },
      1000);
    });
  }

  destroyBucket(bucketId: number) {
    this.spinner.show();
    const query = this.bucketService.destroyUserBucket(bucketId);
    query.then((data:any) => {
      this.userBuckets = data;
      this.destroySavedBucket(bucketId);
      this.closeInUseBuckets(bucketId);
      setTimeout(() => {  
        this.spinner.hide();
      },
      1000);
    });
  }

  closeBucket(bucketId: number) {
    this.spinner.show();
    const query = this.bucketService.closeUserBucket(bucketId);
    query.then((data:any) => {
      this.userBuckets = data;
      this.closeInUseBuckets(bucketId);
      setTimeout(() => {  
        this.spinner.hide();
      },
      1000);
    });
  }

  openUserBucket(bucketId: number) {
    let bool = true;
    for(let i = 0; i < this.bucketsInUse.length; i++) {
      if(this.bucketsInUse[i].id == bucketId) bool = false;
    };
    
    if(bool) {
      this.spinner.show();
      const query = this.bucketService.openUserBucket(bucketId);
      query.then((data:any) => {
        this.userBuckets = data;
        this.displayOpenedBucket(bucketId);
        setTimeout(() => {  
          this.bucketAdded.emit(bucketId);  
          this.spinner.hide();
        },
        1000);
      });
    } else {
      console.log("bucket already opened")
    }
  }

  displayOpenedBucket(bucketId: number) {
    for(let i = 0; i < this.userBuckets.length; i++) {
      if(this.userBuckets[i].id == bucketId) {
        this.bucketsInUse.push(this.userBuckets[i]);
      }
    }
  }

  displaySavedBuckets() {
    for(let i = 0; i < this.userBuckets.length; i++) {
      if((this.userBuckets[i].isSaved) == 1 && (!this.savedBuckets.includes(this.userBuckets[i]))) {
        this.savedBuckets.push(this.userBuckets[i]);
      }
    }
  }

  displaySavedBucket() {
    this.savedBuckets = [];
    for(let i = 0; i < this.userBuckets.length; i++) {
      if((this.userBuckets[i].isSaved == 1)) this.savedBuckets.push(this.userBuckets[i]);
    }
  }
  
  displayInUseBuckets() {
    for(let i = 0; i < this.userBuckets.length; i++) {
      if((!this.bucketsInUse.includes(this.userBuckets[i])) && (this.userBuckets[i].inUse == 1)) {
        this.bucketsInUse.push(this.userBuckets[i]);
      }
    }
  }

  displayAddedBucket() {
    if(!this.bucketsInUse.includes(this.userBuckets[this.userBuckets.length - 1])) {
      this.bucketsInUse.push(this.userBuckets[this.userBuckets.length - 1]);
    }
  }

  closeInUseBuckets(bucketId: number) {
    for(let i = 0; i < this.bucketsInUse.length; i++) {
      if(this.bucketsInUse[i].id == bucketId) {
        const index = this.bucketsInUse.indexOf(this.bucketsInUse[i]);
        if (index !== -1) {
          this.bucketsInUse.splice(index, 1);
        }
      }
    }    
  }

  destroySavedBucket(bucketId: number) {
    for(let i = 0; i < this.savedBuckets.length; i++) {
      if(this.savedBuckets[i].id == bucketId) {
        const index = this.savedBuckets.indexOf(this.savedBuckets[i]);
        if (index !== -1) {
          this.savedBuckets.splice(index, 1);
        }
      }
    }    
  }

  onRightClick(bucketId: any) {
    this.lastRightClick = bucketId;
  }

  allowDrop(event:any, bucketId: any) {
    event.preventDefault();
    this.bucketToDrop = bucketId;
  }

  addImage(bucketId: number, imageUrl: string) {
    for(let i = 0; i < this.bucketsInUse.length; i++) {
      if(bucketId == this.bucketsInUse[i].id && !this.bucketsInUse[i].imageUrls.includes(imageUrl)) {
        this.spinner.show();
        console.log('start saving image to bucket')
        const query = this.bucketService.addImageToBucket(bucketId, imageUrl);
        query.then((data:any) => {
          this.userBuckets = data;
          setTimeout(() => {  
            this.bucketsInUse[i].imageUrls.push(imageUrl);
            console.log(this.userBuckets)
            console.log(this.savedBuckets)
            this.spinner.hide();
          },
          1000);
        });
      }
    }
  }

  getImages(bucketId: number, from: string) {
    if(from == "saved") {
      for(let i = 0; i < this.savedBuckets.length; i++) {
        if(bucketId == this.savedBuckets[i].id) {
          return this.savedBuckets[i].imageUrls;
        }
      }
    } else {
      for(let i = 0; i < this.bucketsInUse.length; i++) {
        if(bucketId == this.bucketsInUse[i].id) {
          return this.bucketsInUse[i].imageUrls;
        }
      }
    }
  }
}
