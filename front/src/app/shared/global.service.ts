import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class GlobalService {

  constructor() {
    this.init();
  }

  init() {
    /**
     * Esquema usado para o armazenamento dos dados
     */
    const schema = {
      key: "schema",
      number_of_queries: 0,
      query: [],
    };
    this.setGlobal(schema);

    const embedding_link = {
      key: "embedding_link",
      value: "link"
    }
    this.setGlobal(embedding_link);

    const embedding_search_mode = {
      key: "embedding_search_mode",
      value: "simple search"
    }
    this.setGlobal(embedding_search_mode);

    this.setGlobal(embedding_link);
    const main_embedding = {
      key: "main_embedding",
      value: "images"
    }
    this.setGlobal(main_embedding);

    const embedding_selection = {
      key: "embedding_selection",
      value: "pan"
    }
    this.setGlobal(embedding_selection);
  };

  /**
   * Recupera a variavél global gravada na sessão.
   */
  getGlobal(key: string): any {
    // invalid key
    if (key === null) {
      console.log(`getGlobal --> Ivalid key: ${key}`);
      return undefined;
    }

    // item not found
    const value = sessionStorage.getItem(key);
    if (value === null) {
      console.log(`getGlobal --> Key not found: ${key}`);
      return undefined;
    }

    return JSON.parse(value);
  }

  /**
   * Grava a varavél global na sessão.
   */
  setGlobal(object: any) {
    sessionStorage.setItem(object.key, JSON.stringify(object));
  }
}

