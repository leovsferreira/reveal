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
    .dagMode('lr')
    .dagLevelDistance(50)
    .nodeRelSize(5)
    .linkDirectionalArrowLength(link => this.highlightLinks.has(link) ? 8 : 3)
    .linkDirectionalArrowColor(link => this.highlightLinks.has(link) ? "#FF0080" : "rgba(0,0,0,0.28)")
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
        //this.highlightLinks.clear();
        this.currentMainNode = node;

        this.embeddingState.emit([this.currentMainNode.imagesIds,
                                  this.currentMainNode.imagesSimilarities, 
                                  this.currentMainNode.textsIds, 
                                  this.currentMainNode.textsSimilarities]);
        //muda o currentMainNode
        /**
               if(node.id == 0) {
          this.sourceNodeId = 0;
          this.currentMainNode = node;
          this.embeddingState.emit(this.currentMainNode.imagesIds);
        } else {
          for(let i = 0; i < this.forceGraphData.links.length; i++) {
            this.highlightLinks.add(this.forceGraphData.links[i]);
            if(this.forceGraphData.links[i].target.id == node.id) {
              this.highlightLinks.add(this.forceGraphData.links[i]);
              this.sourceNodeId = node.id
              this.currentMainNode = node;
              this.embeddingState.emit(this.currentMainNode.imagesIds);
              break;
            };
          }
        */
      }
    })
    /**
    .onNodeDrag(dragNode => {
      this.dragSourceNode = dragNode;
      this.selectedNodes.clear();
    })
    .onNodeDragEnd(() => {
      for (let node of this.forceGraphData.nodes) {
        if (this.dragSourceNode === node) {
          continue;
        }
        // close enough: snap onto node as target for suggested link
        if (this.distance(this.dragSourceNode, node) < this.snapInDistance) {
          this.draggedNodes.add(this.dragSourceNode);
          this.draggedNodes.add(node);
          this.buildNewNode('union', this.draggedNodes);
        }
      }
      this.dragSourceNode = null;
      this.draggedNodes.clear();
      console.log(this.draggedNodes);
    })
     */

    .nodeColor((node: any) => this.setNodeColor(node))
    .nodeCanvasObject((node: any, ctx: any) => this.setNodeShape(node, this.setNodeColor(node), ctx, this.parentNode))
    .nodePointerAreaPaint(this.setNodeShape)
    .onNodeHover(node =>  { this.hoverNode = node || null })
    .d3Force("r", d3.forceRadial(5))
    .nodeLabel((node:any)  =>  this.buildTooltip(node, node.queryType));

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
                                    fy: 0,
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
    /**
      if(nodeId != 0) {
      this.forceGraphData.links.push({source: this.sourceNodeId, target: this.targetNodeId});
      this.highlightLinks.add(this.forceGraphData.links[this.forceGraphData.links.length - 1]);
      this.sourceNodeId = this.targetNodeId;
      this.targetNodeId++;
    }
     */
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
    const idNodeList: any = [];
    this.selectedNodes.forEach((node: any) => {
      //refaz lista somente com nós que não foram deletados
      const indexNode = this.forceGraphData.nodes.indexOf(node);
      if (indexNode > -1) { 
        idNodeList.push(node.id)
        this.forceGraphData.nodes.splice(indexNode, 1);
      }
    });

    //refaz lista somente com links que não foram deletados
    const newLinksList: any = [];
    for(let i = 0; i < this.forceGraphData.links.length; i++) {
      const sourceNodeId = this.forceGraphData.links[i].source;
      const targetNodeId = this.forceGraphData.links[i].target;
      for(let j = 0; j < idNodeList.length; j++) {
        if(sourceNodeId == idNodeList[j] || targetNodeId == idNodeList[j]) {
          this.forceGraphData.links.splice(i, 1);
        }
      }
    }

    this.forceGraphData.links = newLinksList;
    //seta novo dado para renderizar no grafo
    this.forceGraph.graphData(this.forceGraphData);
    this.selectedNodes.clear();
    //seta parent node para o último criado antes de deeletar
    this.parentNode.clear();
    /**
     * TODO:
     * RESETAR TODAS AS VIEW SE TODOS OS NÓS FOREM DELETADOS
     */
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
                                    fy: 0, 
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
    else if(queryType == 1 || queryType == 4) for(let i = 0; i < node.imagesQuery.length; i++) str += `<img style="max-width: 64px; max-height: 64px; margin-left: 12px" src="${node.imagesQuery[i].replace('dataset/arts_images', 'https://storage.googleapis.com/pm2023/art/paintings')}"></img>`;
    else {
      for(let i = 0; i < node.textsQuery.length; i++) str += `${node.textsQuery[i]}<br>`;
      for(let i = 0; i < node.imagesQuery.length; i++) str += `<img style="max-width: 64px; max-height: 64px; margin-left: 12px" src="${node.imagesQuery[i].replace('dataset/arts_images', 'https://storage.googleapis.com/pm2023/art/paintings')}"></img>`;
    }
    return str
  }

  setNodeColor(node: any) {
    if(this.selectedNodes.has(node)) {
      return '#bab0ab'
    } else {
      if(node === this.hoverNode) return '#59a14f';
      else if(node.from === 'interface') return '#f28e2c';
      else if(node.from === 'set') return '#e15759';
      else return '#4e79a7'
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
    [
      () => { 
              if(isParent) {
                ctx.fillStyle = "#edc949"
                ctx.beginPath();
                ctx.arc(x, y, 6, 0, 2 * Math.PI, false);
                ctx.fill();
              }
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(x, y, 5, 0, 2 * Math.PI, false);
              ctx.fill(); 

              ctx.fillStyle = "#FFFFFF"
              ctx.textAlign="center";
              ctx.textBaseline="middle";
              if(iteractionType == 1) {
                ctx.font='6px Roboto';
                ctx.fillText('ꓵ',x,y + 0.6);
              } else if(iteractionType == 2) {
                ctx.font='6px Roboto';
                ctx.fillText('U',x,y + 0.8);
              } else if (iteractionType == 3) {
                ctx.font='12px Roboto';
                ctx.fillText('-',x,y + 0.8);
              }
            }
    ][0]();
  }

  distance = (node1: any, node2: any) => {
    return Math.sqrt(Math.pow(node1.x - node2.x, 2) + Math.pow(node1.y - node2.y, 2));
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
