import { AfterViewInit, Component, OnInit, ViewChild, TemplateRef } from '@angular/core';

import { ImageEmbeddingComponent } from 'src/app/image-embedding/image-embedding.component';
import { TextEmbeddingComponent } from 'src/app/text-embedding/text-embedding.component';
import { CombinedEmbeddingComponent } from '../combined-embedding/combined-embedding.component';
import { ForceGraphComponent } from 'src/app/force-graph/force-graph.component';
import { ImageGalleryComponent } from 'src/app/image-gallery/image-gallery.component';
import { ColorLegendComponent } from '../color-legend/color-legend.component';
import { WordCloudComponent } from '../word-cloud/word-cloud.component';
import { BucketComponent } from '../bucket/bucket.component';
import { StateComponent } from '../state/state.component';
import { ModelGalleryComponent } from 'src/app/model-gallery/model-gallery.component';
import { MapComponent } from 'src/app/map/map.component';

import { PolygonFilterService } from '../shared/services/polygon-filter.service';
import { ApiService } from 'src/app/shared/api.service';
import { AuthService } from '../shared/services/auth.service';
import { ApiError, UserDataApiService, describeError } from '../shared/services/user-data-api.service';
import { GlobalService } from 'src/app/shared/global.service';
import { Query, StateQuery, InfoQuery } from '../shared/api.models';
import { SavedState } from '../shared/models/state';
import { UntypedFormGroup, UntypedFormControl, Validators} from '@angular/forms';
import { ContextMenu, MenuItemModel, ContextMenuModel, MenuEventArgs, BeforeOpenCloseMenuEventArgs } from '@syncfusion/ej2-navigations';
import { enableRipple } from '@syncfusion/ej2-base';
import { NgxSpinnerService } from "ngx-spinner";
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, AfterViewInit {
  public modalRef: BsModalRef = new BsModalRef;
  public Query: Query = new Query();
  public EmbeddingQuery: Query = new Query();
  public StateQuery: StateQuery = new StateQuery();
  public InfoQuery: InfoQuery = new InfoQuery();

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
  public displayCombinedComponent: boolean = false;
  private ctxMenuInUseBuckets?: ContextMenu;
  private ctxMenuSavedBuckets?: ContextMenu;
  private ctxMenuSavedStates?: ContextMenu;

  @ViewChild(ImageEmbeddingComponent, { static: true }) private imageEmbedding!:ImageEmbeddingComponent;
  @ViewChild(TextEmbeddingComponent, { static: true }) private textEmbedding!: TextEmbeddingComponent;
  @ViewChild(CombinedEmbeddingComponent, { static: true }) private combinedEmbedding!: CombinedEmbeddingComponent;
  @ViewChild(ForceGraphComponent, { static: true }) private forceGraph!: ForceGraphComponent;
  @ViewChild(ImageGalleryComponent, { static: true }) private imageGallery!: ImageGalleryComponent;
  @ViewChild(ColorLegendComponent, {static: true}) private coloLegend!: ColorLegendComponent;
  @ViewChild(WordCloudComponent, {static: true}) private wordCloud!: WordCloudComponent;
  @ViewChild(BucketComponent, {static: true}) public bucket!: BucketComponent;
  @ViewChild(StateComponent, {static: true}) public state!: StateComponent;
  @ViewChild(ModelGalleryComponent, {static: true}) public modalGallery!: ModelGalleryComponent;
  @ViewChild(MapComponent, {static: true}) private map!: MapComponent;

  constructor(public api: ApiService,
              public global: GlobalService, 
              private spinner: NgxSpinnerService, 
              public authService: AuthService,
              public modalService: BsModalService,
              private polygonFilter: PolygonFilterService,
              private userData: UserDataApiService) { }

  async ngOnInit(): Promise<void> {
    this.spinner.show();
    try {
      const collection = await this.userData.getCollection();
      this.bucket.setAll(collection.buckets);
      this.state.setList(collection.states);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_signed_in') {
        // the guard let us in on a stale localStorage 'user' (e.g. the session was revoked)
        this.authService.router.navigate(['sign-in']);
      } else {
        alert(`Loading your buckets and states failed: ${describeError(e)}`);
      }
    } finally {
      this.spinner.hide();
    }
  }

  trackById = (_: number, item: { id: number }) => item.id;

  ngAfterViewInit(): void { 

    enableRipple(true);
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
    const ForceGraph: ContextMenu = new ContextMenu(menuOptionsForceGraph, '#contextmenu-force-graph')

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
      let menuOptionsCombinedEmbedding: ContextMenuModel = {
        target: '#combined-embedding-div',
        items: menuItemsInterfaceSearch,
        select: this.onInterfaceSearch.bind(this)
      };
      const textEmbedding: ContextMenu = new ContextMenu(menuOptionsTextEmbedding, '#contextmenu-text-embedding')
      const ImageEmbedding: ContextMenu = new ContextMenu(menuOptionsImageEmbedding, '#contextmenu-image-embedding')
      const CombinedEmbedding: ContextMenu = new ContextMenu(menuOptionsCombinedEmbedding, '#contextmenu-combined-embedding')
      let menuOptionsGalleries: ContextMenuModel = {
        target: '#gallery-div',
        items:menuItemsInterfaceSearch,
        select: this.onInterfaceSearch.bind(this)
       };
      const Galleries: ContextMenu = new ContextMenu(menuOptionsGalleries, '#contextmenu-galleries')

      this.createListMenus();
  }

  // one menu per list, bound to the static list container: items added later need no menu of their own
  private createListMenus(): void {
    const pick = (attr: string, set: (id: number) => void) => (args: BeforeOpenCloseMenuEventArgs) => {
      const el = (args.event?.target as HTMLElement | null)?.closest(`[${attr}]`);
      if (!el) {
        args.cancel = true;
        return;
      }
      set(Number(el.getAttribute(attr)));
    };

    this.ctxMenuInUseBuckets = new ContextMenu({
      target: '#inuse-buckets-row',
      items: [{ text: 'Save', id: 'save' }, { text: 'Delete', id: 'delete' }, { text: 'Close', id: 'close' }, { text: 'Image Gallery', id: 'gallery' }],
      beforeOpen: pick('data-bucketid', id => this.bucket.lastRightClick = id),
      select: this.onInUseBucketsChange.bind(this)
    }, '#contextmenu-inuse-buckets');

    this.ctxMenuSavedBuckets = new ContextMenu({
      target: '#saved-buckets-list',
      items: [{ text: 'Open', id: 'open' }, { text: 'Delete', id: 'delete' }, { text: 'Image Gallery', id: 'gallery' }],
      beforeOpen: pick('data-bucketid', id => this.bucket.lastRightClick = id),
      select: this.onSavedBucketsChange.bind(this)
    }, '#contextmenu-saved-buckets');

    this.ctxMenuSavedStates = new ContextMenu({
      target: '#saved-states-list',
      items: [{ text: 'Open', id: 'open' }, { text: 'Delete', id: 'delete' }],
      beforeOpen: pick('data-stateid', id => this.state.lastRightClick = id),
      select: this.onSavedStatesChange.bind(this)
    }, '#contextmenu-saved-states');
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

      let res = await this.api.getData(this.Query);
      const currentPolygons = this.map.getCurrentPolygons();
      if (currentPolygons && currentPolygons.length > 0) {
        res = this.polygonFilter.applyPolygonFilter(res, currentPolygons);
      }   
      console.log(res)
      const schema = this.forceGraph.schema;
      if (schema.query.length > 0) { this.onSelectionsClear() };
      schema.query.push(this.Query);
      schema.number_of_queries += 1;
      schema.imagesIds = res.images.labels;
      schema.textsIds = res.texts.labels;
      schema.textsSimilarities = res.texts.similarities;
      schema.imagesSimilarities = res.images.similarities;
      schema.similarityValue = res.images.similarityValue;
      this.forceGraph.schema = schema;
      this.forceGraph.addNode('searchbar', currentPolygons);
      this.imageEmbedding.setupImageEmbedding(res.images);
      this.textEmbedding.setupTextEmbedding(res.texts);
      this.combinedEmbedding.setupCombinedEmbedding(res.images, res.texts);
      this.imageGallery.updateImageGallery(res.images);
      this.imageGallery.tabsCounter = 0;
      this.coloLegend.updateColorLegend(res.texts.similarities, res.images.similarities);
      this.wordCloud.updateWordCloud(res.texts);
      this.spinner.hide();
      this.loadMapWithHeatmap(res.images);
    } else {
      alert("Query empty")
    }
    this.texts = [];
    this.images = [];
    this.searchForm.reset();
  }

  async embeddingsToState(idsAndSimilarities: number[][]) {
    this.spinner.show();

    try {
      if(idsAndSimilarities.length > 0) {
        this.StateQuery.imagesIds = idsAndSimilarities[0];
        this.StateQuery.imagesSimilarities = idsAndSimilarities[1];
        this.StateQuery.textsIds = idsAndSimilarities[2];
        this.StateQuery.textsSimilarities = idsAndSimilarities[3];
        this.StateQuery.similarityValue = this.similarityValue;
        this.onSelectionsClear();

        let res = await this.api.getState(this.StateQuery);

        const currentNode = this.forceGraph.currentMainNode;
        if (currentNode && currentNode.polygons && currentNode.polygons.length > 0) {
          res = this.polygonFilter.applyPolygonFilter(res, currentNode.polygons);
        }

        if(res.images.similarities.length > 0 && res.texts.similarities.length > 0) {
          this.imageEmbedding.setupImageEmbedding(res.images);
          this.textEmbedding.setupTextEmbedding(res.texts);
          this.combinedEmbedding.setupCombinedEmbedding(res.images, res.texts);
          this.imageGallery.updateImageGallery(res.images);
          this.imageGallery.tabsCounter = 0;
          this.coloLegend.updateColorLegend(res.texts.similarities, res.images.similarities);
          this.wordCloud.updateWordCloud(res.texts);
          this.loadMapWithHeatmap(res.images);

          setTimeout(() => {
            const currentNode = this.forceGraph.currentMainNode;
            if (currentNode && currentNode.polygons && currentNode.polygons.length > 0) {
              console.log(`Loading ${currentNode.polygons.length} polygons for node ${currentNode.id}`);
              const polygonsCopy = JSON.parse(JSON.stringify(currentNode.polygons));
              this.map.loadPolygons(polygonsCopy);
            } else {
              this.map.loadPolygons([]);
            }
          }, 300);
        } else {
          alert('Empty result')
        }
      } else {
        this.resetAll();
      }
    } catch (e) {
      alert(`Loading the data for this node failed: ${describeError(e)}`);
    } finally {
      this.spinner.hide();
    }
  }

  async searchSelected(event: any) {
    this.EmbeddingQuery.queryType = event.queryType;
    this.EmbeddingQuery.imagesQuery = event.imageLabels;
    this.EmbeddingQuery.textsQuery = event.textLabels;
    this.EmbeddingQuery.similarityValue = this.similarityValue;
    this.EmbeddingQuery.from = 'interface';
    this.spinner.show();
    let res = await this.api.getData(this.EmbeddingQuery);

    const currentPolygons = this.map.getCurrentPolygons();
    if (currentPolygons && currentPolygons.length > 0) {
      res = this.polygonFilter.applyPolygonFilter(res, currentPolygons);
    }

    const schema = this.forceGraph.schema;
    
    if (schema.query.length > 0) { this.onSelectionsClear() };
    schema.query.push(this.EmbeddingQuery);
    schema.number_of_queries += 1;
    schema.imagesIds = res.images.labels;
    schema.textsIds = res.texts.labels;
    schema.textsSimilarities = res.texts.similarities;
    schema.imagesSimilarities = res.images.similarities;
    schema.similarityValue = res.images.similarityValue;
    this.forceGraph.schema = schema;
    this.forceGraph.addNode('interface', currentPolygons);
    this.imageEmbedding.setupImageEmbedding(res.images);
    this.textEmbedding.setupTextEmbedding(res.texts);
    this.combinedEmbedding.setupCombinedEmbedding(res.images, res.texts);
    this.imageGallery.updateImageGallery(res.images);
    this.imageGallery.tabsCounter = 0;
    this.coloLegend.updateColorLegend(res.texts.similarities, res.images.similarities);
    this.wordCloud.updateWordCloud(res.texts);
    this.loadMapWithHeatmap(res.images);
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
    this.map.clearSelectionMarkers();
      if(this.imageEmbedding.scatterGl) {
        this.highlightImageGallery([]);
        this.imageEmbedding.selectedPoints = [];
        this.imageEmbedding.highlitedIndices = [];
        this.imageEmbedding.scatterGl.select([]);
        this.imageEmbedding.highlightTexts([]);
      }

      if(this.textEmbedding.scatterGl) {
        this.highlightWordCloud([]);
        this.textEmbedding.selectedPoints = [];
        this.textEmbedding.highlitedIndices = [];
        this.textEmbedding.scatterGl.select([]);
        this.textEmbedding.highlightImages([]);
      }

      if(this.combinedEmbedding.scatterGl) {
        this.highlightWordCloud([]);
        this.combinedEmbedding.selectedPointsImages = [];
        this.combinedEmbedding.selectedPointsTexts = [];
        this.combinedEmbedding.highlightedIndicesImages = [];
        this.combinedEmbedding.highlightedIndicesTexts = [];
        this.combinedEmbedding.scatterGl.select([]);
      }
  }

  highlightCombinedEmbeddingFromText(selectedPoints: any) {
    const modifiedSelectedPoints = selectedPoints.map((value: number) => value + this.combinedEmbedding.cutIndex);
    this.combinedEmbedding.wasCtrlKey = false;
    this.combinedEmbedding.selectedPointsTexts = [];
    this.combinedEmbedding.scatterGl.select([]);
    this.combinedEmbedding.selectedPointsTexts = modifiedSelectedPoints;
    this.combinedEmbedding.scatterGl.select(modifiedSelectedPoints);
    this.combinedEmbedding.wasCtrlKey = true;

    this.combinedEmbedding.colorPoints();
  }

  highlightCombinedEmbeddingFromImage(selectedPoints: any) {
    this.combinedEmbedding.wasCtrlKey = false;
    this.combinedEmbedding.selectedPointsImages = [];
    this.combinedEmbedding.scatterGl.select([]);
    this.combinedEmbedding.selectedPointsImages = selectedPoints;
    this.combinedEmbedding.scatterGl.select(selectedPoints);
    this.combinedEmbedding.wasCtrlKey = true;

    this.combinedEmbedding.colorPoints();
  }

  toggleEmbeddingsFromCombined(obj: any) {
    this.textEmbedding.wasCtrlKey = false;
    this.textEmbedding.selectedPoints = [];
    this.textEmbedding.scatterGl.select([]);
    this.textEmbedding.selectedPoints = obj.selectedPointsTexts;
    this.textEmbedding.scatterGl.select(obj.selectedPointsTexts);
    this.textEmbedding.wasCtrlKey = true;

    this.imageEmbedding.wasCtrlKey = false;
    this.imageEmbedding.selectedPoints = [];
    this.imageEmbedding.scatterGl.select([]);
    this.imageEmbedding.selectedPoints = obj.selectedPointsImages;
    this.imageEmbedding.scatterGl.select(obj.selectedPointsImages);
    this.imageEmbedding.wasCtrlKey = true;
    this.textEmbedding.colorPoints();
    this.imageEmbedding.colorPoints();
  }

  toggleEmbeddingImageFromGallery(obj: any) {
    this.imageEmbedding.toggleImages(obj);
    this.combinedEmbedding.toggleImages(obj);
    this.map.toggleSelectionMarker(obj, true, "imageGallery");
  }

  toggleEmbeddingTextFromCloud(obj: any) {
    this.textEmbedding.toggleText(obj);
    this.combinedEmbedding.toggleTexts(obj);
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
    console.log(args)
    const selectedImagesIds = this.imageEmbedding.selectedPoints;
    const selectedTextsIds = this.textEmbedding.selectedPoints;

    const imageIndices:any = [];
    const textIndices:any = [];
    const imageLabels:string[] = [];
    const textLabels:string[] = [];

    if(selectedImagesIds.length > 0) {
      for(let i = 0; i < selectedImagesIds.length; i++) {
        imageIndices.push(this.imageEmbedding.dataset.metadata[selectedImagesIds[i]].labelIndex);
        imageLabels.push(`dataset/llm/processed/${this.imageEmbedding.dataset.labelPaths[selectedImagesIds[i]][0]}`);
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

  async onBucketCreate(bucketName: string) {
    if (await this.bucket.addBucket(bucketName)) this.modalRef.hide();
  }

  async onSaveState(stateName: string) {
    const name = stateName.trim();
    if (!name) {
      alert('Please enter a name.');
      return;
    }
    if (await this.state.save(name, this.forceGraph.forceGraphData)) this.modalRef.hide();
  }

  onInUseBucketsChange(args: MenuEventArgs) {
    const bucketId = this.bucket.lastRightClick;
    if(args.item.id == 'save') {
      this.bucket.saveBucket(bucketId);
    } else if(args.item.id == 'close') {
      this.bucket.closeBucket(bucketId);
    } else if(args.item.id == 'delete') {
      this.bucket.destroyBucket(bucketId);
    } else {
      this.modalGallery.openModal(this.bucket.getImageUrls(bucketId));
    }
  }

  onSavedBucketsChange(args: MenuEventArgs) {
    const bucketId = this.bucket.lastRightClick;
    if(args.item.id == 'delete') {
      this.bucket.destroyBucket(bucketId);
    } else if(args.item.id == 'open') {
      this.bucket.openUserBucket(bucketId);
    } else {
      this.modalGallery.openModal(this.bucket.getImageUrls(bucketId));
    }
  }

  onSavedStatesChange(args: MenuEventArgs) {
    if(args.item.id == 'delete') {
      this.state.destroyState(this.state.lastRightClick);
    } else if(args.item.id == 'open') {
      this.state.openState(this.state.lastRightClick);
    }
  }

  changeState(state: SavedState) {
    this.forceGraph.openState(state);
  }

  resetAll(from: string = 'node') {
    this.imageEmbedding.clear();
    this.textEmbedding.clear();
    this.combinedEmbedding.clear();
    this.coloLegend.clear();
    this.imageGallery.clear();
    this.wordCloud.clear();
    this.map.clear();
    if(from == 'reset')  this.forceGraph.reset();
  }

  highlightImageGallery(points: any) {
    this.imageGallery.selectImages(points);
    this.map.toggleSelectionMarker(this.imageGallery.selectedIndices, true, "embedding");
  }

  highlightWordCloud(points: any) {
    this.wordCloud.selectTexts(points);
  }

  // files: dataset filenames of the dragged image, or of the whole selection it belongs to
  addImageToBucket(files: string[]) {
    const target = this.bucket.bucketToDrop;
    this.bucket.bucketToDrop = -1;
    if (target !== -1 && files.length) this.bucket.addImages(target, files);
  }

  async infoQuery (event: string) {
    this.InfoQuery['string'] = event;
    const res = await this.api.getInfo(this.InfoQuery);
    this.imageGallery.info = res;
  }

  onEmbeddingToggle(event: any) {
    this.displayCombinedComponent = event;
  }

  loadMapWithHeatmap(imageData: any): void {
    const locations = imageData.locations;
    const imageLabels = imageData.labels;
    
    if (locations.length === 0) {
      this.map.loadMap();
      return;
    }
    
    this.map.loadHeatmapData(locations, imageLabels);
  }
  //`https://storage.googleapis.com/trabalho_final/dataset/llm/processed/${index}.jpg`;

  onPolygonsChanged(polygons: any[]): void {
    this.forceGraph.updateCurrentNodePolygons(polygons);
  }
}
