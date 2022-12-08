import { Injectable } from '@angular/core';
import { Query, StateQuery, BuildSetQuery } from "./api.models";


@Injectable()
export class ApiService {
    // xhttp urls
    xhttp_url_search: string = 'http://localhost:8081/api/search';
    xhttp_url_state: string = 'http://localhost:8081/api/state';
    xhttp_url_build_set: string = 'http://localhost:8081/api/build_set';

    constructor() { }


    async getData(serverQuery: Query): Promise<any> {
        let query = new Query();
        query['textsQuery'] = serverQuery['textsQuery'];
        query['imagesQuery'] = serverQuery['imagesQuery'];
        query['queryType'] = serverQuery['queryType'];
        query['similarityValue'] = serverQuery['similarityValue'];
        query['from'] = serverQuery['from'];
        // post header
        const headers = {
            'Content-Type': 'application/json',
            'dataType': 'json'
        };
        // Return a new promise.
        const response = await fetch(this.xhttp_url_search, {
            method: 'POST',
            headers,
            body: JSON.stringify(query),
        });

        return await response.json();
    }

    async getState(stateQuery: StateQuery): Promise<any> {
        let query = new StateQuery;
        query["imagesIds"] = stateQuery['imagesIds'];
        query["imagesSimilarities"] = stateQuery['imagesSimilarities'];
        query["textsIds"] = stateQuery['textsIds'];
        query["textsSimilarities"] = stateQuery['textsSimilarities'];
        query["similarityValue"] = stateQuery['similarityValue'];
        // post header
        const headers = {
            'Content-Type': 'application/json',
            'dataType': 'json'
        };
        // Return a new promise.
        const response = await fetch(this.xhttp_url_state, {
            method: 'POST',
            headers,
            body: JSON.stringify(query),
        });
        
        return await response.json();        
    }

    async buildSet(buildSetQuery: BuildSetQuery): Promise<any> {
        let query = new BuildSetQuery;
        query["imagesIds"] = buildSetQuery['imagesIds'];
        query["imagesSimilarities"] = buildSetQuery['imagesSimilarities'];
        query["textsIds"] = buildSetQuery['textsIds'];
        query["textsSimilarities"] = buildSetQuery['textsSimilarities'];
        query["similarityValue"] = buildSetQuery['similarityValue'];
        query["setType"] = buildSetQuery['setType'];
        // post header
        const headers = {
            'Content-Type': 'application/json',
            'dataType': 'json'
        };
        // Return a new promise.
        const response = await fetch(this.xhttp_url_build_set, {
            method: 'POST',
            headers,
            body: JSON.stringify(query),
        });
        
        return await response.json();        
    }
}