import { Component, OnInit, ElementRef, ViewChild, Output, EventEmitter } from '@angular/core';
import { GlobalService } from 'src/app/shared/global.service';
import * as ScatterGL from 'scatter-gl';
import * as d3 from 'd3';
import tippy from 'tippy.js';
import { hideAll } from 'tippy.js';

@Component({
  selector: 'app-image-embedding',
  templateUrl: './image-embedding.component.html',
  styleUrls: ['./image-embedding.component.css']
})
export class ImageEmbeddingComponent implements OnInit {
  
  @ViewChild("imageEmbedding", { static: true }) private imageEmbeddingDiv!: ElementRef;

  @Output() imageLinkSelected = new EventEmitter<any>();
  @Output() clearEmbeddingsSelection = new EventEmitter<string>();
  @Output() highlightImageGallery = new EventEmitter<any>();
  @Output() highlightCombinedEmbedding = new EventEmitter<any>();

  private imageEmbedding: any;
  public selectedPoints: any = [];
  private colorScale: any = d3.scaleSequential(d3.interpolateReds);
  private tooltip: any;
  private clientX: number = 0;
  private clientY: number = 0;
  public scatterGl: any = null;
  public dataset: any;
  public wichModeSelected: string = "pan";
  public wasCtrlKey: boolean = false;
  public highlitedIndices: any = [];
  constructor(public global: GlobalService) { }

  ngOnInit(): void { 
    this.imageEmbeddingDiv.nativeElement.addEventListener('mousemove', (e:any) => {
      this.clientX = e.clientX;
      this.clientY = e.clientY;
    });
   }

  setupImageEmbedding(data: any) {
    if(this.imageEmbeddingDiv === undefined) {
      return
    };
    this.selectedPoints = [];
    if(this.imageEmbeddingDiv.nativeElement.innerHTML == '') {
      this.scatterGl = new ScatterGL.ScatterGL(this.imageEmbeddingDiv.nativeElement, {
        onSelect: (points: number[]) => {
          //@ts-ignore
          if(event.ctrlKey ||  this.wichModeSelected == "area") {
            this.wasCtrlKey = true;
            for(let i = 0; i < points.length; i++) {
              if(!this.selectedPoints.includes(points[i])) this.selectedPoints.push(points[i])
            }
            if (points.length === 0) {
              this.selectedPoints = [];
              this.highlitedIndices = [];
            } 
            this.highlightTexts(this.selectedPoints);
            this.scatterGl.select(this.selectedPoints);
            this.highlightImageGallery.emit(this.selectedPoints);
            this.highlightCombinedEmbedding.emit(this.selectedPoints);
          } else {
            if(points.length == 0) {
              this.wasCtrlKey = false;
              this.clearEmbeddingsSelection.emit();
              this.highlightImageGallery.emit([]);
              this.highlightCombinedEmbedding.emit([]);
            };
          }
          this.colorPoints();
        },
        onHover: (point: any) => {
          if(this.tooltip) this.tooltip.destroy();
          if(point !== null && this.imageEmbeddingDiv.nativeElement.innerHTML !== "") {
            const clientX = this.clientX;
            const clientY = this.clientY;
            const imagePath = this.dataset.labelPaths[point][0];
            this.tooltip = tippy(this.imageEmbeddingDiv.nativeElement, {
              theme: 'translucent',
              arrow: false,
              onShow(instance: any) {
                instance.popper.querySelector('.tippy-box').classList.add('transparent-background');
              }
            });
            
            this.tooltip.setProps({
              content: `<img style="max-width: 128px; max-height: 128px;" src="https://storage.googleapis.com/trabalho_final/dataset/images_SIDEWALK/${imagePath}"></img>`,
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

    for(let i = 0; i < data.projection.length; i++) {
      let labelIndex = data.labels[i]
      let label = data.similarities[i];
      dataPoints.push([data.projection[i][0], data.projection[i][1]])
      metadata.push({
        labelIndex,
        label
      });
    }

    this.dataset = new ScatterGL.Dataset(dataPoints, metadata);
    this.dataset["labelPaths"] = data.labelPaths;
    this.dataset["textIds"] = data.textIds;
    this.dataset["similarities"] = data.similarities;
    this.dataset["similarityValue"] = data.similarityValue;
    this.scatterGl.render(this.dataset);
    this.colorPoints();
    this.scatterGl.scatterPlot.resetZoom();
    this.scatterGl.resize();
  };

  clear() {
    this.imageEmbeddingDiv.nativeElement.innerHTML = "";
    hideAll({exclude: this.imageEmbeddingDiv.nativeElement});
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

  highlightTexts(imageIndeces: number[]) {
    this.imageLinkSelected.emit({ids: imageIndeces, from: 'image'});
  }


  toggleImages(obj: any) {
    this.selectedPoints = [];

    if(obj.selected) {
      this.wasCtrlKey = true;
      for(let i = 0; i < obj.labels.length; i++) {
        for(let j = 0; j < this.dataset.metadata.length; j++) {
          if(this.dataset.metadata[j].labelIndex == obj.labels[i])  {
            if(!this.selectedPoints.includes(j)) this.selectedPoints.push(j)
          }
        }
      }
      
      this.scatterGl.select(this.selectedPoints);
      this.highlightTexts(this.selectedPoints);
      this.colorPoints();
    } else {
      this.wasCtrlKey = false;
      this.scatterGl.select([]);
      this.highlightTexts([]);
      this.colorPoints();
    }
  }

  colorPoints() {
    console.log(this.selectedPoints)
    const data = this.dataset['similarities'];
    // @ts-ignore
    this.colorScale.domain( [this.dataset["similarityValue"], Math.max( ...data )] );

    if(this.wasCtrlKey) {
      this.scatterGl.setPointColorer((i: any, selectedIndices: any, hoverIndex: any) => {
        const isSelected = this.selectedPoints.includes(i);
        const isHighlited = this.highlitedIndices.includes(i);
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

  linkImages(ids: any) {
    const data = this.dataset['similarities']
    // @ts-ignore
    this.colorScale.domain( [this.dataset["similarityValue"], Math.max( ...data )] );

    const indices: number[] = [];
    for(let i = 0; i < this.dataset.points.length; i++) {
      for(let j = 0; j < ids.length; j++) {
        if(this.dataset.metadata[i].labelIndex == ids[j]) {
          if(!indices.includes(i)) indices.push(i);
        }
      }
    }

    this.highlitedIndices = indices;

    this.scatterGl.setPointColorer((i: any, selectedIndices: any, hoverIndex: any) => {
      const isSelected = this.selectedPoints.includes(i);
      const isHighlited = this.highlitedIndices.includes(i);
      if(hoverIndex === i) return 'rgba(118, 11, 79, 0.7)'; // hover roxo
      else if(isSelected) return "hsla(120,100%,50%,1)"; // lime
      else if(isHighlited) return "hsl(240, 100%, 50%)"; // blue
      else return this.valToColor(data[i]);
    });
  }
}
