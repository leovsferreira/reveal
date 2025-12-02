import clip
import torch
import re
import base64
from PIL import Image
from io import BytesIO
import numpy as np
import pandas as pd
import torchvision.transforms as T

# --- DEVICE & MODEL SETUP ---

def get_torch_device():
    return "cuda" if torch.cuda.is_available() else "cpu"

def build_image_encoder():
    device = get_torch_device()
    model, preprocess = clip.load("ViT-B/32", device=device)
    model.eval()
    return model, preprocess

def build_text_encoder():
    device = get_torch_device()
    model, _ = clip.load("ViT-B/32", device=device)
    model.eval()
    return model

def build_text_tokenizer():
    return clip.tokenize

# --- DINOv2 SETUP ---

# Standard ImageNet normalization for DINOv2
dinov2_transform = T.Compose([
    T.Resize(256, interpolation=T.InterpolationMode.BICUBIC),
    T.CenterCrop(224),
    T.ToTensor(),
    T.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
])

def build_dinov2_model():
    device = get_torch_device()
    print(f"Loading DINOv2 on {device}...")
    # Load ViT-Small (vits14) for balance of speed/performance
    model = torch.hub.load('facebookresearch/dinov2', 'dinov2_vits14').to(device)
    model.eval()
    return model

def build_dinov2_query_tensor(images, from_where, device, model):
    """
    Processes query images using DINOv2 transforms and encoder.
    Returns a normalized, averaged tensor.
    """
    tensors = []
    
    for img_source in images:
        img = None
        try:
            if from_where == 'searchbar':
                # Handle Base64 string
                image_data = re.sub('^data:image/.+;base64,', '', img_source)
                img = Image.open(BytesIO(base64.b64decode(image_data))).convert('RGB')
            else:
                # Handle File Path
                img = Image.open(img_source).convert('RGB')
            
            tensors.append(dinov2_transform(img))
        except Exception as e:
            print(f"Error processing DINO image: {e}")
            continue

    if not tensors:
        return None

    # Stack into batch (N, 3, 224, 224)
    batch = torch.stack(tensors).to(device)
    
    with torch.no_grad():
        embedding = model(batch) # Output: (N, 384) for ViT-S
        # Normalize
        embedding = embedding / embedding.norm(dim=-1, keepdim=True)
        # Average if multiple images provided
        mean_embedding = torch.mean(embedding, dim=0, keepdim=True)
        # Re-normalize result
        return mean_embedding / mean_embedding.norm(dim=-1, keepdim=True)

# --- CLIP TENSOR BUILDING ---

def build_tensors(parameters, query_type, device, image_encoder, image_preprocess, text_encoder, text_tokenizer):
    texts = parameters['textsQuery']
    images = parameters['imagesQuery']
    from_where = parameters['from']
    
    # NOTE: Using torch.mean to average inputs ensures robust "Concept" vectors
    if query_type == 0:
        texts_tensors = build_texts_tensors(texts, text_encoder, text_tokenizer, device)
        return normalize_tensors(torch.mean(texts_tensors, dim=0, keepdim=True))
    elif query_type == 1:
        images_tensors = build_images_tensors(images, device, image_encoder, image_preprocess, from_where)
        return normalize_tensors(torch.mean(images_tensors, dim=0, keepdim=True))
    else:
        texts_tensors = build_texts_tensors(texts, text_encoder, text_tokenizer, device)
        images_tensors = build_images_tensors(images, device, image_encoder, image_preprocess, from_where)
        return (normalize_tensors(torch.mean(texts_tensors, dim=0, keepdim=True)), 
                normalize_tensors(torch.mean(images_tensors, dim=0, keepdim=True)))


def build_texts_tensors(texts, model, tokenizer, device):
    texts = [str(t) if str(t).strip() else "[EMPTY]" for t in texts]
    with torch.no_grad():
        tokens = tokenizer(texts).to(device)
        text_features = model.encode_text(tokens)
        text_features = text_features.float()
        return text_features.to(device)


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
    if image.mode != "RGB":
        image = image.convert("RGB")
    image_tensor = preprocess(image).unsqueeze(0).to(device)
    with torch.no_grad():
        image_features = model.encode_image(image_tensor)
        image_features = image_features.float()
        return image_features.to(device)


def normalize_tensors(tensors):
    return tensors / tensors.norm(dim=-1, keepdim=True)


def calculate_similarities(tensors, image_embedding, word_embedding, query_type, device):
    # Standard CLIP Matrix Multiplication
    if query_type == 2:
        texts_tensors, images_tensors = tensors
        similarities_im_texts = [image_features.to(device) @ texts_tensors.T for image_features in image_embedding]
        similarities_im_images = [image_features.to(device) @ images_tensors.T for image_features in image_embedding]
        similarities_wo_texts = [text_features.to(device) @ texts_tensors.T for text_features in word_embedding]
        similarities_wo_images = [text_features.to(device) @ images_tensors.T for text_features in word_embedding]
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
    # Return RAW scores. 
    # With Concept-Based matching and DINOv2, scores are naturally high (0.6 - 0.9).
    # No artificial scaling needed.
    return similarities


def get_indices(similarities_lists, similarity_value):
    indices = [
        (k, value)
        for sim_list in similarities_lists
        for j, sim in enumerate(sim_list)
        for k, value in enumerate(sim)
        if value >= similarity_value
    ]
    unique_indices_sim_df = (
        pd.DataFrame(indices, columns=['indices', 'similarities'])
        .drop_duplicates('indices')
        .sort_values('similarities', ascending=False)
    )
    return unique_indices_sim_df['indices'].tolist(), unique_indices_sim_df['similarities'].tolist()