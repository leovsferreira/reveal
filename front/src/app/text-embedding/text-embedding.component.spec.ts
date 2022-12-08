import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TextEmbeddingComponent } from './text-embedding.component';

describe('TextEmbeddingComponent', () => {
  let component: TextEmbeddingComponent;
  let fixture: ComponentFixture<TextEmbeddingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TextEmbeddingComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TextEmbeddingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
