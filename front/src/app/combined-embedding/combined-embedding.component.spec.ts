import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CombinedEmbeddingComponent } from './combined-embedding.component';

describe('CombinedEmbeddingComponent', () => {
  let component: CombinedEmbeddingComponent;
  let fixture: ComponentFixture<CombinedEmbeddingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ CombinedEmbeddingComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CombinedEmbeddingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
