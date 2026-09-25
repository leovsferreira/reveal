"""Validation and normalization of request bodies (stdlib only)."""
import json
import math
import re
from urllib.parse import unquote

IMAGE_URL_RE = re.compile(r'/(?:thumbnails|processed)/([^?#]+)$')
RUNTIME_NODE_KEYS = frozenset(('x', 'y', 'vx', 'vy', 'fx', 'fy', 'index'))  # force-graph simulation fields
ARRAY_FIELDS = ('textsQuery', 'imagesQuery', 'imagesIds', 'imagesSimilarities', 'textsIds', 'textsSimilarities')
MAX_NAME_LENGTH = 200
MAX_IMAGE_KEY_LENGTH = 255
MAX_IMAGE_REF_LENGTH = 2048  # checked before the URL regex, which is quadratic on crafted input
MAX_IMAGES_PER_REQUEST = 200000
MAX_REPORTED_INVALID = 100


class InvalidInput(ValueError):
    """A request body that is well-formed JSON but not acceptable (HTTP 400)."""

    def __init__(self, code, message, **extra):
        super().__init__(message)
        self.code = code
        self.message = message
        self.extra = extra


def _reject_constant(name):
    raise ValueError('%s is not valid JSON' % name)


def _finite_float(text):
    value = float(text)
    if not math.isfinite(value):
        raise ValueError('number out of range: %s' % text)
    return value


def loads_strict(data):
    """json.loads that rejects NaN/Infinity (and overflowing numbers) with ValueError."""
    return json.loads(data, parse_constant=_reject_constant, parse_float=_finite_float)


def is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _storable(text):
    # Lone surrogates cannot be encoded to UTF-8 for SQLite.
    try:
        text.encode('utf-8')
    except UnicodeEncodeError:
        return False
    return True


def clean_name(value):
    if not isinstance(value, str):
        raise InvalidInput('invalid_name', 'name must be a string')
    name = value.strip()
    if not 1 <= len(name) <= MAX_NAME_LENGTH:
        raise InvalidInput('invalid_name', 'name must be 1-%d characters' % MAX_NAME_LENGTH)
    if not _storable(name):
        raise InvalidInput('invalid_name', 'name contains invalid characters')
    return name


def image_key(value):
    """Dataset filename for a filename or a .../thumbnails/<f> or .../processed/<f> URL; None if invalid."""
    if not isinstance(value, str) or not value.strip():
        return None
    v = value.strip()
    if len(v) > MAX_IMAGE_REF_LENGTH:
        return None
    m = IMAGE_URL_RE.search(v)
    key = unquote(m.group(1)) if m else v
    if not key or len(key) > MAX_IMAGE_KEY_LENGTH:
        return None
    if any(s in key for s in ('/', '\\', '..', ':')) or any(ord(ch) < 32 or ord(ch) == 127 for ch in key):
        return None
    if not _storable(key):
        return None
    return key


def normalize_image_refs(values):
    """Deduped keys in first-seen order; raises InvalidInput if any entry is invalid (nothing is kept)."""
    if not isinstance(values, list):
        raise InvalidInput('invalid_images', 'images must be an array of strings', invalid=[])
    if len(values) > MAX_IMAGES_PER_REQUEST:
        raise InvalidInput('too_many_images', 'At most %d images per request' % MAX_IMAGES_PER_REQUEST)
    keys, seen, invalid = [], set(), []
    invalid_count = 0
    for value in values:
        key = image_key(value)
        if key is None:
            invalid_count += 1
            if len(invalid) < MAX_REPORTED_INVALID:
                invalid.append(value)
        elif key not in seen:
            seen.add(key)
            keys.append(key)
    if invalid_count:
        raise InvalidInput('invalid_images', '%d invalid image reference(s)' % invalid_count,
                           invalid=invalid, invalidCount=invalid_count)
    return keys


def _polygons(value, index):
    if isinstance(value, str):
        try:
            value = loads_strict(value)
        except (ValueError, RecursionError):
            raise InvalidInput('invalid_graph', 'nodes[%d].polygons is not valid JSON' % index)
    return value if isinstance(value, list) else []


def _endpoint(value):
    if isinstance(value, dict):
        value = value.get('id')
    return value if is_int(value) else None


def normalize_graph(body):
    """Strict normalization of {nodes, links} for storage; returns {'links': [...], 'nodes': [...]}."""
    nodes = body.get('nodes')
    links = body.get('links')
    if not isinstance(nodes, list):
        raise InvalidInput('invalid_graph', 'nodes must be an array')
    if not isinstance(links, list):
        raise InvalidInput('invalid_graph', 'links must be an array')

    out_nodes = []
    ids = set()
    for i, node in enumerate(nodes):
        if not isinstance(node, dict):
            raise InvalidInput('invalid_graph', 'nodes[%d] must be an object' % i)
        if not is_int(node.get('id')):
            raise InvalidInput('invalid_graph', 'nodes[%d].id must be an integer' % i)
        clean = {k: v for k, v in node.items() if k not in RUNTIME_NODE_KEYS and not k.startswith('__')}
        for field in ARRAY_FIELDS:
            if field in clean and not isinstance(clean[field], list):
                raise InvalidInput('invalid_graph', 'nodes[%d].%s must be an array' % (i, field))
        if 'polygons' in clean:
            clean['polygons'] = _polygons(clean['polygons'], i)
        # Dead data, but the difference operation reads its length (force-graph.component.ts).
        clean['locationsData'] = []
        ids.add(clean['id'])
        out_nodes.append(clean)

    out_links = []
    for i, link in enumerate(links):
        if not isinstance(link, dict):
            raise InvalidInput('invalid_graph', 'links[%d] must be an object' % i)
        source = _endpoint(link.get('source'))
        target = _endpoint(link.get('target'))
        if source is None or target is None:
            raise InvalidInput('invalid_graph', 'links[%d] endpoints must be node ids' % i)
        if source in ids and target in ids:  # d3 forceLink throws on dangling links when reopened
            out_links.append({'source': source, 'target': target})

    return {'links': out_links, 'nodes': out_nodes}
