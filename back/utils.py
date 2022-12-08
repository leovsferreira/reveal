import clip
from matplotlib.pyplot import text
import torch
import re
import base64
from PIL import Image
import PIL
from io import BytesIO
import numpy as np
from sklearn import preprocessing
import pandas as pd

def build_tensors(parameters, query_type):
    #seta device e chama o modelo do clip
    device = "cpu" if torch.cuda.is_available() else "cpu"
    model, preprocess = clip.load('ViT-B/32', device)
    #textos e imagens provenientes da query
    texts = parameters['textsQuery']
    images = parameters['imagesQuery']
    from_where = parameters['from']
    #variaveis vazias para mudar de valor
    texts_tensors = []
    images_tensors = []
    images_list = []
    #lida com os textos
    if query_type == 0:
        texts_tensors = build_texts_tensors(texts, device, model)
        texts_tensors /= texts_tensors.norm(dim=-1, keepdim=True)
        return texts_tensors
    #lida com as imagens
    elif query_type == 1:
        if from_where == 'searchbar':
            images_tensors = build_images_tensors(images, device, model, preprocess, from_where)
            images_tensors /= images_tensors.norm(dim=-1, keepdim=True)
        else:
            for image_path in images:
                image = Image.open(image_path)
                images_list.append(image)
            images_tensors = build_images_tensors(images_list, device, model, preprocess, from_where)
            images_tensors /= images_tensors.norm(dim=-1, keepdim=True)
        return images_tensors
    #lida com as imagens e os textos
    elif query_type == 2:
        texts_tensors = build_texts_tensors(texts, device, model)
        texts_tensors /= texts_tensors.norm(dim=-1, keepdim=True)
        if from_where == 'searchbar':
            images_tensors = build_images_tensors(images, device, model, preprocess, from_where)
            images_tensors /= images_tensors.norm(dim=-1, keepdim=True)
            #junta os tensores de imagens e textos
        else:
            for image_path in images:
                image = Image.open(image_path)
                images_list.append(image)
            images_tensors = build_images_tensors(images_list, device, model, preprocess, from_where)
            images_tensors /= images_tensors.norm(dim=-1, keepdim=True)
        return texts_tensors, images_tensors

#constroi tensores de textos
def build_texts_tensors(texts, device, model):
    texts_tensors = clip.tokenize(texts).to(device)
    with torch.no_grad():
        texts_tensors = model.encode_text(texts_tensors)
    return texts_tensors

#constroi tensores de imagens
def build_images_tensors(images, device, model, preprocess, from_where):
    images_tensors = []
    if from_where == 'searchbar':
        for image in images:
            image_data = re.sub('^data:image/.+;base64,', '', image)
            image = Image.open(BytesIO(base64.b64decode(image_data)))
            image_tensor = preprocess(image).unsqueeze(0).to(device)
            image_tensor = model.encode_image(image_tensor)
            images_tensors.append(image_tensor)
        #junta todos os tensores de imagens em um único tensor
        images_tensors = torch.cat(images_tensors,dim=0)
        return images_tensors
    else:
        for image in images:
            image_tensor = preprocess(image).unsqueeze(0).to(device)
            image_tensor = model.encode_image(image_tensor)
            images_tensors.append(image_tensor)
        #junta todos os tensores de imagens em um único tensor
        images_tensors = torch.cat(images_tensors,dim=0)
        return images_tensors

def calculate_similarities(tensors, image_embedding, word_embedding, query_type):
    similarities_im_texts = []
    similarities_im_images = []
    similarities_wo_texts = []
    similarities_wo_images = []
    similarities_im = []
    similarities_wo = []
    #se for imagem + texto, lida com os tensores individualmente
    #fazer a média das similaridades de todos os componentes
    if query_type == 2:
        for image_features in image_embedding:
            similarities_im_texts.append((image_features @ tensors[0].T).tolist()) 
            similarities_im_images.append((image_features @ tensors[1].T).tolist())
        for text_features in word_embedding:
            similarities_wo_images.append((text_features @ tensors[0].T).tolist())
            similarities_wo_texts.append((text_features @ tensors[1].T).tolist())
        return [np.transpose(similarities_im_texts),
                np.transpose(similarities_im_images), 
                np.transpose(similarities_wo_texts),
                np.transpose(similarities_wo_images)]
    else:
        for image_features in image_embedding:
            similarities_im.append((image_features @ tensors.T).tolist())
        for text_features in word_embedding:
            similarities_wo.append((text_features @ tensors.T).tolist())
        return [np.transpose(similarities_im), np.transpose(similarities_wo)]


def normalize_similarities(similarities):
    for i in range(len(similarities)):
        max_value = max(similarities[i])
        min_value = min(similarities[i])
        similarities[i] = (similarities[i] - min_value) / (max_value - min_value)
    return similarities

def get_indices(similarities_lists, similarity_value):
    indices = []
    for i in range(len(similarities_lists)):
        for j in range(len(similarities_lists[i])):
            for k in range(len(similarities_lists[i][j])):
                value = similarities_lists[i][j][k]
                if value >= similarity_value:
                    indices.append([k, value])
    i = column(indices, 0)
    sim = column(indices, 1)
    indices_sim_df = pd.DataFrame(data={'indices': i, 'similarities': sim})
    unique_indices_sim_df = indices_sim_df.sort_values('similarities', ascending=False).drop_duplicates('indices').sort_index()
    unique_indices = unique_indices_sim_df['indices'].tolist()
    unique_similarities = unique_indices_sim_df['similarities'].tolist()
    return unique_indices, unique_similarities
    
def column(matrix, i):
    return [row[i] for row in matrix]
"""
def choose_query_based_on_origin(parameters, query_type, images):
    if 'query' in parameters:
        query = parameters['query']
    else:
        ids = parameters['ids']
        if(query_type == 1):
            for i in ids:
                image_path = images.iloc[i, :].image
                query = Image.open('./resized_paintings/' + image_path)
        else:
            for i in range(len(ids)):
                query = parameters['ids'][i]    
    return query
"""