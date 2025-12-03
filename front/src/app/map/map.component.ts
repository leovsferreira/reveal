import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, Output, EventEmitter } from '@angular/core';
import * as mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css']
})
export class MapComponent implements OnInit, AfterViewInit {
  @ViewChild('mapContainer', { static: false }) private mapContainer!: ElementRef;

  @Output() polygonsChanged = new EventEmitter<any[]>();

  private map!: mapboxgl.Map;
  private draw!: MapboxDraw;
  private accessToken = 'pk.eyJ1IjoibGVvdnNmIiwiYSI6ImNqZDI0NjFmajBwaWwycXBheDg1NHFiczEifQ.7oGXJmnvyx-9ahJw4n9VSg';
  private style = 'mapbox://styles/leovsf/cmi7uzuzt002e01qmdkd15it1';
  private mapInitialized = false;
  public hasData = false;
  private pendingInit = false;

  private selectionMarkers: mapboxgl.Marker[] = [];
  private heatmapData: any = null;
  private locationIndexMap: Map<number, { lon: number, lat: number }> = new Map();

  private isDrawingMode = false;
  public polygons: any[] = [];

  constructor() { }

  ngOnInit(): void {
    (mapboxgl as any).accessToken = this.accessToken;
  }

  ngAfterViewInit(): void {
    if (this.pendingInit) {
      setTimeout(() => this.initializeMap(), 0);
    }
  }

  private initializeMap(): void {
    if (this.mapInitialized) {
      console.log('Map already initialized, skipping');
      return;
    }
    
    if (!this.mapContainer || !this.mapContainer.nativeElement) {
      this.pendingInit = true;
      return;
    }
    
    const container = this.mapContainer.nativeElement;
    if (container.offsetHeight === 0 || container.offsetWidth === 0) {
      console.warn('Map container has no dimensions, retrying...');
      setTimeout(() => this.initializeMap(), 100);
      return;
    }
    
    console.log('Creating new Mapbox instance');
    
    this.map = new mapboxgl.Map({
      container: this.mapContainer.nativeElement,
      style: this.style,
      center: [-87.6298, 41.8781],
      zoom: 10,
      attributionControl: false,
      interactive: true,
      scrollZoom: true,
      boxZoom: true,
      dragRotate: true,
      dragPan: true,
      keyboard: true,
      doubleClickZoom: true,
      touchZoomRotate: true,
      touchPitch: true,
      projection: 'mercator'
    });

    this.map.on('load', () => {
      console.log('Map load event fired');
      
      const logo = this.mapContainer.nativeElement.querySelector('.mapboxgl-ctrl-logo');
      if (logo) {
        (logo as HTMLElement).style.display = 'none';
      }
      
      this.map.resize();
      
      if (this.heatmapData) {
        console.log('Adding heatmap from pending data');
        this.addHeatmapLayer();
      }
      
      this.initializeDrawControl();
    });

    this.mapInitialized = true;
    this.pendingInit = false;
    
    console.log('Map initialization complete');
  }

  private initializeDrawControl(): void {
    if (this.draw) return;
    
    this.draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      defaultMode: 'simple_select'
    });
    
    this.map.addControl(this.draw, 'top-right');

    this.map.on('draw.create', (e) => this.onPolygonCreated(e));
    this.map.on('draw.delete', (e) => this.onPolygonDeleted(e));
    this.map.on('draw.update', (e) => this.onPolygonUpdated(e));
  }


  public toggleDrawMode(): void {
    if (!this.mapInitialized || !this.draw) return;

    this.isDrawingMode = !this.isDrawingMode;
    
    if (this.isDrawingMode) {
      this.draw.changeMode('draw_polygon');
    } else {
      this.draw.changeMode('simple_select');
    }
  }

  public deleteSelectedPolygon(): void {
    if (!this.mapInitialized || !this.draw) return;

    this.isDrawingMode = false;

    const selectedFeatures = this.draw.getSelected();
    
    if (selectedFeatures.features.length > 0) {
      const selectedIds = selectedFeatures.features.map((f: any) => f.id);
      
      selectedIds.forEach((id: string) => {
        this.draw.delete(id);
      });
      
      this.polygons = this.polygons.filter(p => !selectedIds.includes(p.id));
      
      this.polygonsChanged.emit(this.polygons);
      
      console.log(`Deleted ${selectedIds.length} selected polygon(s)`);
      console.log('Remaining polygons:', this.polygons.length);
    } else {
      console.log('No polygon selected for deletion');
    }
  }

  public clearAllPolygons(): void {
    if (!this.mapInitialized || !this.draw) return;

    this.draw.deleteAll();
    
    this.polygons = [];
    
    this.isDrawingMode = false;
    this.draw.changeMode('simple_select');

    this.polygonsChanged.emit(this.polygons);
  }


  private onPolygonCreated(e: any): void {
    const features = e.features;
    features.forEach((feature: any) => {
      this.polygons.push(feature);
    });

    this.isDrawingMode = false;
    
    console.log('Polygon created:', features);
    console.log('Total polygons:', this.polygons.length);
    this.polygonsChanged.emit(this.polygons);
  }

  private onPolygonDeleted(e: any): void {
    const deletedIds = e.features.map((f: any) => f.id);
    this.polygons = this.polygons.filter(p => !deletedIds.includes(p.id));
    
    console.log('Polygon deleted');
    console.log('Total polygons:', this.polygons.length);

    this.polygonsChanged.emit(this.polygons);
  }

  private onPolygonUpdated(e: any): void {
    const updatedFeatures = e.features;
    updatedFeatures.forEach((updated: any) => {
      const index = this.polygons.findIndex(p => p.id === updated.id);
      if (index !== -1) {
        this.polygons[index] = updated;
      }
    });
    
    console.log('Polygon updated');

    this.polygonsChanged.emit(this.polygons);
  }

  public getPolygons(): any[] {
    return this.polygons;
  }

  public getDrawnFeatures(): any {
    if (!this.mapInitialized || !this.draw) return null;
    return this.draw.getAll();
  }

  public isInDrawMode(): boolean {
    return this.isDrawingMode;
  }


  public loadMap(centerLng?: number, centerLat?: number, zoom?: number): void {
    console.log('loadMap called', { 
      centerLng, 
      centerLat, 
      zoom, 
      hasData: this.hasData, 
      mapInitialized: this.mapInitialized 
    });
    
    this.hasData = true;
    this.clearSelectionMarkers();
    
    setTimeout(() => {
      if (!this.mapInitialized) {
        console.log('Map not initialized, will create new instance');
        this.initializeMap();
      } else if (!this.map) {
        console.warn('Map instance missing despite being initialized - resetting');
        this.mapInitialized = false;
        this.initializeMap();
      }
      
      setTimeout(() => {
        if (this.mapInitialized && this.map) {
          console.log('Map ready, resizing and centering');
          this.map.resize();
          
          if (centerLng !== undefined && centerLat !== undefined) {
            this.map.setCenter([centerLng, centerLat]);
            if (zoom !== undefined) {
              this.map.setZoom(zoom);
            }
          }
        } else {
          console.error('Map failed to initialize properly');
        }
      }, 100);
    }, 100);
  }

  public clear(): void {
    console.log('Map clear called');
    
    if (this.mapInitialized && this.map) {
      console.log('Removing existing map instance');
      
      if (this.draw) {
        this.map.removeControl(this.draw);
        this.draw = null as any;
      }
      
      this.map.remove();
      this.map = null as any;
      this.mapInitialized = false;
    }
    
    this.hasData = false;
    this.clearSelectionMarkers();
    this.clearHeatmap();
    this.locationIndexMap.clear();
    this.polygons = [];
    this.isDrawingMode = false;

    this.polygonsChanged.emit(this.polygons);
    
    console.log('Map cleared and destroyed');
  }



  public loadHeatmapData(locations: any[], imageLabels: any[]): void {
    console.log('loadHeatmapData called with', locations.length, 'locations');
    
    this.locationIndexMap.clear();
    locations.forEach((loc, index) => {
      this.locationIndexMap.set(imageLabels[index], { lon: loc.lon, lat: loc.lat });
    });
    
    const features = locations.map(loc => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [loc.lon, loc.lat]
      },
      properties: {
        weight: 1
      }
    }));

    this.heatmapData = {
      type: 'FeatureCollection',
      features: features
    };
    
    console.log('Heatmap data prepared:', this.heatmapData);
    
    const centerLat = locations.reduce((sum, loc) => sum + loc.lat, 0) / locations.length;
    const centerLon = locations.reduce((sum, loc) => sum + loc.lon, 0) / locations.length;
    
    this.loadMap(centerLon, centerLat, 10);
    
    const waitForMap = () => {
      if (this.mapInitialized && this.map && this.map.isStyleLoaded()) {
        console.log('Map ready, adding heatmap layer');
        this.addHeatmapLayer();
      } else {
        console.log('Waiting for map to be ready...');
        setTimeout(waitForMap, 50);
      }
    };
    
    setTimeout(waitForMap, 100);
  }

  private addHeatmapLayer(): void {
    if (!this.heatmapData || !this.mapInitialized) {
      console.log(
        'Cannot add heatmap - mapInitialized:',
        this.mapInitialized,
        'heatmapData exists:',
        !!this.heatmapData
      );
      return;
    }

    console.log('Adding heatmap layer with', this.heatmapData.features.length, 'points');

    if (this.map.getLayer('heatmap-layer')) {
      this.map.removeLayer('heatmap-layer');
    }
    if (this.map.getLayer('heatmap-point')) {
      this.map.removeLayer('heatmap-point');
    }
    if (this.map.getSource('heatmap-source')) {
      this.map.removeSource('heatmap-source');
    }

    this.map.addSource('heatmap-source', {
      type: 'geojson',
      data: this.heatmapData
    });
    console.log('Heatmap source added');

    const layers = this.map.getStyle().layers;
    let firstSymbolId: string | undefined;
    
    if (layers) {
      for (const layer of layers) {
        if (layer.type === 'symbol') {
          firstSymbolId = layer.id;
          break;
        }
      }
    }

    this.map.addLayer({
      id: 'heatmap-layer',
      type: 'heatmap',
      source: 'heatmap-source',
      maxzoom: 15,
      paint: {
        'heatmap-weight': 0.15, 

        'heatmap-intensity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 1,
          15, 3
        ],

        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,    'rgba(254, 240, 217, 0)', 
          0.05, '#fef0d9', 
          0.3,  '#fdcc8a',
          0.5,  '#fc8d59',
          0.8,  '#e34a33',
          1,    '#b30000'
        ],

        'heatmap-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 2,
          15, 20 
        ],

        'heatmap-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          7, 1,
          15, 0.7
        ]
      }
    }, firstSymbolId);


    console.log('Heatmap layer added' + (firstSymbolId ? ' before ' + firstSymbolId : ''));

    this.map.addLayer({
      id: 'heatmap-point',
      type: 'circle',
      source: 'heatmap-source',
      minzoom: 13,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 2,
          18, 6
        ],
        'circle-color': 'rgb(203, 24, 29)',
        'circle-stroke-color': 'white',
        'circle-stroke-width': 1,
        'circle-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 0,
          13, 0.8
        ]
      }
    }, firstSymbolId);
    console.log('Heatmap point layer added');
  }

  private clearHeatmap(): void {
    if (!this.mapInitialized || !this.map) {
      console.log('Cannot clear heatmap - map not initialized');
      this.heatmapData = null;
      return;
    }

    console.log('Clearing heatmap layers');

    try {
      if (this.map.getLayer('heatmap-layer')) {
        this.map.removeLayer('heatmap-layer');
      }
      if (this.map.getLayer('heatmap-point')) {
        this.map.removeLayer('heatmap-point');
      }
      if (this.map.getSource('heatmap-source')) {
        this.map.removeSource('heatmap-source');
      }
    } catch (error) {
      console.error('Error clearing heatmap:', error);
    }
    
    this.heatmapData = null;
  }

  public toggleSelectionMarker(imageIndex: any, show: boolean, from: string): void {
    this.clearSelectionMarkers();

    if (from === 'imageGallery') {
      for (let i = 0; i < imageIndex.labels.length; i++) {
        const label = imageIndex.labels[i];
        const location = this.locationIndexMap.get(label);

        if (!location) {
          console.warn(`No location data for image index ${label}`);
          continue;
        }

        this.addSelectionMarker(location.lon, location.lat, label);
      }
    } else {
      for (let i = 0; i < imageIndex.length; i++) {
        const label = imageIndex[i];
        const location = this.locationIndexMap.get(label);

        if (!location) {
          console.warn(`No location data for image index ${label}`);
          continue;
        }

        this.addSelectionMarker(location.lon, location.lat, label);
      }
    }
  }

  private addSelectionMarker(lng: number, lat: number, imageIndex: number): void {
    if (!this.mapInitialized) {
      setTimeout(() => {
        this.initializeMap();
        setTimeout(() => this.addSelectionMarker(lng, lat, imageIndex), 100);
      }, 100);
      return;
    }

    const marker = new mapboxgl.Marker({
      color: '#97a97c',
      scale: 1.2
    })
      .setLngLat([lng, lat])
      .addTo(this.map);

    const popupContent = `https://storage.googleapis.com/trabalho_final/dataset/llm/processed/${imageIndex}.jpg`;
    const popup = new mapboxgl.Popup({ 
      offset: 25,
      closeButton: false
    })
      .setHTML(`<img src="${popupContent}" style="width: 190px; height: 190px;"></img>`);
    
    marker.setPopup(popup);

    this.selectionMarkers.push(marker);
  }

  public clearSelectionMarkers(): void {
    if (!this.selectionMarkers.length) return;

    this.selectionMarkers.forEach(marker => marker.remove());
    this.selectionMarkers = [];
  }

  flyTo(lng: number, lat: number, zoom: number = 12): void {
    if (!this.mapInitialized) {
      setTimeout(() => {
        this.initializeMap();
        setTimeout(() => this.flyTo(lng, lat, zoom), 100);
      }, 100);
      return;
    }
    
    this.map.flyTo({
      center: [lng, lat],
      zoom: zoom,
      essential: true
    });
  }

  getCenter(): [number, number] {
    if (!this.mapInitialized) return [-87.6298, 41.8781];
    const center = this.map.getCenter();
    return [center.lng, center.lat];
  }

  getZoom(): number {
    if (!this.mapInitialized) return 10;
    return this.map.getZoom();
  }

public loadPolygons(polygons: any[]): void {
  if (!this.mapInitialized || !this.draw) {
    console.log('Map not ready for polygons, waiting...');
    setTimeout(() => this.loadPolygons(polygons), 100);
    return;
  }

  console.log(`Loading ${polygons.length} polygons into map`);

  this.draw.deleteAll();
  this.polygons = [];

  if (!polygons || polygons.length === 0) {
    console.log('No polygons to load');
    return;
  }

  polygons.forEach((polygon: any) => {
    try {
      const ids = this.draw.add(polygon);
      
      if (ids && ids.length > 0) {
        const addedFeature = this.draw.get(ids[0]);
        if (addedFeature) {
          this.polygons.push(addedFeature);
        }
      }
    } catch (error) {
      console.error('Error adding polygon:', error, polygon);
    }
  });

  console.log(`Successfully loaded ${this.polygons.length} polygons`);
  this.polygonsChanged.emit(this.polygons);
}

  public getCurrentPolygons(): any[] {
    return this.polygons.map(p => ({
      ...p,
      type: p.type,
      geometry: p.geometry,
      properties: p.properties || {}
    }));
  }
}
