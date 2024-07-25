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

  private imageEmbedding: any;
  public selectedPoints: any = [];
  private colorScale: any = d3.scaleSequential(d3.interpolateReds);
  private tooltip: any;
  private clientX: number = 0;
  private clientY: number = 0;
  public scatterGl: any = null;
  public dataset: any;
  public wichModeSelected: string = "pan";
  private wasCtrlKey: boolean = false;
  public highlitedIndices: any = [];
  constructor() { }

  ngOnInit(): void {
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

}
