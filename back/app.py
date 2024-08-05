from enum import unique
from flask import Flask, jsonify, request
import torch
import pandas as pd
import numpy as np
from flask_cors import CORS
from utils import build_text_tokenizer, calculate_similarities, get_indices, build_tensors, get_torch_device, normalize_similarities, build_image_encoder, build_text_encoder
from itertools import chain
from flask import current_app

# declare constants
HOST = '0.0.0.0'
PORT = 8001
# initialize flask application
app = Flask(__name__)
app.image_encoder, app.image_preprocess = build_image_encoder()
app.text_encoder = build_text_encoder()
app.text_tokenizer = build_text_tokenizer()
app.torch_device = get_torch_device()

CORS(app)

@app.route('/api/search', methods=['POST'])
def search():
    # get parameters from request
    parameters = request.get_json()
    # reading datasets
    images = pd.read_csv('multi_clip_images_sidewalk.csv', index_col="Unnamed: 0")
    unique_texts = pd.read_csv('multi_clip_unique_texts_sidewalk.csv', index_col="Unnamed: 0")
    # load image embedding
    image_embedding = torch.load('multi_clip_image_tensors_sidewalk.pt', map_location=current_app.torch_device)
    # load word embedding
    word_embedding = torch.load('multi_clip_word_tensors_sidewalk.pt', map_location=current_app.torch_device)

    query_type = parameters['queryType']
    similarity_value = parameters['similarityValue'] / 100
    
    tensors = build_tensors(parameters, query_type, current_app.torch_device, current_app.image_encoder, current_app.image_preprocess, current_app.text_encoder, current_app.text_tokenizer)
    
    # Calculate similarities
    similarities = calculate_similarities(tensors, image_embedding, word_embedding, query_type, current_app.torch_device)
    # Normalize similarities
    similarities = [normalize_similarities(sim) for sim in similarities]
    
    similarities_im, similarities_wo = [], []
    if query_type == 2:
        similarities_im = [similarities[0], similarities[1]]
        similarities_wo = [similarities[2], similarities[3]]
    else:
        similarities_im = [similarities[0]]
        similarities_wo = [similarities[1]]
    
    indices_im, images_sim = get_indices(similarities_im, similarity_value)
    indices_wo, words_sim = get_indices(similarities_wo, similarity_value)
    
    indices_im = [int(i) for i in indices_im]
    images_sim = list(np.around(np.array(images_sim), 4))
    indices_wo = [int(i) for i in indices_wo]
    words_sim = list(np.around(np.array(words_sim), 4))
    
    # Selecting images and texts based on indices
    images = images.iloc[indices_im, :]
    unique_texts = unique_texts.iloc[indices_wo, :]
    
    images['sim'] = images_sim
    images = images.sort_values(by=['sim'], ascending=False)
    unique_texts['sim'] = words_sim
    unique_texts = unique_texts.sort_values(by=['sim'], ascending=False)
    
    image_data = format_image_data(images, indices_im, images_sim, parameters)
    word_data = format_word_data(unique_texts, indices_wo, words_sim, indices_im, parameters)
    
    return jsonify({'texts': word_data, 'images': image_data})

def format_image_data(images, indices_im, images_sim, parameters):
    image_index = images.index.tolist()
    images = images.to_numpy()
    image_coords = images[:, [2, 3]].tolist()
    image_path = images[:, [0]].tolist()
    text_ids = [
                list(map(int, img[1].split(','))) if isinstance(img[1], str) and img[1] else [-1]
                for img in images
            ]

    return {
        "similarities": images_sim,
        "labels": image_index,
        "projection": image_coords,
        "labelPaths": image_path,
        "numberOfImages": len(image_index),
        "textIds": text_ids,
        "similarityValue": parameters['similarityValue'] / 100
    }

def format_word_data(unique_texts, indices_wo, words_sim, indices_im, parameters):
    word_index = unique_texts.index.tolist()
    unique_texts = unique_texts.to_numpy()
    word_coords = unique_texts[:, [2, 3]].tolist()
    word_labels = unique_texts[:, [0]].tolist()
    image_ids = [list(map(int, txt[1].split(','))) if txt[1] else [-1] for txt in unique_texts]

    return {
        "similarities": words_sim,
        "labels": word_index,
        "labelNames": word_labels,
        "numberOfTexts": len(word_index),
        "projection": word_coords,
        "imageIds": image_ids,
        "imageIndices": indices_im,
        "similarityValue": parameters['similarityValue'] / 100
    }

@app.route('/api/state', methods=['POST'])
def get_state():
    parameters = request.get_json()
    images = pd.read_csv('multi_clip_images_sidewalk.csv', index_col="Unnamed: 0")
    texts = pd.read_csv('multi_clip_unique_texts_sidewalk.csv', index_col="Unnamed: 0")
    image_ids = parameters['imagesIds']
    text_ids = parameters['textsIds']

    im_sim = flatten_list(parameters["imagesSimilarities"])
    wo_sim = flatten_list(parameters["textsSimilarities"])
    
    images = images.iloc[image_ids, :]
    texts = texts.iloc[text_ids, :]
    
    image_data = format_image_data(images, image_ids, im_sim, parameters)
    word_data = format_word_data(texts, text_ids, wo_sim, image_ids, parameters)
    
    return jsonify({'texts': word_data, 'images': image_data})

def flatten_list(nested_list):
    return list(chain.from_iterable(nested_list)) if len(np.shape(nested_list)) > 1 else nested_list

@app.route('/api/build_set', methods=['POST'])
def build_new_set():
    parameters = request.get_json()
    image_ids = parameters['imagesIds']
    text_ids = parameters['textsIds']

    im_sim = flatten_list(parameters["imagesSimilarities"])
    wo_sim = flatten_list(parameters["textsSimilarities"])
    
    set_type = parameters["setType"]
    unique_images, unique_texts = aggregate_sets(image_ids, im_sim, text_ids, wo_sim, set_type)
    
    image_data = {"similarities": unique_images['sim'].tolist(), "labels": unique_images['id'].tolist()}
    word_data = {"similarities": unique_texts['sim'].tolist(), "labels": unique_texts['id'].tolist()}
    
    return jsonify({'texts': word_data, 'images': image_data})

def aggregate_sets(image_ids, im_sim, text_ids, wo_sim, set_type):
    non_unique_images = pd.DataFrame({'id': image_ids, 'sim': im_sim})
    non_unique_texts = pd.DataFrame({'id': text_ids, 'sim': wo_sim})
    
    if set_type == 'union':
        unique_images = non_unique_images.groupby('id', as_index=False).mean()
        unique_texts = non_unique_texts.groupby('id', as_index=False).mean()
    elif set_type == 'intersection':
        mask_images = non_unique_images.id.duplicated(keep=False)
        mask_texts = non_unique_texts.id.duplicated(keep=False)
        unique_images = non_unique_images[mask_images].groupby('id', as_index=False).mean()
        unique_texts = non_unique_texts[mask_texts].groupby('id', as_index=False).mean()
    else:  # set_type == 'difference'
        unique_images = non_unique_images
        unique_texts = non_unique_texts
    
    return unique_images, unique_texts

@app.route('/api/info', methods=['POST'])
def get_info():
    parameters = request.get_json()
    image_path = parameters['string']
    df = pd.read_csv("sidewalk_final_texts.csv")
    text = df.loc[df['image_paths'] == image_path, 'text'].item()
    return jsonify(text)

if __name__ == '__main__':
    app.run(host=HOST, debug=True, port=PORT)