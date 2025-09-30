import { Component, OnInit, ElementRef, ViewChild, Output, EventEmitter } from '@angular/core';
import { GlobalService } from 'src/app/shared/global.service';
import * as ScatterGL from 'scatter-gl';
import * as d3 from 'd3';

@Component({
  selector: 'app-text-embedding',
  templateUrl: './text-embedding.component.html',
  styleUrls: ['./text-embedding.component.css']
})
export class TextEmbeddingComponent implements OnInit {
  
  @ViewChild("textEmbedding", { static: true }) private textEmbeddingDiv!: ElementRef;
  @Output() textLinkSelected = new EventEmitter<any>();
  @Output() clearEmbeddingsSelection = new EventEmitter();
  @Output() highlightWordCloud = new EventEmitter();
  @Output() highlightCombinedEmbedding = new EventEmitter<any>();
  
  private textEmbedding: any;
  private colorScale: any = d3.scaleSequential(d3.interpolateReds);
  public scatterGl: any = null;
  public dataset: any;
  public wichModeSelected: string = "pan";
  public selectedPoints: any = [];
  public wasCtrlKey: boolean = false;
  public highlitedIndices: any = [];
  constructor(public global: GlobalService) { }

  ngOnInit(): void {  }

  setupTextEmbedding(data: any) {
    if(this.textEmbeddingDiv === undefined) {
      return
    };
    this.selectedPoints = [];
    if(this.textEmbeddingDiv.nativeElement.innerHTML == '') {
      this.scatterGl = new ScatterGL.ScatterGL(this.textEmbeddingDiv.nativeElement, {
        onSelect: (points: number[]) => {
          //@ts-ignore
          if(event.ctrlKey ||  this.wichModeSelected == "area") {
            this.wasCtrlKey = true;
            for(let i = 0; i < points.length; i++) {
              if(!this.selectedPoints.includes(points[i])) this.selectedPoints.push(points[i])
            }
            if (points.length === 0) {
              console.log('nothing selected');
              this.selectedPoints = [];
              this.highlitedIndices = [];
            } 
            this.highlightImages(this.selectedPoints);
            this.scatterGl.select(this.selectedPoints)
            this.highlightWordCloud.emit(this.selectedPoints);
            this.highlightCombinedEmbedding.emit(this.selectedPoints);
          } else {
            if(points.length == 0) {
              this.wasCtrlKey = false;
              this.clearEmbeddingsSelection.emit();
              this.highlightWordCloud.emit([])
              this.highlightCombinedEmbedding.emit([]);
            };
          }
          this.colorPoints();
        },
        renderMode: ScatterGL.RenderMode.POINT,
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
      let label = data.labelNames[i]
      dataPoints.push([data.projection[i][0], data.projection[i][1]])
      metadata.push({
        labelIndex,
        label
      });
    }
    this.dataset = new ScatterGL.Dataset(dataPoints, metadata);
    this.dataset["imageIds"] = data.imageIds;
    this.dataset["similarities"] = data.similarities;
    this.dataset["similarityValue"] = data.similarityValue;
    this.scatterGl.render(this.dataset);
    this.colorPoints();
    this.scatterGl.scatterPlot.resetZoom();
    this.scatterGl.resize();
  };

  clear() {
    this.textEmbeddingDiv.nativeElement.innerHTML = '';
  }

  setMode(value: string) {
    if(value == "pan") {
      this.scatterGl.setPanMode();
      this.wichModeSelected = "pan";
    } else {
      this.scatterGl.setSelectMode();
      this.wichModeSelected = "area";
    };
    this.clearEmbeddingsSelection.emit();
  }

  highlightImages(textIndeces: number[]) {
    this.textLinkSelected.emit({ids: textIndeces, from: 'text'});
  }

  selectSearchedImages(labels:string[]) {
    const indicesToSelect: number[] = [];
    for(let i = 0; i < labels.length; i++) {
      for(let j = 0; j < this.dataset.metadata.length; j++) {
        if(this.dataset.metadata[j].label[0] == labels[i]) indicesToSelect.push(j)
      }
    }
    this.scatterGl.select(indicesToSelect);
  }

  colorPoints() {
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

  linkTexts(ids: any) {
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

  toggleText(obj: any) {
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

      this.highlightImages(this.selectedPoints);
      this.scatterGl.select(this.selectedPoints);
      this.colorPoints();
      console.log(this.selectedPoints)
    } else {
      this.wasCtrlKey = false;
      this.scatterGl.select([]);
      this.highlightImages([]);
      this.colorPoints();
    }
  }
}