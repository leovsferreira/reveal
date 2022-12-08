import { Component, OnInit, TemplateRef, ViewChild, Output, EventEmitter } from '@angular/core';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { LightGallery } from 'lightgallery/lightgallery';
import lgZoom from 'lightgallery/plugins/zoom';
import lgThumbnail from 'lightgallery/plugins/thumbnail';

@Component({
  selector: 'app-model-gallery',
  templateUrl: './model-gallery.component.html',
  styleUrls: ['./model-gallery.component.css']
})
export class ModelGalleryComponent implements OnInit {

  @ViewChild('modalGallery', { static: true }) private modalGallery!: TemplateRef<any>;
  public modalRef: BsModalRef = new BsModalRef;
  private lightGallery!: LightGallery;
  public items:any = [];
  private needRefresh = false;
  public settings = {
    counter: false,
    plugins: [lgZoom, lgThumbnail],
    speed: 500,
    licenseKey: 'DCD313B0-6D77495F-A570ED6F-3C6C65ED'
  };

  constructor(private modalService: BsModalService) {}

  ngOnInit(): void { }

  ngAfterViewChecked(): void {
    if (this.needRefresh) {
      this.lightGallery.refresh();
      this.needRefresh = false;
    }
  }

  openModal(imagesList: any) {
    for(let i = 0; i < imagesList.length; i++) {
      this.items.push({src: `${imagesList[i].replace("thumbnails","images")}`,
                       thumb: `${imagesList[i]}`, 
                       index: i,                       
                       width: 120, 
                       height: 120, 
                       margin: 1,
                       border:'none',
                       borderColor:'',
                       borderWidth:'0px'});
    }

    this.modalRef = this.modalService.show(this.modalGallery, {class: 'modal-lg'});
  }

  onInit = (detail:any): void => {
    this.lightGallery = detail.instance;
  };

  closeModal() {
    this.items = [];
    this.modalRef.hide();
  }

}
