import { Component, OnInit, EventEmitter, Output } from '@angular/core';
import { AuthService } from '../shared/services/auth.service';
import { StateService } from '../shared/services/state.service';
import { NgxSpinnerService } from "ngx-spinner";
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-state',
  templateUrl: './state.component.html',
  styleUrls: ['./state.component.css']
})
export class StateComponent implements OnInit {

  public savedStates: any = [];
  public lastRightClick: number = 0;

  @Output() changeStateStatus = new EventEmitter<any>();
  @Output() statesChanged = new EventEmitter();
  @Output() setFy = new EventEmitter();
  constructor(public authService: AuthService, public stateService: StateService, private spinner: NgxSpinnerService) { }

  ngOnInit(): void {
  }

  saveState(stateName: string, forceGraphData: any) {
    this.spinner.show();
    const query = this.stateService.saveUserStates(stateName, forceGraphData);
    query.then((data:any) => {
      this.savedStates = data;
      setTimeout(() => {  
        for(let i = 0; i < this.savedStates.length; i++) {
          if(this.savedStates[i].name == stateName) {
            const state = this.stateService.getSavedState(this.savedStates[i].id);
            this.changeStateStatus.emit(state);
          }
        }
        this.statesChanged.emit();
        this.spinner.hide();
      },
      1000);
    });
  }

  updateState(stateName: string, forceGraphData: any) {
    this.spinner.show();
    const query = this.stateService.updateUserStates(stateName, forceGraphData);
    
    query.then((data:any) => {
      this.savedStates = data;
      setTimeout(() => {  
        for(let i = 0; i < this.savedStates.length; i++) {
          if(this.savedStates[i].name == stateName) {
            const state = this.stateService.getSavedState(this.savedStates[i].id);
            this.changeStateStatus.emit(state);
          }
        }
        this.statesChanged.emit();
        this.setFy.emit();
        this.spinner.hide();
      },
      1000);
    });
  }

  openState(stateId: number) {
    const state = this.stateService.getSavedState(stateId);
    this.changeStateStatus.emit(state);
  }

  destroyState(stateId: number) {
    let bool = confirm("Do you want to exclude this state?");
    if(bool) {
      this.spinner.show();
      const query = this.stateService.destroyState(stateId);
      query.then((data:any) => {
        console.log(data)
        this.savedStates = data;
        setTimeout(() => {  
          this.changeStateStatus.emit(-1);
          this.statesChanged.emit();
          this.spinner.hide();
        },
        1000);
      });
    }
  }
}
