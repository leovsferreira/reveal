import { Component, OnInit, EventEmitter, Output } from '@angular/core';
import { GlobalService } from 'src/app/shared/global.service';

@Component({
  selector: 'app-search-config',
  templateUrl: './search-config.component.html',
  styleUrls: ['./search-config.component.css']
})
export class SearchConfigComponent implements OnInit {
  
 
  @Output() dragBoxToggled = new EventEmitter<number>();
  @Output() similarityChanged = new EventEmitter<number>();
  @Output() clearEmbeddingsSelection = new EventEmitter();
  @Output() toggleCombinedEmbedding = new EventEmitter<boolean>();

  public textInput = '80';
  public searchSelectorDisabled: boolean = true;
  public linkInputDisabled: boolean = false;

  constructor(public global: GlobalService) { }

  ngOnInit(): void { }

  updateTextInput(value: number) {
    this.similarityChanged.emit(value);
  }

  onDragBoxToggle() {
    this.dragBoxToggled.emit();
  }

  onLinkChange(event: any) {
    const embedding_link = this.global.getGlobal("embedding_link");
    embedding_link.value = event.target.value;
    this.global.setGlobal(embedding_link);

    if(event.target.value == "link") this.searchSelectorDisabled = true;
    else this.searchSelectorDisabled = false;

  }

  onSearchModeChange(event: any) {
    const embedding_search_mode = this.global.getGlobal("embedding_search_mode");
    embedding_search_mode.value = event.target.value;
    this.global.setGlobal(embedding_search_mode);

    if(event.target.value == "simple search") this.linkInputDisabled = false;
    else this.linkInputDisabled = true;
    
    this.clearEmbeddingsSelection.emit();
  }

  toggleCombinedDisplay(event: any) {
    this.toggleCombinedEmbedding.emit(event.checked);
  }

  formatLabel(value: number) {
    return value;
  }
}
