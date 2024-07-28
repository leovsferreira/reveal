import { Component, OnInit, ElementRef, ViewChild, Output, EventEmitter } from '@angular/core';
import { GlobalService } from 'src/app/shared/global.service';
import * as ScatterGL from 'scatter-gl';
import * as d3 from 'd3';
import tippy from 'tippy.js';
import { hideAll } from 'tippy.js';

@Component({
  selector: 'app-combined-embedding',
  templateUrl: './combined-embedding.component.html',
  styleUrls: ['./combined-embedding.component.css']
})
export class CombinedEmbeddingComponent implements OnInit {

  @ViewChild("combinedEmbedding", { static: true }) private combinedEmbeddingDiv!: ElementRef;

  @Output() imageLinkSelected = new EventEmitter<any>();
  @Output() clearEmbeddingsSelection = new EventEmitter<string>();
  @Output() highlightImageGallery = new EventEmitter<any>();
  @Output() highlightWordCloud = new EventEmitter<any>();
  @Output() toggleEmbeddings = new EventEmitter<any>();

  private imageEmbedding: any;
  public selectedPointsImages: any = [];
  public selectedPointsTexts: any = [];
  private colorScale: any = d3.scaleSequential(d3.interpolateReds);
  private tooltip: any;
  private clientX: number = 0;
  private clientY: number = 0;
  private cutIndex: any = null;
  public scatterGl: any = null;
  public dataset: any;
  public wichModeSelected: string = "pan";
  private wasCtrlKey: boolean = false;
  public highlightedIndicesImages: any = [];
  public highlightedIndicesTexts: any = [];
  constructor(public global: GlobalService) { }

  ngOnInit(): void { 
    this.combinedEmbeddingDiv.nativeElement.addEventListener('mousemove', (e:any) => {
      this.clientX = e.clientX;
      this.clientY = e.clientY;
    });
   }

  setupCombinedEmbedding(imageData: any, textData:any) {
    if(this.combinedEmbeddingDiv === undefined) {
      return
    };
    this.selectedPointsImages = [];
    this.selectedPointsTexts = [];
    if(this.combinedEmbeddingDiv.nativeElement.innerHTML == '') {
      this.scatterGl = new ScatterGL.ScatterGL(this.combinedEmbeddingDiv.nativeElement, {
        onSelect: (points: number[]) => {
          //@ts-ignore
          if(event.ctrlKey ||  this.wichModeSelected == "area") {
            this.wasCtrlKey = true;
            for(let i = 0; i < points.length; i++) {
              if(points[i] < this.cutIndex) {
                if(!this.selectedPointsImages.includes(points[i])) this.selectedPointsImages.push(points[i]);
              } else {
                if(!this.selectedPointsTexts.includes(points[i])) this.selectedPointsTexts.push(points[i]);
              }
            }
            if (points.length === 0) {
              this.selectedPointsImages = [];
              this.selectedPointsTexts = [];
              this.highlightedIndicesImages = [];
              this.highlightedIndicesTexts = [];
            } 
            this.scatterGl.select([...this.selectedPointsImages, ...this.selectedPointsTexts]);
            this.highlightImageGallery.emit(this.selectedPointsImages);
            const modifiedSelectedPointsTexts = this.selectedPointsTexts.map((value: number) => value - this.cutIndex);
            this.highlightWordCloud.emit(modifiedSelectedPointsTexts);
            this.toggleEmbeddings.emit({selectedPointsTexts: modifiedSelectedPointsTexts,
                                        selectedPointsImages: this.selectedPointsImages})
          } else {
            if(points.length == 0) {
              this.wasCtrlKey = false;
              this.clearEmbeddingsSelection.emit();
              this.highlightImageGallery.emit([]);
              this.highlightWordCloud.emit([]);
              this.toggleEmbeddings.emit({selectedPointsTexts: [], selectedPointsImages: []})
            };
          }
          this.colorPoints();
        },
        onHover: (point: any) => {
          //handles image part
          if(this.tooltip) this.tooltip.destroy();
          if(point !== null && this.combinedEmbeddingDiv.nativeElement.innerHTML !== "" && point < this.cutIndex) {
            const clientX = this.clientX;
            const clientY = this.clientY;
            const imagePath = this.dataset.labelPaths[point][0];
            this.tooltip = tippy(this.combinedEmbeddingDiv.nativeElement, {
              theme: 'translucent',
              arrow: false,
              onShow(instance: any) {
                instance.popper.querySelector('.tippy-box').classList.add('transparent-background');
              }
            });
            this.tooltip.setProps({
              content: `<img style="max-width: 128px; max-height: 128px;" src="https://storage.googleapis.com/trabalho_final/dataset/images_USA/${imagePath}"></img>`,
              allowHTML: true,
              getReferenceClientRect: () => ({
                width: 0,
                height: 0,
                top: clientY,
                bottom: clientY,
                left: clientX,
                right: clientX
              })
            })
            
            this.tooltip.show()
          } else if(point !== null && this.combinedEmbeddingDiv.nativeElement.innerHTML !== "" && point >= this.cutIndex) {
            const clientX = this.clientX;
            const clientY = this.clientY;
            const text = this.dataset.labelNames[point - this.cutIndex][0];

            this.tooltip = tippy(this.combinedEmbeddingDiv.nativeElement, {
              theme: 'translucent',
              arrow: false,
              onShow(instance: any) {
                instance.popper.querySelector('.tippy-box').classList.add('transparent-background');
              }
            });

            this.tooltip.setProps({
              content: `<h4 style="color: black; margin-bottom: -3px; padding-left: 40px;">${text}</h4>`,
              allowHTML: true,
              getReferenceClientRect: () => ({
                width: 0,
                height: 0,
                top: clientY,
                bottom: clientY,
                left: clientX,
                right: clientX
              })
            });

            this.tooltip.show();
          }
        },
        renderMode: ScatterGL.RenderMode.POINT,
        showLabelsOnHover: false,
        orbitControls: {
          zoomSpeed: 3,
        },
      });

      window.addEventListener('resize', () => {
        this.scatterGl.resize();
      });
    }
    const dataPoints: ScatterGL.Point2D[] = [];
    const metadata: ScatterGL.PointMetadata[] = [];

    const [imagePoints, imageMetadata]  = this.buildData(imageData);
    // @ts-ignore
    dataPoints.push(...imagePoints);
    // @ts-ignore
    metadata.push(...imageMetadata);

    this.cutIndex = imagePoints.length;

    const [textPoints, textMetadata] = this.buildData(textData);
    console.log(textData)
    // @ts-ignore
    dataPoints.push(...textPoints);
    // @ts-ignore
    metadata.push(...textMetadata);

    this.dataset = new ScatterGL.Dataset(dataPoints, metadata);

    this.dataset["labelPaths"] = imageData.labelPaths;
    this.dataset["textIds"] = imageData.textIds;
    this.dataset["imageIds"] = textData.imageIds;
    this.dataset["labelNames"] = textData.labelNames;
    this.dataset["similarities"] = [...imageData.similarities, ...textData.similarities];
    this.dataset["similarityValue"] = imageData.similarityValue;
    console.log(imageData.similarityValue, textData.similarityValue);

    this.scatterGl.render(this.dataset);
    this.colorPoints();
    this.scatterGl.scatterPlot.resetZoom();
    this.scatterGl.resize();
  };

  buildData(data: any) {
    const pointsList = [];
    const metadataList = [];
    for(let i = 0; i < data.projection.length; i++) {
      let labelIndex = data.labels[i]
      let label = data.similarities[i];
      pointsList.push([data.projection[i][0], data.projection[i][1]])
      metadataList.push({
        labelIndex,
        label
      });
    }
    return [pointsList, metadataList];
  }

  clear() {
    this.combinedEmbeddingDiv.nativeElement.innerHTML = "";
    hideAll({exclude: this.combinedEmbeddingDiv.nativeElement});
  }

  setMode(value: string) {
    if(value == "pan") {
      this.scatterGl.setPanMode();
      this.wichModeSelected = "pan";
    } else {
      this.scatterGl.setSelectMode();
      this.wichModeSelected = "area";
    };
  }

  toggleImages(obj: any) {
    this.selectedPointsImages = [];

    if(obj.selected) {
      this.wasCtrlKey = true;
      for(let i = 0; i < obj.labels.length; i++) {
        for(let j = 0; j < this.dataset.metadata.length; j++) {
          if(this.dataset.metadata[j].labelIndex == obj.labels[i])  {
            if(!this.selectedPointsImages.includes(j)) this.selectedPointsImages.push(j)
          }
        }
      }
      
      this.scatterGl.select(this.selectedPointsImages);
      this.colorPoints();
    } else {
      this.wasCtrlKey = false;
      this.scatterGl.select([]);
      this.colorPoints();
    }
  }
  
  toggleTexts(obj: any) {
    this.selectedPointsTexts = [];
    if(obj.selected) {
      this.wasCtrlKey = true;
      for(let i = 0; i < obj.labels.length; i++) {
        for(let j = 0; j < this.dataset.metadata.length; j++) {
          if(this.dataset.metadata[j].labelIndex == obj.labels[i])  {
            if(!this.selectedPointsTexts.includes(j)) this.selectedPointsTexts.push(j)
          }
        }
      }

      this.scatterGl.select(this.selectedPointsTexts);
      this.colorPoints();
    } else {
      this.wasCtrlKey = false;
      this.scatterGl.select([]);
      this.colorPoints();
    }
  }

  colorPoints() {
    const data = this.dataset['similarities'];
    // @ts-ignore
    this.colorScale.domain( [this.dataset["similarityValue"], Math.max( ...data )] );

    if(this.wasCtrlKey) {
      this.scatterGl.setPointColorer((i: any, selectedIndices: any, hoverIndex: any) => {
        const isSelected = this.selectedPointsImages.includes(i) || this.selectedPointsTexts.includes(i);
        const isHighlited = this.highlightedIndicesImages.includes(i) || this.highlightedIndicesTexts.includes(i);
        if(hoverIndex === i) return 'rgba(118, 11, 79, 0.7)'; // hover roxo
        else if(isSelected) return "hsla(120,100%,50%,1)"; // lime
        else if(isHighlited) return "hsl(240, 100%, 50%)"; // blue
        else return this.valToColor(data[i]);
      });
    } else {
      this.scatterGl.setPointColorer((i: any, selectedIndices: any, hoverIndex: any) => {
        if(hoverIndex === i) return 'rgba(118, 11, 79, 0.7)';
        else return this.valToColor(data[i]);
      });
    }
  }

  valToColor(d: any) {
    if (d === 0) {
      return "#333";
    }
    return this.colorScale(d)
  } 
}
