export interface Bucket {
    id: number;
    name: string;
    date: string;
    updatedAt: string;
    inUse: boolean;
    isSaved: boolean;
    images: string[];
}

export type BucketPatch = Partial<Pick<Bucket, 'name' | 'inUse' | 'isSaved'>>;
