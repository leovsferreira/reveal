import open_clip
import torch
import re
import base64
from PIL import Image
from io import BytesIO
import numpy as np
import pandas as pd
from multilingual_clip import pt_multilingual_clip
from transformers import AutoTokenizer

def build_tensors(parameters, query_type, device, image_encoder, image_preprocess, text_encoder, text_tokenizer):
    texts = parameters['textsQuery']
    images = parameters['imagesQuery']
    from_where = parameters['from']
    
    if query_type == 0:
        texts_tensors = build_texts_tensors(texts, text_encoder, text_tokenizer, device)
        return normalize_tensors(texts_tensors)
    elif query_type == 1:
        images_tensors = build_images_tensors(images, device, image_encoder, image_preprocess, from_where)
        return normalize_tensors(images_tensors)
    else:
        texts_tensors = build_texts_tensors(texts, text_encoder, text_tokenizer, device)
        images_tensors = build_images_tensors(images, device, image_encoder, image_preprocess, from_where)
        return normalize_tensors(texts_tensors), normalize_tensors(images_tensors)

def build_texts_tensors(texts, model, tokenizer, device):
    with torch.no_grad():
        return model.forward(texts, tokenizer).to(device)

def build_images_tensors(images, device, model, preprocess, from_where):
    images_tensors = []
    if from_where == 'searchbar':
        images_tensors = [process_image_from_base64(image, device, model, preprocess) for image in images]
    else:
        images_list = [Image.open(image_path) for image_path in images]
        images_tensors = [process_image(image, device, model, preprocess) for image in images_list]
    
    return torch.cat(images_tensors, dim=0)

def process_image_from_base64(image, device, model, preprocess):
    image_data = re.sub('^data:image/.+;base64,', '', image)
    image = Image.open(BytesIO(base64.b64decode(image_data)))
    return process_image(image, device, model, preprocess)

def process_image(image, device, model, preprocess):
    image_tensor = preprocess(image).unsqueeze(0).to(device)
    with torch.no_grad():
        return model.encode_image(image_tensor)

def normalize_tensors(tensors):
    return tensors / tensors.norm(dim=-1, keepdim=True)

def calculate_similarities(tensors, image_embedding, word_embedding, query_type, device):
    if query_type == 2:
        similarities_im_texts = [image_features.to(device) @ tensors[0].T for image_features in image_embedding]
        similarities_im_images = [image_features.to(device) @ tensors[1].T for image_features in image_embedding]
        similarities_wo_texts = [text_features.to(device) @ tensors[0].T for text_features in word_embedding]
        similarities_wo_images = [text_features.to(device) @ tensors[1].T for text_features in word_embedding]
        return [
            np.transpose(torch.stack(similarities_im_texts).cpu().numpy()), 
            np.transpose(torch.stack(similarities_im_images).cpu().numpy()), 
            np.transpose(torch.stack(similarities_wo_texts).cpu().numpy()), 
            np.transpose(torch.stack(similarities_wo_images).cpu().numpy())
        ]
    else:
        similarities_im = [image_features.to(device) @ tensors.T for image_features in image_embedding]
        similarities_wo = [text_features.to(device) @ tensors.T for text_features in word_embedding]
        return [
            np.transpose(torch.stack(similarities_im).cpu().numpy()), 
            np.transpose(torch.stack(similarities_wo).cpu().numpy())
        ]

def normalize_similarities(similarities):
    return [(sim - np.min(sim)) / (np.max(sim) - np.min(sim)) for sim in similarities]

def get_indices(similarities_lists, similarity_value):
    indices = [(k, value) for sim_list in similarities_lists for j, sim in enumerate(sim_list) for k, value in enumerate(sim) if value >= similarity_value]
    unique_indices_sim_df = pd.DataFrame(indices, columns=['indices', 'similarities']).drop_duplicates('indices').sort_values('similarities', ascending=False)
    return unique_indices_sim_df['indices'].tolist(), unique_indices_sim_df['similarities'].tolist()

def build_image_encoder():
    device = get_torch_device()
    model, _, preprocess = open_clip.create_model_and_transforms('ViT-B-16-plus-240', pretrained="laion400m_e32")
    model.to(device)
    return model, preprocess

def build_text_encoder():
    model_name = 'M-CLIP/XLM-Roberta-Large-Vit-B-16Plus'
    model = pt_multilingual_clip.MultilingualCLIP.from_pretrained(model_name)
    return model

def build_text_tokenizer():
    model_name = 'M-CLIP/XLM-Roberta-Large-Vit-B-16Plus'
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    return tokenizer

def get_torch_device():
    return "cuda" if torch.cuda.is_available() else "cpu"