import { Injectable } from '@angular/core';
import { SavedGraph, SavedLink, SavedNode, SavedState, StateMeta } from '../models/state';
import { UserDataApiService } from './user-data-api.service';

const NODE_FIELDS = ['id', 'from', 'iteractionType', 'queryType', 'textsQuery', 'imagesQuery', 'similarityValue',
                     'imagesIds', 'imagesSimilarities', 'textsIds', 'textsSimilarities'] as const;

// tolerant of JSON-string polygons
export function parsePolygons(p: unknown): any[] {
  if (Array.isArray(p)) return p;
  if (typeof p === 'string') {
    try {
      const v = JSON.parse(p);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return [];
}

// copies only the persisted node fields, so the live force-graph nodes are never mutated
export function toSavedGraph(g: { nodes: any[]; links: any[] }): SavedGraph {
  const nodes = g.nodes.map(n => {
    const o: any = { locationsData: [], polygons: parsePolygons(n.polygons) };
    for (const k of NODE_FIELDS) if (n[k] !== undefined) o[k] = n[k];
    return o as SavedNode;
  });
  const idOf = (x: any) => (x !== null && typeof x === 'object' ? x.id : x);
  const links: SavedLink[] = g.links.map(l => ({ source: idOf(l.source), target: idOf(l.target) }));
  return { nodes, links };
}

@Injectable({
  providedIn: 'root'
})
export class StateService {

  constructor(private api: UserDataApiService) { }

  list(): Promise<StateMeta[]> {
    return this.api.request<{ states: StateMeta[] }>('GET', '/states').then(r => r.states);
  }

  async load(id: number): Promise<SavedState> {
    const s = await this.api.request<SavedState>('GET', `/states/${id}`);
    s.nodes = s.nodes.map(n => ({ ...n, polygons: parsePolygons(n.polygons) }));
    return s;
  }

  create(name: string, graph: { nodes: any[]; links: any[] }): Promise<StateMeta> {
    return this.api.request<StateMeta>('POST', '/states', { name, ...toSavedGraph(graph) });
  }

  replace(id: number, graph: { nodes: any[]; links: any[] }, expectedVersion?: number): Promise<StateMeta> {
    return this.api.request<StateMeta>('PUT', `/states/${id}`, { ...toSavedGraph(graph), expectedVersion });
  }

  remove(id: number): Promise<void> {
    return this.api.request<void>('DELETE', `/states/${id}`);
  }
}
