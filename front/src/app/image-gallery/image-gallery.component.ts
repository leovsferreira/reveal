import { environment } from 'src/environments/environment';
import { Component, OnInit, ElementRef, ViewChild, Output, EventEmitter, TemplateRef } from '@angular/core';
import { LightGallery } from 'lightgallery/lightgallery';
import lgZoom from 'lightgallery/plugins/zoom';
import lgThumbnail from 'lightgallery/plugins/thumbnail';
import { BsModalService, BsModalRef } from 'ngx-bootstrap/modal';
import { imageFileFromUrl } from '../shared/image-ref';

@Component({
  selector: 'app-image-gallery',
  templateUrl: './image-gallery.component.html',
  styleUrls: ['./image-gallery.component.css']
})

export class ImageGalleryComponent implements OnInit {
  
  @ViewChild("imageGallery", { static: true }) private imageGalleryDiv!: ElementRef;
  @ViewChild('infoTemplate', { static: true }) private infoTemplate!:TemplateRef<any>;

  @Output() toggleImage = new EventEmitter<any>();
  @Output() gallerySearchSelected = new EventEmitter<any>();
  @Output() dropImage = new EventEmitter<string[]>();
  @Output() getInfo = new EventEmitter<any>();

  private lightGallery!: LightGallery;
  private needRefresh = false;
  public selectedIndices: number[] = [];
  private allImages: any[] = [];
  
  private batchSize = 50; 
  public hasMoreImages = false;

  public tabsCounter: number = 0;
  public settings = {
    counter: false,
    plugins: [lgZoom, lgThumbnail],
    speed: 500,
    licenseKey: 'DCD313B0-6D77495F-A570ED6F-3C6C65ED'
  };
  public items:any = [];
  public modalRef: BsModalRef = new BsModalRef;
  public template: any;
  public info: string = "";
  
  constructor(private modalService: BsModalService) { }

  ngOnInit(): void { }
  
  ngAfterViewInit() {
    this.template = this.infoTemplate;
    const interval = setInterval(() => {
        const btn = document.getElementById("lg-info-1");
        if(btn) {
            btn.addEventListener("click", () => {
                this.openModal(this.template);
            });
            clearInterval(interval);
        }
    }, 500);
  }

  ngAfterViewChecked(): void {
    if (this.needRefresh) {
      this.lightGallery.refresh();
      this.needRefresh = false;
      
      const images = document.querySelectorAll('.grid-item img');
      for(let i = 0; i < images.length; i++) { 
        images[i].addEventListener('dragend', (event:any) => {
          const dragged = imageFileFromUrl(event.target?.src);
          if (dragged) this.dropImage.emit(this.filesForDrag(dragged));
        });
      }
    }
  }

  onInit = (detail:any): void => {
    this.lightGallery = detail.instance;
    const customButtom = '<button type="button" aria-label="Info" id="lg-info-1" class="lg-icon"><i class="fa-solid fa-question fa-xs"></i></button>';
    detail.instance.outer.find('.lg-toolbar').append(customButtom);
  };

  updateImageGallery(data: any) {
    this.allImages = [];
    this.items = [];
    this.selectedIndices = [];

    const similarities = data.similarities;
    const paths = data.labelPaths;
    const ids = data.labels;

    for(let i = 0; i < paths.length; i++) {
      this.allImages.push({
        src: `${environment.imagesUrl}/processed/${paths[i]}`,
        thumb: `${environment.imagesUrl}/thumbnails/${paths[i]}`,
        file: Array.isArray(paths[i]) ? paths[i][0] : paths[i],
        id: ids[i],
        index: i, 
        width: 80, 
        height: 80, 
        margin: 2,
        border:'none',
        borderColor:'',
        borderWidth:'0px'
      });
    }

    this.items = this.allImages.slice(0, this.batchSize);
    this.hasMoreImages = this.allImages.length > this.items.length;

    this.needRefresh = true;
  }

  loadMore() {
    if (!this.hasMoreImages) return;

    const currentLength = this.items.length;
    const nextBatch = this.allImages.slice(currentLength, currentLength + this.batchSize);
    
    this.items = [...this.items, ...nextBatch];
    
    this.hasMoreImages = this.allImages.length > this.items.length;
    this.needRefresh = true;
  }

  gallerySearch() {
    if(this.hasSelectedImages()) {
      const imageIndices:any = [];
      const imageLabels:string[] = [];
      for(let i = 0; i < this.selectedIndices.length; i++) {
        imageIndices.push(this.selectedIndices[i]);
        this.allImages.forEach((img: any) => {
          if(this.selectedIndices[i] == img.id) imageLabels.push(img.src);
        })
      };
      this.gallerySearchSelected.emit({"indices": imageIndices, "labels": imageLabels, "queryType": 1});
    }
  }

  onClick(event: any, id: number, index: number) {
    event.preventDefault(); 

    if(event.ctrlKey) {
      event.stopImmediatePropagation();
      event.stopPropagation();

      const targetImage = this.allImages[index];

      if(!this.selectedIndices.includes(id)) {
        this.selectedIndices.push(id);

        targetImage.border = 'solid';
        targetImage.borderColor = "#00FF00";
        targetImage.borderWidth = "3px";
      } else {
        const selectedItemIndex = this.selectedIndices.indexOf(id);
        this.selectedIndices.splice(selectedItemIndex, 1);

        targetImage.border = 'none';
        targetImage.borderColor = "";
        targetImage.borderWidth = "0px";
      }
      
      this.toggleImage.emit({labels: this.selectedIndices, selected: true});
    }
  }

  selectImages(points: any) {
    this.selectedIndices = [];

    for(let i = 0; i < this.allImages.length; i++) {
      this.allImages[i].border = 'none';
      this.allImages[i].borderColor = "";
      this.allImages[i].borderWidth = "0px";
    }

    for(let i = 0; i < points.length; i++) {
      if (this.allImages[points[i]]) {
        this.allImages[points[i]].border = 'solid';
        this.allImages[points[i]].borderColor = "#00FF00";
        this.allImages[points[i]].borderWidth = "3px";
        this.selectedIndices.push(this.allImages[points[i]].id);
      }
    }
    
  }

  // dragging a selected image (Ctrl-click or lasso) drags the whole selection; an unselected one drags only itself
  filesForDrag(dragged: string): string[] {
    const selected = new Set(this.selectedIndices);
    const files = this.allImages.filter((img: any) => selected.has(img.id)).map((img: any) => String(img.file));
    return files.includes(dragged) ? files : [dragged];
  }

  updateTabCounter(value: number) {
    this.tabsCounter += value;
  }

  hasSelectedImages() {
    return this.selectedIndices.length > 0
  }

  hasNext() { return false; }
  hasPrevious() { return false; }

  hasImages() {
    return this.items.length > 0;
  }

  clear() {
    this.items = [];
    this.allImages = [];
    this.selectedIndices = [];
    this.hasMoreImages = false;
  }

  openModal(template: TemplateRef<any>) {
    this.modalRef = this.modalService.show(template);
  }

  onAfterSlide = (detail: any): void => {
    const image = document.getElementsByClassName("lg-thumb-item active")[0].children[0] as HTMLImageElement;
    const string = image.src.replace(`${environment.imagesUrl}/thumbnails/`, "")
    this.getInfo.emit(string);
  };
}