from enum import unique
from flask import Flask, jsonify, request
import clip
from itsdangerous import exc
import torch
import pandas as pd
import numpy as np
from flask_cors import CORS
import base64
from PIL import Image
import PIL
from io import BytesIO
import math
from utils import calculate_similarities, get_indices, build_tensors, normalize_similarities
import json
from itertools import chain

# declare constants
HOST = '0.0.0.0'
PORT = 8081
# initialize flask application
app = Flask(__name__)
CORS(app)
@app.route('/api/search', methods=['POST'])
def search():
    # get parameters from request
    parameters = request.get_json()
    # reading datasets
    images = pd.read_csv('images.csv', index_col="Unnamed: 0")
    unique_texts = pd.read_csv('unique_texts.csv', index_col="Unnamed: 0")
    # load image embedding
    image_embedding = torch.load('image_tensors.pt', map_location=torch.device('cpu'))
    # load word embedding
    word_embedding = torch.load('word_tensors.pt', map_location=torch.device('cpu'))

    query_type = parameters['queryType']
    similarity_value = parameters['similarityValue'] / 100
    #constroi os tensores baseado nos dados provenientes da query
    tensors = []
    if query_type == 2:
        texts_tensors, images_tensors = build_tensors(parameters, query_type)
        tensors = [texts_tensors, images_tensors]
    else:
        tensors = build_tensors(parameters, query_type)
    #calcula similaridades individualmente para imagens e para textos
    similarities = calculate_similarities(tensors, image_embedding, word_embedding, query_type)
    #normaliza a similaridade dos textos caso tenha texto na query
    similarities_im = []
    similarities_wo = []
    for i in range(len(similarities)):
        similarities[i] = normalize_similarities(similarities[i])
    if query_type == 2:
        similarities_im = [similarities[0], similarities[1]]
        similarities_wo = [similarities[2], similarities[3]]
    else:
        similarities_im = [similarities[0]]
        similarities_wo = [similarities[1]]
    #if intersection is selected
    """
    if 'dataHistory' in parameters:
        print("entrou na interseção")
        indices = []
        indices = get_indices_and_values(image_embedding, query, query_type, similarity_value)
        data_history = parameters['dataHistory']
        for i in range(len(data_history)):
            query_type = data_history[i]["queryType"]
            similarity_value = data_history[i]["similarityValue"]
            query = choose_query_based_on_origin(data_history[i], query_type, images)
            indices = set(indices).intersection(get_indices_and_values(image_embedding, query, query_type, similarity_value))
            indices = list(indices)
            
    else:
        

    """
    indices_im, images_sim = get_indices(similarities_im, similarity_value)
    indices_wo, words_sim = get_indices(similarities_wo, similarity_value)

    indices_im = [int(i) for i in indices_im]
    images_sim = list(np.around(np.array(images_sim),4))
    indices_wo = [int(i) for i in indices_wo]
    words_sim = list(np.around(np.array(words_sim),4))
    # if query is a text query will return results based on the query string
    # if query is an image query will return results based on the query image
    # selecting images to return
    images = images.iloc[indices_im, :]


    # select texts based on image index
    unique_texts = unique_texts.iloc[indices_wo, :]
    images['sim'] = images_sim
    images = images.sort_values(by=['sim'], ascending=False)
    unique_texts['sim'] = words_sim
    unique_texts = unique_texts.sort_values(by=['sim'], ascending=False)

    # building images and word data
    image_index = images.index.tolist()
    images = images.to_numpy()
    image_coords = images[:, [2,3]].tolist()
    image_path = images[:, [0]].tolist()
    images_sim = list(chain.from_iterable(images[:, [4]].tolist()))
    text_ids = []

    for i in range(len(images)):
        try:
            text_string_list = images[i][1].split(',')
        except:
            text_string_list = [-1]
        text_int_list = [int(x) for x in text_string_list]
        text_ids.append(text_int_list)
        
    image_data = {"similarities": images_sim, "labels":image_index,"projection": image_coords,"labelPaths":image_path, "numberOfImages": len(image_index),"textIds": text_ids, "similarityValue": parameters['similarityValue'] / 100 }
    
    word_index = unique_texts.index.tolist()
    unique_texts = unique_texts.to_numpy()

    word_coords = unique_texts[:, [2,3]].tolist()
    word_labels = unique_texts[:, [0]].tolist()
    words_sim = list(chain.from_iterable(unique_texts[:, [4]].tolist()))
    image_ids = []

    for i in range(len(unique_texts)):
        try:
            image_string_list = unique_texts[i][1].split(',')
        except:
            image_string_list = [-1]
        image_int_list = [int(x) for x in image_string_list]
        image_ids.append(image_int_list)
    word_data = {"similarities": words_sim,"labels": word_index,"labelNames":word_labels, "numberOfTexts": len(word_index),"projection":word_coords, "imageIds": image_ids, "imageIndices": image_index, "similarityValue": parameters['similarityValue'] / 100 }

    return jsonify({'texts': word_data, 'images':image_data})

#state
@app.route('/api/state', methods=['POST'])
def get_state():
    parameters = request.get_json()
    # reading datasets
    images = pd.read_csv('images.csv', index_col="Unnamed: 0")
    texts = pd.read_csv('unique_texts.csv', index_col="Unnamed: 0")
    image_ids = parameters['imagesIds']
    text_ids = parameters['textsIds']
    if len(np.shape(parameters["imagesSimilarities"])) > 1:
        im_sim = list(chain.from_iterable(parameters["imagesSimilarities"]))
    else:
        im_sim = parameters["imagesSimilarities"]
    if len(np.shape(parameters["textsSimilarities"])) > 1:
        wo_sim = list(chain.from_iterable(parameters["textsSimilarities"]))
    else:
        wo_sim = parameters["textsSimilarities"]

    images = images.iloc[image_ids, :]
    texts = texts.iloc[text_ids, :]
    # building images and word data
    image_index = images.index.tolist()
    images = images.to_numpy()
    image_coords = images[:, [2,3]].tolist()
    image_path = images[:, [0]].tolist()
    text_ids = []

    for i in range(len(images)):
        try:
            text_string_list = images[i][3].split(',')
        except:
            text_string_list = ["-1"]
        text_int_list = [int(x) for x in text_string_list]
        text_ids.append(text_int_list)

    image_data = {"similarities": im_sim, "labels":image_index,"projection": image_coords,"labelPaths":image_path, "numberOfImages": len(image_index), "textIds": text_ids, "similarityValue": parameters['similarityValue']/100 }
    
    word_index = texts.index.tolist()
    unique_texts = texts.to_numpy()
    word_coords = unique_texts[:, [2,3]].tolist()
    word_labels = unique_texts[:, [0]].tolist()
    image_ids = []

    for i in range(len(unique_texts)):
        try:
            image_string_list = unique_texts[i][3].split(',')
        except:
            image_string_list = ["-1"]
        image_int_list = [int(x) for x in image_string_list]
        image_ids.append(image_int_list)

    word_data = {"similarities": wo_sim,"labels": word_index ,"labelNames":word_labels, "numberOfTexts": len(word_index),"projection":word_coords, "imageIds": image_ids, "imageIndices": image_index, "similarityValue": parameters['similarityValue'] / 100 }
    return jsonify({'texts': word_data, 'images':image_data})

#build new set
@app.route('/api/build_set', methods=['POST'])
def build_new_set():
    parameters = request.get_json()
    # reading datasets
    image_ids = parameters['imagesIds']
    text_ids = parameters['textsIds']
    try:
        im_sim = list(chain.from_iterable(parameters["imagesSimilarities"]))
    except:
        im_sim = parameters["imagesSimilarities"]
    try:
        wo_sim = list(chain.from_iterable(parameters["textsSimilarities"]))
    except: 
        wo_sim = parameters["textsSimilarities"]
    set_type = parameters["setType"]
    non_unique_images = pd.DataFrame({'id': image_ids, 'sim': im_sim})
    non_unique_texts = pd.DataFrame({'id': text_ids, 'sim': wo_sim})
    if set_type == 'union':
        # transforma repetidos em unicos para imagens e textos
        unique_images = non_unique_images.groupby('id', as_index=False).mean()
        unique_texts = non_unique_texts.groupby('id', as_index=False).mean()
    if set_type == 'intersection':
        mask_images = non_unique_images.id.duplicated(keep=False)
        mask_texts = non_unique_texts.id.duplicated(keep=False)
        unique_images = non_unique_images[mask_images].groupby('id', as_index=False).mean()
        unique_texts = non_unique_texts[mask_texts].groupby('id', as_index=False).mean()
    if set_type == 'difference':
        unique_images = pd.DataFrame({'id': image_ids, 'sim': im_sim})
        unique_texts = pd.DataFrame({'id': text_ids, 'sim': wo_sim})
    #cria vetores de unicos
    im_sim = unique_images['sim'].tolist()
    image_ids = unique_images['id'].tolist()
    wo_sim = unique_texts['sim'].tolist()
    text_ids = unique_texts['id'].tolist()

    image_data = {"similarities": im_sim, "labels":image_ids}
    word_data = {"similarities": wo_sim,"labels": text_ids}
    return jsonify({'texts': word_data, 'images':image_data})

if __name__ == '__main__':
    # run web server
    app.run(host=HOST,
            debug=True,  # automatic reloading enabled
            port=PORT)