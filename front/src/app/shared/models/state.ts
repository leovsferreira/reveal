import { Bucket } from './bucket';

export interface StateMeta {
    id: number;
    name: string;
    date: string;
    updatedAt: string;
    version: number;
    nodeCount: number;
    sizeBytes: number;
}

export interface SavedLink {
    source: number;
    target: number;
}

export interface SavedNode {
    id: number;
    from?: string;
    iteractionType?: number;
    queryType?: number;
    textsQuery?: string[];
    imagesQuery?: string[];
    similarityValue?: number | number[];
    imagesIds?: number[];
    imagesSimilarities?: number[];
    textsIds?: number[];
    textsSimilarities?: number[];
    locationsData: any[];
    polygons: any[];
}

export interface SavedGraph {
    nodes: SavedNode[];
    links: SavedLink[];
}

export interface SavedState extends StateMeta, SavedGraph {}

export interface UserCollectionResponse {
    uid: string;
    buckets: Bucket[];
    states: StateMeta[];
}
