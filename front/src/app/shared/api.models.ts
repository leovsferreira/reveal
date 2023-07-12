export class Query {
    textsQuery: string[] = [];
    imagesQuery: string[] = [];
    queryType: number;
    similarityValue: number;
    from: string;

    constructor() {
        this.textsQuery = [];
        this.imagesQuery = [];
        this.queryType = 0;
        this.similarityValue = 0;
        this.from = '';
    }
}

export class StateQuery {
    imagesIds: number[];
    textsIds: number[];
    imagesSimilarities: number[];
    textsSimilarities: number[];
    similarityValue: number;

    constructor() {
        this.imagesIds = [];
        this.textsIds = [];
        this.imagesSimilarities = [];
        this.textsSimilarities = [];
        this.similarityValue = 0;
    }
    
}

export class BuildSetQuery {
    imagesIds: number[];
    textsIds: number[];
    imagesSimilarities: number[];
    textsSimilarities: number[];
    similarityValue: number;
    setType: string;

    constructor() {
        this.imagesIds = [];
        this.textsIds = [];
        this.imagesSimilarities = [];
        this.textsSimilarities = [];
        this.similarityValue = 0;
        this.setType = ''    
    }
}

export class InfoQuery {
    string: string;

    constructor() {
        this.string = "";   
    }
}