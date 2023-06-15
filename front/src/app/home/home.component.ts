import { AfterViewInit, Component, ViewChild, TemplateRef } from '@angular/core';

import { ImageEmbeddingComponent } from 'src/app/image-embedding/image-embedding.component';
import { TextEmbeddingComponent } from 'src/app/text-embedding/text-embedding.component';
import { ForceGraphComponent } from 'src/app/force-graph/force-graph.component';
import { ImageGalleryComponent } from 'src/app/image-gallery/image-gallery.component';
import { ColorLegendComponent } from '../color-legend/color-legend.component';
import { WordCloudComponent } from '../word-cloud/word-cloud.component';
import { BucketComponent } from '../bucket/bucket.component';
import { StateComponent } from '../state/state.component';
import { ModelGalleryComponent } from 'src/app/model-gallery/model-gallery.component';

import { ApiService } from 'src/app/shared/api.service';
import { AuthService } from '../shared/services/auth.service';
import { GlobalService } from 'src/app/shared/global.service';
import { Query, StateQuery } from '../shared/api.models';
import { UntypedFormGroup, UntypedFormControl, Validators} from '@angular/forms';
import { ContextMenu, MenuItemModel, ContextMenuModel, MenuEventArgs } from '@syncfusion/ej2-navigations';
import { enableRipple } from '@syncfusion/ej2-base';
import { NgxSpinnerService } from "ngx-spinner";
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { take } from 'rxjs';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements AfterViewInit {
  public modalRef: BsModalRef = new BsModalRef;
  public Query: Query = new Query();
  public EmbeddingQuery: Query = new Query();
  public StateQuery: StateQuery = new StateQuery();

  public images: string[] = [];
  public texts: string[] = [];
  public searchForm = new UntypedFormGroup({
    texts: new UntypedFormControl('', [Validators.required, Validators.minLength(3)]),
    images: new UntypedFormControl('', [Validators.required]),
    imageSource: new UntypedFormControl('', [Validators.required])
  });
  public wichModeSelected: string = "gallery";
  public placeholder = 'Search';
  public configVisibility = false;
  public inputDisabler = false;
  public draggable = true;
  public similarityValue = 80;
  public savedBuckets: any[] = [];
  private rightClickCount: number = 1;
  private ctxMenuSavedBuckets: any = [];
  private ctxMenuInUseBuckets: any = [];

  @ViewChild(ImageEmbeddingComponent, { static: true }) private imageEmbedding!:ImageEmbeddingComponent;
  @ViewChild(TextEmbeddingComponent, { static: true }) private textEmbedding!: TextEmbeddingComponent;
  @ViewChild(ForceGraphComponent, { static: true }) private forceGraph!: ForceGraphComponent;
  @ViewChild(ImageGalleryComponent, { static: true }) private imageGallery!: ImageGalleryComponent;
  @ViewChild(ColorLegendComponent, {static: true}) private coloLegend!: ColorLegendComponent;
  @ViewChild(WordCloudComponent, {static: true}) private wordCloud!: WordCloudComponent;
  @ViewChild(BucketComponent, {static: true}) public bucket!: BucketComponent;
  @ViewChild(StateComponent, {static: true}) public state!: StateComponent;
  @ViewChild(ModelGalleryComponent, {static: true}) public modalGallery!: ModelGalleryComponent;

  constructor(public api: ApiService,
              public global: GlobalService, 
              private spinner: NgxSpinnerService, 
              public authService: AuthService,
              public modalService: BsModalService) { }
  
  ngOnInit(): void {
    this.spinner.show();
    //BUCKEET ELEEMENTN LOAD
    const userCollection = (JSON.parse(localStorage.getItem('user_collection')!));

    if(userCollection !== null) {
      this.bucket.userBuckets = (JSON.parse(localStorage.getItem('user_collection')!)).buckets;
      this.state.savedStates = (JSON.parse(localStorage.getItem('user_collection')!)).states;
      this.bucket.displayInUseBuckets();
      this.bucket.displaySavedBuckets();
    } else {
      this.authService.userCollection.pipe(take(2)).subscribe((data: any) => {
        if(Object.keys(data).length) {
          this.bucket.bucketsInUse = [];
          this.bucket.savedBuckets = [];
          this.bucket.userBuckets = data.buckets;
          this.state.savedStates = data.states;
          this.bucket.displayInUseBuckets();
          this.bucket.displaySavedBuckets();
        }
      });
    }
  }

  ngAfterViewInit(): void { 

    enableRipple(true);
    //inicializa menu para force graph
    const menuItemsForceGraph: MenuItemModel[] = [
    {
        text: 'Union',
        id: 'un'
    },
    {
        text: 'Intersection',
        id: 'in'
    },
    {
        text: 'Difference',
        id: 'dif'
    },
    {
      text: 'Delete',
      id: 'del'
    }
  ];
    let menuOptionsForceGraph: ContextMenuModel = {
        target: '#force-graph-div',
        items: menuItemsForceGraph,
        select: this.onForceGraphMenuItemSelect.bind(this)
    };
    // Initialize ContextMenu component.
    const ForceGraph: ContextMenu = new ContextMenu(menuOptionsForceGraph, '#contextmenu-force-graph')

    //inicializa menu para image-embedding
    const menuItemsInterfaceSearch: MenuItemModel[] = [{
        text: 'Search',
        id: 'src'
      }];

      let menuOptionsImageEmbedding: ContextMenuModel = {
          target: '#image-embedding-div',
          items: menuItemsInterfaceSearch,
          select: this.onInterfaceSearch.bind(this)
      };
      let menuOptionsTextEmbedding: ContextMenuModel = {
        target: '#text-embedding-div',
        items: menuItemsInterfaceSearch,
        select: this.onInterfaceSearch.bind(this)
      };
      const textEmbedding: ContextMenu = new ContextMenu(menuOptionsTextEmbedding, '#contextmenu-text-embedding')
      const ImageEmbedding: ContextMenu = new ContextMenu(menuOptionsImageEmbedding, '#contextmenu-image-embedding')
      
      //inicializa menu para a galeria de imagens ou palavras
      let menuOptionsGalleries: ContextMenuModel = {
        target: '#gallery-div',
        items:menuItemsInterfaceSearch,
        select: this.onInterfaceSearch.bind(this)
       };
      // Initialize ContextMenu component.
      const Galleries: ContextMenu = new ContextMenu(menuOptionsGalleries, '#contextmenu-galleries')

      setTimeout(() => {  
        this.setAllBucketsMenu('first load');
        this.setAllSavedStatesMenu();
        this.spinner.hide();
      },
      2000);
  }

  async search() {

    this.Query.textsQuery = this.texts;
    this.Query.imagesQuery = this.images;
    this.Query.similarityValue = this.similarityValue;
    this.Query.from = 'searchbar'
    if((this.Query.textsQuery.length > 0 && this.Query.textsQuery[0] !== "") || this.Query.imagesQuery.length > 0) {
      if(this.Query.textsQuery.length > 0 && this.Query.imagesQuery.length > 0) {
        this.Query.queryType = 2;
      } else if(this.Query.textsQuery.length > 0) {
        this.Query.queryType = 0;
      } else {
        this.Query.queryType = 1;
      }

      this.spinner.show();
      const res = await this.api.getData(this.Query);
      const schema = this.forceGraph.schema;
      //tira as seleções caso já tenha buscado uma vez
      if (schema.query.length > 0) { this.onSelectionsClear() };
      //grava o resultado da busca 
      schema.query.push(this.Query);
      schema.number_of_queries += 1;
      schema.imagesIds = res.images.labels;
      schema.textsIds = res.texts.labels;
      schema.textsSimilarities = res.texts.similarities;
      schema.imagesSimilarities = res.images.similarities;
      schema.similarityValue = res.images.similarityValue;
      this.forceGraph.schema = schema;
      //starta os embeddings
      this.forceGraph.addNode('searchbar');
      this.imageEmbedding.setupImageEmbedding(res.images);
      this.textEmbedding.setupTextEmbedding(res.texts);
      this.imageGallery.updateImageGallery(res.images);
      this.imageGallery.tabsCounter = 0;  
      this.coloLegend.updateColorLegend(res.texts.similarities, res.images.similarities);
      this.wordCloud.updateWordCloud(res.texts);
      this.spinner.hide();
    } else {
      alert("Query empty")
    }
    //reseta o formulário
    this.texts = [];
    this.images = [];
    this.searchForm.reset();
  }

  async embeddingsToState(idsAndSimilarities: number[][]) {
    this.spinner.show();
    
    if(idsAndSimilarities.length > 0) {
      this.StateQuery.imagesIds = idsAndSimilarities[0];
      this.StateQuery.imagesSimilarities = idsAndSimilarities[1];
      this.StateQuery.textsIds = idsAndSimilarities[2];
      this.StateQuery.textsSimilarities = idsAndSimilarities[3];
      this.StateQuery.similarityValue = this.similarityValue;
      this.onSelectionsClear();
      //solicita imagens e textos de acordo com o id das imagens
      const res = await this.api.getState(this.StateQuery);
      if(res.images.similarities.length > 0 && res.texts.similarities.length > 0) {
        this.imageEmbedding.setupImageEmbedding(res.images);
        this.textEmbedding.setupTextEmbedding(res.texts);
        this.imageGallery.updateImageGallery(res.images);
        this.imageGallery.tabsCounter = 0;  
        this.coloLegend.updateColorLegend(res.texts.similarities, res.images.similarities);
        this.wordCloud.updateWordCloud(res.texts);
      } else {
        alert('Empty result')
      }

    } else {
      this.resetAll();
    }
    this.spinner.hide();
  }

  async searchSelected(event: any) {
    this.EmbeddingQuery.queryType = event.queryType;
    this.EmbeddingQuery.imagesQuery = event.imageLabels;
    this.EmbeddingQuery.textsQuery = event.textLabels;
    this.EmbeddingQuery.similarityValue = this.similarityValue;
    this.EmbeddingQuery.from = 'interface';
    this.spinner.show();
    const res = await this.api.getData(this.EmbeddingQuery);
    const schema = this.forceGraph.schema;
    
    //tira as seleções caso já tenha buscado uma vez
    if (schema.query.length > 0) { this.onSelectionsClear() };
    //grava o resultado da busca 
    schema.query.push(this.EmbeddingQuery);
    schema.number_of_queries += 1;
    schema.imagesIds = res.images.labels;
    schema.textsIds = res.texts.labels;
    schema.textsSimilarities = res.texts.similarities;
    schema.imagesSimilarities = res.images.similarities;
    schema.similarityValue = res.images.similarityValue;
    this.forceGraph.schema = schema;
    //adiciona no
    this.forceGraph.addNode('interface');
    //starta os embeddings
    this.imageEmbedding.setupImageEmbedding(res.images);
    this.textEmbedding.setupTextEmbedding(res.texts);
    this.imageGallery.updateImageGallery(res.images);
    this.imageGallery.tabsCounter = 0;  
    this.coloLegend.updateColorLegend(res.texts.similarities, res.images.similarities);
    this.wordCloud.updateWordCloud(res.texts);
    this.spinner.hide();
  }

  linkImagesAndTexts(event: any) {
    if(event.from == 'text') {
      const uniqueTextIds: any[] = [];
      const allTextIds = this.textEmbedding.dataset.imageIds;
      
      for(let i = 0; i < event.ids.length; i++) {
        let list = allTextIds[event.ids[i]];
        for(let j = 0; j < list.length; j++) {
          if(!uniqueTextIds.includes(list[j])) uniqueTextIds.push(list[j])  
        }
      }
      this.imageEmbedding.linkImages(uniqueTextIds);
    } else {
      const uniqueImageIds: any[] = [];
      let allImageIds = this.imageEmbedding.dataset.textIds;

      for(let i = 0; i < event.ids.length; i++) {
        let list = allImageIds[event.ids[i]];
        for(let j = 0; j < list.length; j++) {
          if(!uniqueImageIds.includes(list[j])) uniqueImageIds.push(list[j])  
        }
      }
      this.textEmbedding.linkTexts(uniqueImageIds);
    }
  }

  onFileChange(event: any) {
    if (event.target.files && event.target.files[0]) {
      let filesAmount = event.target.files.length;
      for (let i = 0; i < filesAmount; i++) {
        let reader = new FileReader();
        reader.onload = (event:any) => {
          this.images.push(event.target.result); 
          this.searchForm.patchValue({
            imageSource: this.images
          });
        }
        reader.readAsDataURL(event.target.files[i]);
      }
    }
  }

  onTextChange(event: any) {
    if(event !== null) {
      const re = /\s*;\s*/;
      const textList = event.split(re);
      this.texts = textList;
    }
  }

  onSelectionsClear() {
      //clearing everything linked to images
      if(this.imageEmbedding.scatterGl) {
        this.highlightImageGallery([]);
        this.imageEmbedding.selectedPoints = [];
        this.imageEmbedding.highlitedIndices = [];
        this.imageEmbedding.scatterGl.select([]);
        this.imageEmbedding.highlightTexts([]);
      }

      //clearing everything linked to texts
      if(this.textEmbedding.scatterGl) {
        this.highlightWordCloud([]);
        this.textEmbedding.selectedPoints = [];
        this.textEmbedding.highlitedIndices = [];
        this.textEmbedding.scatterGl.select([]);
        this.textEmbedding.highlightImages([]);
      }
      
  }

  toggleEmbeddingImageFromGallery(obj: any) {
    this.imageEmbedding.toggleImages(obj);
  }

  toggleEmbeddingTextFromCloud(obj: any) {
    this.textEmbedding.toggleText(obj)
  }

  toggleConfigVisibility() {
    this.configVisibility = !this.configVisibility;
  }

  isConfigVisible() {
    return this.configVisibility;
  }

  changeSimilarity(value: number) {
    this.similarityValue = value;
  }

  toggleDragBoxDrag() {
    this.draggable = !this.draggable;
  }

  onForceGraphMenuItemSelect(args: MenuEventArgs) {
    this.forceGraph.chooseSetOperations(args.item.id);
  }

  onInterfaceSearch(args: MenuEventArgs) {
    const selectedImagesIds = this.imageEmbedding.selectedPoints;
    const selectedTextsIds = this.textEmbedding.selectedPoints;

    const imageIndices:any = [];
    const textIndices:any = [];
    const imageLabels:string[] = [];
    const textLabels:string[] = [];

    if(selectedImagesIds.length > 0) {
      for(let i = 0; i < selectedImagesIds.length; i++) {
        imageIndices.push(this.imageEmbedding.dataset.metadata[selectedImagesIds[i]].labelIndex);
        imageLabels.push(`dataset/images/${this.imageEmbedding.dataset.labelPaths[selectedImagesIds[i]][0]}`);
      };
    }

    if(selectedTextsIds.length > 0) {
      for(let i = 0; i < selectedTextsIds.length; i++) {
        textIndices.push(this.textEmbedding.dataset.metadata[selectedTextsIds[i]].labelIndex);
        textLabels.push(this.textEmbedding.dataset.metadata[selectedTextsIds[i]].label[0]);
      };
    }

    if(selectedImagesIds.length > 0 || selectedTextsIds.length > 0) {
      let searchEventObj: any  = {};
      if(selectedImagesIds.length > 0 && selectedTextsIds.length > 0) {
        searchEventObj = { imageIndices: imageIndices, imageLabels: imageLabels, textIndices: textIndices, textLabels: textLabels, queryType: 2 }
      } else if(selectedTextsIds.length > 0 && selectedImagesIds.length == 0) {
        searchEventObj = { imageIndices: [], imageLabels: [], textIndices: textIndices, textLabels: textLabels, queryType: 0 }
      } else if(selectedImagesIds.length > 0 && selectedTextsIds.length == 0) {
        searchEventObj = { imageIndices: imageIndices, imageLabels: imageLabels, textIndices: [], textLabels: [], queryType: 1 }
      }
      this.searchSelected(searchEventObj)
    } else {
      console.log('nothing selected')
    }
  }

  setMode(value: string) {
    if(value == "gallery") {
      this.wichModeSelected = "gallery";
    } else {
      this.wichModeSelected = "cloud";
    };
  }

  openModal(template: TemplateRef<any>) {
    this.modalRef = this.modalService.show(template);
  }

  onBucketCreate(bucketName: string) {
    this.bucket.addBucket(bucketName);
  }

  onSaveState(stateName: string) {
    let bool = false;
    for(let i = 0; i  < this.state.savedStates.length; i++) {
      if(stateName == this.state.savedStates[i].name) bool = true;
    }
    if(bool) this.state.updateState(stateName, this.forceGraph.forceGraphData);
    else this.state.saveState(stateName, this.forceGraph.forceGraphData);
  }

  onInUseBucketsChange(args: MenuEventArgs) {
    if(args.item.id == 'save') {
      this.bucket.saveBucket(this.bucket.lastRightClick);
    } else if(args.item.id == 'close') {
      this.bucket.closeBucket(this.bucket.lastRightClick);
      document.getElementById("contextmenu-inusebucket-" + this.bucket.lastRightClick)!.remove();
    } else if(args.item.id == 'delete') {
      this.bucket.destroyBucket(this.bucket.lastRightClick);
    } else {
      const bucketImages = this.bucket.getImages(this.bucket.lastRightClick,'inuse');
      this.modalGallery.openModal(bucketImages);
    }
  }

  onSavedBucketsChange(args: MenuEventArgs) {
    if(args.item.id == 'delete') {
      this.bucket.destroyBucket(this.bucket.lastRightClick);
    } else if(args.item.id == 'open') {
      this.bucket.openUserBucket(this.bucket.lastRightClick);
    } else {
      if(!this.modalGallery.isModalOpen) {
        const bucketImages = this.bucket.getImages(this.bucket.lastRightClick, 'saved');
        this.modalGallery.openModal(bucketImages);        
      } else {
        console.log('modal already open')
      }
    }
  }

  onSavedStatesChange(args: MenuEventArgs) {
    if(this.rightClickCount == 1) {
      if(args.item.id == 'delete') {
        this.state.destroyState(this.state.lastRightClick);
      } else if(args.item.id == 'open') {
        this.state.openState(this.state.lastRightClick);
      }
    }
    this.rightClickCount = 0;    
  }

  setBucketsMenu(bucketId: number) {
    const menuItemsBucket: MenuItemModel[] = [
      {
          text: 'Save',
          id: 'save'
      },
      {
          text: 'Delete',
          id: 'delete'
      }, {
          text:  'Close',
          id: 'close'
      },{
        text: 'Image Gallery',
        id: 'gallery'
      }];

      let menuOptionsBucket: ContextMenuModel = {
          target: '#inusebucket-div-' + bucketId,
          items: menuItemsBucket,
          select: this.onInUseBucketsChange.bind(this)
      };

      return new ContextMenu(menuOptionsBucket, '#contextmenu-inusebucket-' + bucketId);
  }


  setSavedBucketsMenu(bucketId: number) {
    const menuItemsBucket: MenuItemModel[] = [
      {
        text:  'Open',
        id: 'open'
      },{
        text: 'Delete',
        id: 'delete'
      },{
        text: 'Image Gallery',
        id: 'gallery'
      }];
      let menuOptionsBucket: ContextMenuModel = {
          target: '#savedbucket-div-' + bucketId,
          items: menuItemsBucket,
          select: this.onSavedBucketsChange.bind(this)
      };

      return new ContextMenu(menuOptionsBucket, '#contextmenu-savedbucket-' + bucketId);
  }

  setSavedStatesMenu(stateId: number) {
    const menuItemsState: MenuItemModel[] = [
      {
        text:  'Open',
        id: 'open'
      },{
        text: 'Delete',
        id: 'delete'
      }];
      let menuOptionsState: ContextMenuModel = {
          target: '#state-div-' + stateId,
          items: menuItemsState,
          select: this.onSavedStatesChange.bind(this)
      };

    return new ContextMenu(menuOptionsState, '#contextmenu-state-' + stateId);
  }


  setAllBucketsMenu(from: string) {
    if(from !== 'saving') {
      for(let i = 0; i < this.bucket.bucketsInUse.length;  i++) {
        this.setBucketsMenu(this.bucket.bucketsInUse[i].id);
      }
    }

    for(let i = 0; i < this.bucket.savedBuckets.length;  i++) {
      this.setSavedBucketsMenu(this.bucket.savedBuckets[i].id)
    }
  }

  setAllSavedStatesMenu() {
    for(let i = 0; i < this.state.savedStates.length;  i++) {
      this.setSavedStatesMenu(this.state.savedStates[i].id)
    }
  }

  setFyToUndefined() {
    this.forceGraph.forceGraphData.nodes.forEach((node: any) => {
      node.fy = undefined;
    });
  }

  changeState(state: any) {
    if(state == -1) this.resetAll('reset');
    else this.forceGraph.openState(state);
  }

  onRightClick(id: number, from: string) {
    this.rightClickCount = 1;
    if(from == 'bucket') this.bucket.lastRightClick = id;
    else this.state.lastRightClick = id;
  }
  
  resetAll(from: string = 'node') {
    this.imageEmbedding.clear();
    this.textEmbedding.clear();
    this.coloLegend.clear();
    this.imageGallery.clear();
    this.wordCloud.clear();
    if(from == 'reset')  this.forceGraph.reset();
  }

  highlightImageGallery(points: any) {
    this.imageGallery.selectImages(points);
  }

  highlightWordCloud(points: any) {
    this.wordCloud.selectTexts(points);
  }

  addImageToBucket(event: any) {
    console.log(event)
    console.log(this.imageGallery.selectedIndices)
    if(this.bucket.bucketToDrop !== -1) {
      if(this.imageGallery.selectedIndices.length > 0) {
        for(let i = 0; i < this.imageGallery.selectedImagePaths.length; i++) {
          this.bucket.addImage(this.bucket.bucketToDrop, this.imageGallery.selectedImagePaths[i]);
        }
      } else {
        this.bucket.addImage(this.bucket.bucketToDrop, event);
      }
    }
    this.bucket.bucketToDrop = -1; 
  }
}
