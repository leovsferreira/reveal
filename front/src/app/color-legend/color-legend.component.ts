import { Component, OnInit, ElementRef, ViewChild, Output, EventEmitter } from '@angular/core';
import { ColorLegend } from './color-legend';

@Component({
  selector: 'app-color-legend',
  templateUrl: './color-legend.component.html',
  styleUrls: ['./color-legend.component.css']
})
export class ColorLegendComponent implements OnInit {

  private colorLegend: any;

  @ViewChild("colorLegend", { static: true }) private colorLegendDiv!: ElementRef;

  constructor() { }

  ngOnInit(): void {
    this.colorLegend = new ColorLegend(this.colorLegendDiv.nativeElement);
  }

  updateColorLegend(imagesSimilarities: any[], textsSimilarities: any[]) {
    const data = imagesSimilarities.concat(textsSimilarities);
    this.colorLegend.min = Math.min(...data);
    this.colorLegend.max = Math.max(...data);
    this.colorLegend.render();
  }

  clear() {
    this.colorLegendDiv.nativeElement.innerHTML = "";
  }
}
