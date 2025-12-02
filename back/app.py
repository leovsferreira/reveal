from enum import unique
from flask import Flask, jsonify, request
import torch
import pandas as pd
import numpy as np
from flask_cors import CORS
from utils import build_text_tokenizer, calculate_similarities, get_indices, build_tensors, get_torch_device, normalize_similarities, build_image_encoder, build_text_encoder, build_dinov2_model, build_dinov2_query_tensor
from itertools import chain
from flask import current_app

# --- LOADERS ---
def load_images_df(path='./dataset/files/data_final.json'):
    df = pd.read_json(path)
    df = df.reset_index(drop=True)
    return df

def load_texts_df(path='./dataset/files/unique_words_final.json'):
    df = pd.read_json(path)
    df = df.reset_index(drop=True)
    return df

# --- SETUP ---
HOST = '0.0.0.0'
PORT = 8001
app = Flask(__name__)

# Initialize CLIP
app.image_encoder, app.image_preprocess = build_image_encoder()
app.text_encoder = build_text_encoder()
app.text_tokenizer = build_text_tokenizer()

# Initialize DINOv2
app.dinov2_model = build_dinov2_model()

app.torch_device = get_torch_device()
CORS(app)


@app.route('/api/search', methods=['POST'])
def search():
    parameters = request.get_json()
    images = load_images_df('./dataset/files/data_final.json')
    unique_texts = load_texts_df('./dataset/files/unique_words_final.json')

    # Load CLIP Embeddings
    clip_image_embedding = torch.load('./dataset/files/multi_clip_images_embedding.pt', map_location=current_app.torch_device)
    word_embedding = torch.load('./dataset/files/multi_clip_words_embedding.pt', map_location=current_app.torch_device)
    
    # Load DINOv2 Embeddings
    dinov2_image_embedding = torch.load('./dataset/files/dinov2_images_embedding.pt', map_location=current_app.torch_device)

    query_type = parameters['queryType']
    similarity_value = 40 / 100
    
    # 1. Calculate CLIP Similarities (Used for Text Logic & Word Clouds)
    tensors = build_tensors(parameters, query_type, current_app.torch_device, current_app.image_encoder, current_app.image_preprocess, current_app.text_encoder, current_app.text_tokenizer)
    similarities = calculate_similarities(tensors, clip_image_embedding, word_embedding, query_type, current_app.torch_device)
    # Get raw scores
    similarities = [normalize_similarities(sim) for sim in similarities]
    
    similarities_im, similarities_wo = [], []

    # --- MAIN SEARCH LOGIC ---
    
    if query_type == 0: # TEXT QUERY -> Concept Bottleneck
        # Similarities[1][0] is CLIP Text Query vs Concept DB
        concept_scores = similarities[1][0] 
        words_sim = [concept_scores.tolist()] 

        # Initialize image scores
        img_scores_array = np.zeros(len(images))

        # Filter relevant concepts (Noise floor 0.5 for Text-to-Text)
        relevant_indices = np.where(concept_scores > 0.5)[0] 
        # Optimization: Cap at top 200 concepts
        if len(relevant_indices) > 200:
            relevant_indices = np.argsort(concept_scores)[-200:]

        # Map Concepts -> Images
        for c_idx in relevant_indices:
            score = concept_scores[c_idx]
            associated_img_ids = unique_texts.iloc[c_idx]['image_ids']
            
            if isinstance(associated_img_ids, list) and len(associated_img_ids) > 0:
                # Assign concept score to images (MAX pooling)
                img_scores_array[associated_img_ids] = np.maximum(img_scores_array[associated_img_ids], score)
        
        # Structure as 2D list for get_indices: [[ [scores...] ]]
        similarities_im = [ [img_scores_array.tolist()] ]
        similarities_wo = [ words_sim ]

    elif query_type == 1: # IMAGE QUERY -> DINOv2 Logic
        # 1. Build DINO Query Tensor
        dino_query = build_dinov2_query_tensor(
            parameters['imagesQuery'], 
            parameters['from'], 
            current_app.torch_device, 
            current_app.dinov2_model
        )
        
        if dino_query is not None:
            # 2. Calculate DINO Cosine Similarity
            dino_sims = dino_query @ dinov2_image_embedding.to(current_app.torch_device).T
            dino_sims = dino_sims.detach().cpu().numpy()[0] # Flatten
            # Fix nesting: List of Matrices -> List of [Row]
            similarities_im = [ [dino_sims.tolist()] ]
        else:
            # Fallback if DINO fails (empty image?)
            similarities_im = [ [np.zeros(len(images)).tolist()] ]
            
        # 3. For Word Cloud: Query Image (CLIP) vs Text DB
        # FIX: The raw scores are too low (~0.25). We must normalize them to 0-1 range
        # based on the distribution so they pass the threshold.
        raw_text_scores = np.array(similarities[1][0])
        min_v = raw_text_scores.min()
        max_v = raw_text_scores.max()
        # Min-Max normalization + Scaling to ensure top results are ~1.0
        if max_v > min_v:
             norm_text_scores = (raw_text_scores - min_v) / (max_v - min_v)
        else:
             norm_text_scores = raw_text_scores
        
        # Structure correctly as [[ [scores...] ]]
        similarities_wo = [ [norm_text_scores.tolist()] ]

    elif query_type == 2: # COMBINED QUERY -> Hybrid Logic
        # 1. Text Part (Concept-Based)
        txt_concept_scores = similarities[2][0]
        txt_img_scores = np.zeros(len(images))
        
        relevant_indices = np.argsort(txt_concept_scores)[-200:]
        for c_idx in relevant_indices:
            score = txt_concept_scores[c_idx]
            ids = unique_texts.iloc[c_idx]['image_ids']
            if isinstance(ids, list) and len(ids) > 0:
                txt_img_scores[ids] = np.maximum(txt_img_scores[ids], score)

        # 2. Image Part (Use CLIP for consistency in combined mode)
        # similarities[1][0] is CLIP Image Query -> Image DB
        img_direct_scores = similarities[1][0]

        # 3. Average Text Logic + Image Logic
        combined_scores = (txt_img_scores + img_direct_scores) / 2
        
        # Structure as List of Lists for get_indices
        similarities_im = [ [combined_scores.tolist()], [img_direct_scores.tolist()] ]
        similarities_wo = [ [txt_concept_scores.tolist()], [similarities[3][0].tolist()] ]
    
    else: 
        # Fallback
        similarities_im = [similarities[0]]
        similarities_wo = [similarities[1]]

    # --- END LOGIC ---

    # Filter and Sort Results
    indices_im, images_sim = get_indices(similarities_im, similarity_value)
    indices_wo, words_sim = get_indices(similarities_wo, similarity_value)
    
    indices_im = [int(i) for i in indices_im]
    images_sim = list(np.around(np.array(images_sim), 4))
    indices_wo = [int(i) for i in indices_wo]
    words_sim = list(np.around(np.array(words_sim), 4))
    
    images_res = images.iloc[indices_im, :]
    unique_texts_res = unique_texts.iloc[indices_wo, :]
    
    images_res['sim'] = images_sim
    images_res = images_res.sort_values(by=['sim'], ascending=False)
    unique_texts_res['sim'] = words_sim
    unique_texts_res = unique_texts_res.sort_values(by=['sim'], ascending=False)
    
    image_data = format_image_data(images_res, indices_im, images_sim, parameters)
    word_data = format_word_data(unique_texts_res, indices_wo, words_sim, indices_im, parameters)
    
    return jsonify({'texts': word_data, 'images': image_data})

def format_image_data(images_df, indices_im, images_sim, parameters):
    image_index = images_df.index.tolist()

    image_coords = images_df[['x', 'y']].to_numpy().tolist()
    image_path = images_df[['filename']].to_numpy().tolist()

    image_locations = []
    for idx in image_index:
        row = images_df.loc[idx]
        if 'lat' in images_df.columns and 'lon' in images_df.columns:
            lat = row['lat'] if pd.notna(row['lat']) else None
            lon = row['lon'] if pd.notna(row['lon']) else None
            image_locations.append({'lat': lat, 'lon': lon})
        else:
            image_locations.append({'lat': None, 'lon': None})
        
    text_ids_series = images_df['text_ids'] if 'text_ids' in images_df.columns else pd.Series([[]]*len(images_df), index=images_df.index)
    text_ids = []
    for v in text_ids_series.tolist():
        if isinstance(v, list) and len(v) > 0:
            text_ids.append([int(x) for x in v])
        else:
            text_ids.append([-1])

    return {
        "similarities": images_sim,
        "labels": image_index,
        "projection": image_coords,
        "labelPaths": image_path,
        "numberOfImages": len(image_index),
        "textIds": text_ids,
        "locations": image_locations,
        "similarityValue": parameters['similarityValue'] / 100.0
    }

def format_word_data(unique_texts_df, indices_wo, words_sim, indices_im, parameters):
    word_index = unique_texts_df.index.tolist()
    word_coords = unique_texts_df[['x', 'y']].to_numpy().tolist()
    word_labels = unique_texts_df[['word']].to_numpy().tolist()

    image_ids_series = unique_texts_df['image_ids'] if 'image_ids' in unique_texts_df.columns else pd.Series([[]]*len(unique_texts_df), index=unique_texts_df.index)
    image_ids = []
    for v in image_ids_series.tolist():
        if isinstance(v, list) and len(v) > 0:
            image_ids.append([int(x) for x in v])
        else:
            image_ids.append([-1])

    return {
        "similarities": words_sim,
        "labels": word_index,
        "labelNames": word_labels,
        "numberOfTexts": len(word_index),
        "projection": word_coords,
        "imageIds": image_ids,
        "imageIndices": indices_im,
        "similarityValue": parameters['similarityValue'] / 100.0
    }

@app.route('/api/state', methods=['POST'])
def get_state():
    parameters = request.get_json()
    images = load_images_df('./dataset/files/data_final.json')
    texts = load_texts_df('./dataset/files/unique_words_final.json')
    image_ids = parameters['imagesIds']
    text_ids = parameters['textsIds']

    im_sim = flatten_list(parameters["imagesSimilarities"])
    wo_sim = flatten_list(parameters["textsSimilarities"])
    
    images_res = images.iloc[image_ids, :]
    texts_res = texts.iloc[text_ids, :]
    
    image_data = format_image_data(images_res, image_ids, im_sim, parameters)
    word_data = format_word_data(texts_res, text_ids, wo_sim, image_ids, parameters)
    
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
    images = load_images_df('./dataset/files/data_final.json')

    match = images.loc[images['filename'] == image_path, 'output']
    if len(match) == 0:
        return jsonify(""), 200
    return jsonify(match.iloc[0])

if __name__ == '__main__':
    app.run(host=HOST, debug=True, port=PORT)