import { Component, OnInit, ElementRef, ViewChild, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import * as D3 from 'd3';
declare let d3: any;

@Component({
  selector: 'app-word-cloud',
  templateUrl: './word-cloud.component.html',
  styleUrls: ['./word-cloud.component.css']
})
export class WordCloudComponent implements OnInit {

  public data: any[] = [];
  public viewHasInit: boolean =  false;
  public width: number = 0;
  public height: number = 0;
  public selectedIndices: any = [];
  @ViewChild("wordCloud", { static: true }) private wordCloudDiv!: ElementRef;

  @Output() toggleText = new EventEmitter<any>();

  constructor(private cdRef : ChangeDetectorRef) { }

  ngOnInit(): void { }

  ngAfterViewInit(): void {
    this.width =  this.wordCloudDiv.nativeElement.clientWidth;
    this.height =  this.wordCloudDiv.nativeElement.clientHeight;

    this.viewHasInit = true;
    this.cdRef.detectChanges();
  }

  updateWordCloud(data: any) {
    this.selectedIndices = [];
    const words: any = [];
    const topTwenty: any = [];
    if(data.numberOfTexts >= 20) {
      for(let i = 0; i < 20; i++) {
        topTwenty.push(data.similarities[i])
      }
    } else {
      for(let i = 0; i < data.numberOfTexts; i++) {
        topTwenty.push(data.similarities[i])
      }
    }

    const topSimilarities = this.normalize(topTwenty)
    let counter = 0;
    for(let i = 0; i < topSimilarities.length; i++) {
      words.push({ text: data.labelNames[i][0], size: 20 + topSimilarities[i] * 60, id: data.labels[i]})
      counter++;
      if(counter == 10) counter = 0;
    }
    this.data = words;
    D3.select("#d3-cloud").select("g").remove(); 
    this.buildWordCloud();
  }

  normalize(similarities: any) {
    const min = Math.min(...similarities);
    const max = Math.max(...similarities)
    const normalizedData = []
    for(let i = 0; i < similarities.length; i++) {
      normalizedData.push((similarities[i] - min) / (max - min))
    }
    return normalizedData;
  }

  onClick(event: any, id: any) {
    if(event.ctrlKey) {
      if(this.selectedIndices.includes(id)) {
        D3.select(`#word-cloud-${id}`).style("fill", "#7F7F7F"); 
        const index = this.selectedIndices.indexOf(id);
        if (index !== -1) {
          this.selectedIndices.splice(index, 1);
        }
      } else {
        D3.select(`#word-cloud-${id}`).style("fill", "#00FF00")
        this.selectedIndices.push(id);
      }
      this.toggleText.emit({labels: this.selectedIndices, selected: true});
    }
  }

  buildWordCloud() {
    d3.layout.cloud()
    .size([this.width, this.height])
    .words(this.data)
    .rotate(() => 0)
    .font("Impact")
    .fontSize((d: any) => d.size)
    .on('end', () => {
      this.drawWordCloud(this.data);
    })
    .start();
  }

  drawWordCloud(data: any) {
    D3.select("#d3-cloud")
    .append("g")
    .attr("transform", "translate(" + this.width / 2 + "," + this.height / 2 + ")")
    .selectAll('text')
    .data(data)
    .enter()
    .append('text')
    .text((d:any) => d.text)
    .attr("id",  (d:any) => `word-cloud-${d.id}`)
    .on("click", (e: any, d: any) => this.onClick(e, d.id))
    .style('font-size', (d: any) => d.size + 'px')
    .style("font-family", "Impact")
    .style('fill', (d: any, i: any) => "#7F7F7F")
    .attr('text-anchor', 'middle')
    .attr('transform', (d:any) => 'translate(' + [d.x, d.y] + ')rotate(' + d.rotate + ')')
    .attr('cursor', 'pointer')
  }

  selectTexts(points: any) {
    this.selectedIndices = [];
    if(points.length > 0) {
      for(let i = 0; i < points.length; i++) {
        D3.select(`#word-cloud-${this.data[points[i]].id}`).style("fill", "#7F7F7F"); 
      }
  
      for(let i = 0; i < points.length; i++) {
        D3.select(`#word-cloud-${this.data[points[i]].id}`).style("fill", "#00FF00"); 
        this.selectedIndices.push(this.data[points[i]].id)
      }
    } else {
      for(let i = 0; i < this.data.length; i++) {
        D3.select(`#word-cloud-${this.data[i].id}`).style("fill", "#7F7F7F"); 
      }
    }
  }

  clear() {
    this.selectedIndices = [];
    this.data = [];
    D3.select("#d3-cloud").select("g").remove(); 
  }
}