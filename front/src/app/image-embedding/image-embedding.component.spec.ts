import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImageEmbeddingComponent } from './image-embedding.component';

describe('ImageEmbeddingComponent', () => {
  let component: ImageEmbeddingComponent;
  let fixture: ComponentFixture<ImageEmbeddingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ImageEmbeddingComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ImageEmbeddingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
