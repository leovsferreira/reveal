import { Component, OnInit, ElementRef, ViewChild, Output, EventEmitter } from '@angular/core';
import { GlobalService } from 'src/app/shared/global.service';
import { ApiService } from 'src/app/shared/api.service';
import { BuildSetQuery } from '../shared/api.models';
import ForceGraph from 'force-graph';
import * as d3 from "d3";
import { thresholdFreedmanDiaconis } from 'd3';

@Component({
  selector: 'app-force-graph',
  templateUrl: './force-graph.component.html',
  styleUrls: ['./force-graph.component.css']
})
export class ForceGraphComponent implements OnInit {

  @ViewChild("forceGraph", { static: true }) private forceGraphDiv!: ElementRef;
  
  @Output() embeddingState = new EventEmitter<any>();
  @Output() resetAll = new EventEmitter();

  public forceGraph: any;
  public forceGraphData: any = {nodes: [], links: []};
  private nodeId: number = 0;
  private targetNodeId: number = 1;
  private sourceNodeId: any = 0;
  private hoverNode: any = null;
  private selectedNodes = new Set();
  private draggedNodes = new Set();
  private parentNode = new Set();
  private highlightLinks = new Set();
  private currentMainNode: any = 0;
  private snapInDistance: number = 10;
  private dragSourceNode:any = null;
  public BuildSetQuery: BuildSetQuery = new BuildSetQuery();
  public schema: any = {number_of_queries: 0, query: [], imagesIds: [], similarities: []};
  
  constructor(public global: GlobalService, public api: ApiService) { }

  ngOnInit(): void {  }

  ngAfterViewInit(): void {
    this.setupForceGraph();
    const tooltip = <HTMLElement> window.document.querySelector('.graph-tooltip');
    tooltip.style.zIndex = '99';
  }

  setupForceGraph() {

    this.forceGraph = ForceGraph()(this.forceGraphDiv.nativeElement).graphData(this.forceGraphData)
    .autoPauseRedraw(false)
    .dagMode('lr') // Left-to-right DAG layout
    .dagLevelDistance(80)
    .d3Force('collide', d3.forceCollide(50)) // Add collision force to avoid nodes being too close
    .nodeRelSize(5)
    .linkDirectionalArrowLength(4)
    .linkDirectionalArrowColor("#FF0080")
    .warmupTicks(300) 
    .cooldownTicks(0)
    .onNodeClick((node, event) => {
      if (event.ctrlKey || event.shiftKey || event.altKey) { 
        // multi seleção
        if(this.selectedNodes.has(node)) {
          this.selectedNodes.delete(node)
        } else {
          if(this.selectedNodes.size == 2) {
            const sets = Array.from(this.selectedNodes);
            sets[1] = node;
            this.selectedNodes = new Set(sets);
          } else {
            this.selectedNodes.add(node);
          }
        }
      } else {
        this.parentNode.clear();
        this.parentNode.add(node);
        
        this.currentMainNode = node;

        this.embeddingState.emit([this.currentMainNode.imagesIds,
                                  this.currentMainNode.imagesSimilarities, 
                                  this.currentMainNode.textsIds, 
                                  this.currentMainNode.textsSimilarities]);
      }
    })

    .nodeColor((node: any) => this.setNodeColor(node))
    .nodeCanvasObject((node: any, ctx: any) => this.setNodeShape(node, this.setNodeColor(node), ctx, this.parentNode))
    .nodePointerAreaPaint((node: any, color: any, ctx: any) => this.setNodeShape(node, color, ctx, this.parentNode))
    .onNodeHover(node =>  { this.hoverNode = node || null })
    .nodeLabel((node:any)  =>  this.buildTooltip(node, node.queryType))
    .enableNodeDrag(false);

    this.setSize();

    window.addEventListener('resize', () => {
     this.setSize();
    });
  }

  addNode(from: string) {
    const schema = this.schema;
    const nodeId = this.nodeId;
    const textsQuery = schema.query[schema.query.length - 1].textsQuery;
    const imagesQuery = schema.query[schema.query.length - 1].imagesQuery;
    const queryType = schema.query[schema.query.length - 1].queryType;
    const similarityValue = schema.query[schema.query.length - 1].similarityValue;
    const imagesSimilarities = schema.imagesSimilarities;
    const imagesIds = schema.imagesIds;
    const textsIds = schema.textsIds;
    const textsSimilarities = schema.textsSimilarities;
    this.forceGraphData.nodes.push({id: nodeId,
                                    textsQuery: textsQuery,
                                    imagesQuery: imagesQuery,
                                    queryType: queryType,
                                    similarityValue: similarityValue,
                                    imagesIds: imagesIds,
                                    imagesSimilarities: imagesSimilarities,
                                    textsIds: textsIds,
                                    textsSimilarities: textsSimilarities,
                                    iteractionType: 0,
                                    from: from
                                  });
    //se foi interação de interface, manter no mesmo ramo
    if(from == 'interface') {
      if (this.parentNode.size !== 0) {
        this.forceGraphData.links.push({source: this.parentNode.values().next().value.id, target: nodeId})
      }
    }
    this.parentNode.clear();
    this.parentNode.add(this.forceGraphData.nodes[this.forceGraphData.nodes.length - 1]);

    this.forceGraph.graphData(this.forceGraphData);
    this.nodeId  +=  1;
  }

  reset() {
    //reseta quando clicado no botão de reset estado
    this.nodeId = 0;
    this.schema.number_of_queries = 0;
    this.selectedNodes.clear();
    this.parentNode.clear();
    this.currentMainNode = 0;
    this.forceGraphData = {nodes: [], links: []};
    this.forceGraph.graphData({nodes: [], links: []});
  }

  removeNode() {
    if(this.selectedNodes.size > 1) {
      alert("Para deletar, selecione apenas um nó");
    } else {
      const idNodeList: any = [];
      this.selectedNodes.forEach((node: any) => {
        //refaz lista somente com nós que não foram deletados
        const indexNode = this.forceGraphData.nodes.indexOf(node);
        if (indexNode > -1) { 
          idNodeList.push(node.id)
          this.forceGraphData.nodes.splice(indexNode, 1);
        }
      });
      console.log(idNodeList)
      console.log(this.forceGraphData.links)
      //refaz lista somente com links que não foram deletados
      const newLinksList: any = [];
      for(let i = 0; i < idNodeList.length; i++) {

        for(let j = 0;j < this.forceGraphData.links.length;j++) {
          const sourceNodeId = this.forceGraphData.links[j].source.id;
          const targetNodeId = this.forceGraphData.links[j].target.id;
          if(sourceNodeId !== idNodeList[i] && targetNodeId !== idNodeList[i]) {
            newLinksList.push(this.forceGraphData.links[j])
          }
        }
      }

      this.forceGraphData.links = newLinksList;
      console.log(this.forceGraphData.links)
      //seta novo dado para renderizar no grafo
      this.forceGraph.graphData(this.forceGraphData);
      this.selectedNodes.clear();
      //seta parent node para o último criado antes de deeletar
      this.parentNode.clear();

      if(this.forceGraphData.nodes.length > 0) {
        const node = this.forceGraphData.nodes[this.forceGraphData.nodes.length - 1]
        this.parentNode.add(node);
        //muda o estado da interface para ultimo no criado antes de deletar
        this.currentMainNode = node;
        this.embeddingState.emit([this.currentMainNode.imagesIds,
                                  this.currentMainNode.imagesSimilarities, 
                                  this.currentMainNode.textsIds, 
                                  this.currentMainNode.textsSimilarities]);
      } else {
        this.embeddingState.emit([]);
      };
    }
  }

  buildNewNode(type: string, nodes: any) {
    //adiciona informações
    const imagesIds:any = [];
    const textsIds:any = [];
    const imagesSimilarities: any = [];
    const textsSimilarities: any = [];
    const textsQuery:any = [];
    const imagesQuery:any = [];
    const similarityValue:any = [];
    const queryTypes:any = [];
    let queryType;

    if(type == 'intersection' || type == 'union') {
      nodes.forEach((selectedNode: any) => {
        imagesIds.push(...selectedNode.imagesIds);
        textsIds.push(...selectedNode.textsIds);
        imagesSimilarities.push(...selectedNode.imagesSimilarities);
        textsSimilarities.push(...selectedNode.textsSimilarities);
        textsQuery.push(...selectedNode.textsQuery);
        imagesQuery.push(...selectedNode.imagesQuery);
        similarityValue.push(selectedNode.similarityValue);
        queryTypes.push(selectedNode.queryType);
      });
    } else {
      nodes.forEach((selectedNode: any) => {
        textsQuery.push(...selectedNode.textsQuery);
        imagesQuery.push(...selectedNode.imagesQuery);
        similarityValue.push(selectedNode.similarityValue);
        queryTypes.push(selectedNode.queryType);
      });
      

      const firstNode = [...nodes][0]
      const secondNode = [...nodes][1]

      const diffImagesIds: any = [] 
      for(let i  = 0; i < firstNode.imagesIds.length; i++) {
        if(!secondNode.imagesIds.includes(firstNode.imagesIds[i])) diffImagesIds.push(firstNode.imagesIds[i])
      }

      for(let i = 0; i < diffImagesIds.length; i++) {
        imagesSimilarities.push(firstNode.imagesSimilarities[firstNode.imagesIds.indexOf(diffImagesIds[i])]);
        imagesIds.push(diffImagesIds[i]);
      }
      
      const diffTextsIds: any = [] 
      for(let i  = 0; i < firstNode.textsIds.length; i++) {
        if(!secondNode.textsIds.includes(firstNode.textsIds[i])) diffTextsIds.push(firstNode.textsIds[i])
      }
      for(let i = 0; i < diffTextsIds.length; i++) {
        textsSimilarities.push(firstNode.textsSimilarities[firstNode.textsIds.indexOf(diffTextsIds[i])]);
        textsIds.push(diffTextsIds[i]);
      }
    }
    //seta queryType
    if(queryTypes[0] == queryTypes[1]) queryType = queryTypes[0];
    else queryType = 2;
    const nodeId = this.nodeId;
    let iteractionType = 0;
    
    this.BuildSetQuery.imagesIds = imagesIds;
    this.BuildSetQuery.textsIds = textsIds;
    this.BuildSetQuery.imagesSimilarities = imagesSimilarities;
    this.BuildSetQuery.textsSimilarities = textsSimilarities;

    if(type == 'intersection') {
      iteractionType = 1;
      this.BuildSetQuery.setType = 'intersection'
    } else if (type == 'union') {
      iteractionType = 2;
      this.BuildSetQuery.setType = 'union'
    } else {
      iteractionType = 3;
      this.BuildSetQuery.setType = 'difference'
    }
    this.requestNewSet(nodeId, textsQuery, imagesQuery, queryType, similarityValue, iteractionType);
  }

  async requestNewSet(nodeId: number, textsQuery: any, imagesQuery: any, queryType: any, similarityValue: any, iteractionType: number) {
    const res = await this.api.buildSet(this.BuildSetQuery);
    if(similarityValue.length && similarityValue.length > 1) {
      similarityValue = similarityValue.flat();
    }
    this.createLinks(res, nodeId, textsQuery, imagesQuery, queryType, similarityValue, iteractionType);
  }

  async createLinks(res: any, nodeId: number, textsQuery: any, imagesQuery: any, queryType: any, similarityValue: any, iteractionType: number) {
    const imagesIds = res.images.labels;
    const textsIds = res.texts.labels;
    const imagesSimilarities = res.images.similarities;
    const textsSimilarities = res.texts.similarities;
    this.embeddingState.emit([imagesIds,
                              imagesSimilarities,
                              textsIds,
                              textsSimilarities]);
    //adiciona nó ao dado
    this.forceGraphData.nodes.push({id: nodeId,
                                    textsQuery: textsQuery, 
                                    imagesQuery: imagesQuery, 
                                    queryType: queryType, 
                                    similarityValue: similarityValue, 
                                    imagesIds: imagesIds,
                                    textsIds: textsIds,
                                    imagesSimilarities:  imagesSimilarities,
                                    textsSimilarities: textsSimilarities, 
                                    iteractionType: iteractionType,
                                    from: 'set'
                                  });
    
    //seta como novo parent node
    this.parentNode.clear();
    this.parentNode.add(this.forceGraphData.nodes[this.forceGraphData.nodes.length - 1]);
    //adiciona links dos nos selecionados ao novo nó
    this.selectedNodes.forEach((selectedNode: any) => {
      this.forceGraphData.links.push({source: selectedNode.id, target: nodeId});
    });
    //atualiza o grafo  com novo nó
    this.forceGraph.graphData(this.forceGraphData);
    this.nodeId += 1;
    this.selectedNodes.clear();
  }

  openState(state: any) {
    this.resetAll.emit();
    state.nodes.forEach((node: any) => {
      node.fy = undefined;
    });
    this.forceGraphData = {nodes: state.nodes, links: state.links};
    this.forceGraph.graphData({nodes: state.nodes, links: state.links});
    //se o no salvo for vazio, seta vazio nas visualizacoes
    if(state.nodes.length > 0) {
      const node = state.nodes[state.nodes.length - 1];
      const lastNodeId = state.nodes[state.nodes.length - 1].id + 1
      this.schema.number_of_queries = lastNodeId;
      this.nodeId = lastNodeId;
      this.parentNode.add(node)
      this.currentMainNode = node;

      this.embeddingState.emit([this.currentMainNode.imagesIds,
        this.currentMainNode.imagesSimilarities, 
        this.currentMainNode.textsIds, 
        this.currentMainNode.textsSimilarities]);
    } else {
      this.schema.number_of_queries = 0;
      this.nodeId = 0;
      this.embeddingState.emit([]);
    }
  }

  setSize() {
    const width = this.forceGraphDiv.nativeElement.clientWidth;
    const height = this.forceGraphDiv.nativeElement.clientHeight;
    this.forceGraph.width([width]);
    this.forceGraph.height([height]);
  }

  buildTooltip(node: any, queryType: number) {
    console.log(node.imagesQuery)
    let str = `<b>Query num ${node.id + 1}:</b><br>`;
    if(queryType == 0) for(let i = 0; i < node.textsQuery.length; i++) str += `${node.textsQuery[i]}<br>`;
    else if(queryType == 1 || queryType == 4) for(let i = 0; i < node.imagesQuery.length; i++) str += `<img style="max-width: 64px; max-height: 64px; margin-left: 12px" src="${node.imagesQuery[i].replace('dataset/images_USA/', 'https://storage.googleapis.com/trabalho_final/dataset/images_USA/')}"></img>`;
    else {
      for(let i = 0; i < node.textsQuery.length; i++) str += `${node.textsQuery[i]}<br>`;
      for(let i = 0; i < node.imagesQuery.length; i++) str += `<img style="max-width: 64px; max-height: 64px; margin-left: 12px" src="${node.imagesQuery[i].replace('dataset/images_USA/', 'https://storage.googleapis.com/trabalho_final/dataset/images_USA/')}"></img>`;
    }
    return str
  }

  setNodeColor(node: any) {
    if(this.selectedNodes.has(node)) {
      return '#ffcc00'
    } else {
      if(node.from === 'interface') return '#7c97a9';
      else if(node.from === 'set') return '#977ca9';
      else return '#97a97c'
    }
  }
 
  setNodeShape(node: any, color: any, ctx: any, parentNode: any) {
    let isParent = false;
    if(typeof(parentNode) !== 'number') {
      if(parentNode.has(node)) {
        isParent = true;
      }
    }
    const x = node.x;
    const y = node.y;
    const iteractionType = node.iteractionType;
    const radius = this.selectedNodes.has(node) || node === this.hoverNode ? 8 : 6; // Adjust radius
    [
      () => { 
              // Draw the square with interaction type inside it, only if the node was originated by a set operation
              if (iteractionType !== 0) {
                const width = 13; // Square width
                const height = 13; // Square height
                const offset = 2; // Offset to make the square touch the node
                const roundedRadius = 2; // Radius for rounded corners

                const rectX = x + radius - offset;
                const rectY = y + radius - offset;

                // Draw the square with white background and thin black border with rounded corners
                ctx.fillStyle = "#FFFFFF";
                ctx.strokeStyle = "#000000";
                ctx.lineWidth = 0.5; // Thinner border
                ctx.beginPath();
                ctx.moveTo(rectX + roundedRadius, rectY);
                ctx.lineTo(rectX + width - roundedRadius, rectY);
                ctx.arcTo(rectX + width, rectY, rectX + width, rectY + roundedRadius, roundedRadius);
                ctx.lineTo(rectX + width, rectY + height - roundedRadius);
                ctx.arcTo(rectX + width, rectY + height, rectX + width - roundedRadius, rectY + height, roundedRadius);
                ctx.lineTo(rectX + roundedRadius, rectY + height);
                ctx.arcTo(rectX, rectY + height, rectX, rectY + height - roundedRadius, roundedRadius);
                ctx.lineTo(rectX, rectY + roundedRadius);
                ctx.arcTo(rectX, rectY, rectX + roundedRadius, rectY, roundedRadius);
                ctx.fill();
                ctx.stroke();

                // Draw the interaction type symbol inside the square in black
                ctx.fillStyle = 'black';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = '9px Roboto'; // Adjusted font size for interaction type
                if (iteractionType == 1) {
                  ctx.fillText('ꓵ', rectX + width / 2, rectY + height / 2);
                } else if (iteractionType == 2) {
                  ctx.fillText('U', rectX + width / 2, rectY + height / 2);
                } else if (iteractionType == 3) {
                  ctx.fillText('-', rectX + width / 2, rectY + height / 2);
                }
              }
              // Draw a red circle around the node if it is a parent
              if (isParent) {
                ctx.fillStyle = "#ff0000";
                ctx.beginPath();
                ctx.arc(x, y, radius + 1, 0, 2 * Math.PI, false);
                ctx.fill();
              }

              // Draw the node
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(x, y, radius, 0, 2 * Math.PI, false); // Use the adjusted radius
              ctx.fill();

              // Draw the node ID inside the node
              ctx.fillStyle = "#FFFFFF";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.font = '6px Roboto'; // Increased font size
              ctx.fillText(node.id + 1, x, y);
      }
    ][0]();
  }

  distance = (node1: any, node2: any) => {
    return Math.sqrt(Math.pow(node1.x - node2.x, 2) + Math.pow(node2.y - node2.y, 2));
  };

  chooseSetOperations(type: any) {
    if(type == 'un') {
      if(this.selectedNodes.size > 1) {
        this.buildNewNode('union', this.selectedNodes);
      } else {
        console.log('precisa de pelo menos 2 nós selecionados para uniao')
        this.selectedNodes.clear();
      }
    } else if(type == 'in') {
      if(this.selectedNodes.size > 1) {
        this.buildNewNode('intersection', this.selectedNodes);
      } else {
        console.log('precisa de pelo menos 2 nós selecionados para intersecao')
        this.selectedNodes.clear();
      }
    } else if(type == 'del') {
      if(this.selectedNodes.size > 0) {
        this.removeNode();
      } else {
        console.log('precisa de pelo menos 1 nó selecionado para remoção');
        this.selectedNodes.clear();
      }
    } else {
      console.log(this.selectedNodes.size)
      if(this.selectedNodes.size == 2) {
        this.buildNewNode('difference', this.selectedNodes);
      } else {
        console.log('precisa de exatamente 2 nós para diferença')
        this.selectedNodes.clear();
      }
    }
  }
}
