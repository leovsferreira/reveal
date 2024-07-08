import * as d3 from 'd3';

export class ColorLegend {
    protected min: number = 0;
    protected max: number = 0;
    protected legendDiv: HTMLElement;
    protected svgCanvas: any = null;
    protected width: number = 0;
    protected height: number = 0;
    protected cScale: any = null;
    protected margin: any = {right: 20, left:20, top: 20, bottom: 20}

    constructor(legendDiv: HTMLElement) {
        this.legendDiv = legendDiv;
        this.initSvg();
        this.initScales();
        window.addEventListener('resize', this.render.bind(this));
    }

    initSvg() {
        // dimensions using margins convention
        this.width = this.legendDiv.clientWidth;
        this.height = this.legendDiv.clientHeight;
        // creates the new canvas element
        this.svgCanvas = d3.select(this.legendDiv)
            .append('svg')
            .attr('width', this.legendDiv.clientWidth)
            .attr('height', this.legendDiv.clientHeight + 30);  
    }

    initScales() {
        this.cScale = d3.scaleSequential(d3.interpolateReds);
    }

    updateScales(min: number, max: number) {
        this.cScale.domain([min, max]);
        const defs = this.svgCanvas.append('defs')
        const linearGradient = defs.append('linearGradient')
                                .attr('id', 'linear-gradient')
                                .attr('x1', '0%')
                                .attr('y1', '100%')
                                .attr('x2', '0%')
                                .attr('y2', '0%');

        linearGradient.selectAll('stop')
            .data(this.cScale.ticks().map((t: any, i: any, n: any) => ({ offset: `${100*i/n.length}%`, color: this.cScale(t) })))
            .enter().append('stop')
            .attr('offset', (d: any) => d.offset)
            .attr('stop-color', (d: any) => d.color); 

        this.svgCanvas        
            .append('g')
            .attr('id', 'legend')
            .attr("transform", "translate(" + 0 + " ," + (-12) + ")")
            .append("rect")
            .attr('transform', "translate(" + 0 + " ," + this.margin.top + ")")
            .attr("width", 12)
            .attr("height", this.height - this.margin.top - this.margin.bottom)
            .style('fill', 'url(#linear-gradient)')
                    
            const legendScale = d3.scaleLinear()
                                .domain([min, max])
                                .range([this.height - this.margin.bottom, this.margin.top]);
        
        this.svgCanvas
            .append('g')
            .attr("class", "legend-scale")
            .attr("transform", "translate(" + 0 + " ," + (-12) + ")")
            .call(d3.axisRight(legendScale)
            .ticks(4)
            .tickSize(12))
    
        this.svgCanvas.selectAll(".legend-scale line")
            .attr("stroke", "#fff");
    
        this.svgCanvas.select(".legend-scale path")
            .attr("stroke", "#fff");
    }

    render() {
        if((this.min !== 0) || (this.max !== 0)) {
            this.svgCanvas.remove();
    
            this.initSvg();
            this.initScales();
            this.updateScales(this.min, this.max)
        }
    }
}